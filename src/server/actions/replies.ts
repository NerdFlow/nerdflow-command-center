"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { setNextStep, setStage } from "@/server/actions/deals";
import { callClaudeJSON, AiUnavailableError } from "@/server/ai/client";
import { SYSTEM_PROMPT, buildUserPrompt, buildRewritePrompt, PROMPT_VERSION } from "@/server/ai/prompts/reply-classification";
import { campaignStrategySchema } from "@/server/strategy";
import type { LostReason } from "@prisma/client";

const classificationSchema = z.object({
  class: z.enum(["interested", "not_now", "objection", "question", "unsubscribe", "out_of_office", "wrong_person"]),
  follow_up_date: z.string().nullable(),
  objection: z.string(),
  referral: z.string(),
  draft_reply: z.string(),
  why: z.string(),
});

const rewriteSchema = z.object({ draft_reply: z.string() });

async function loadReplyForUser(replyId: string) {
  const user = await requireUser();
  const reply = await prisma.reply.findFirst({
    where: { id: replyId, organizationId: user.organizationId },
    include: { lead: { include: { campaign: { include: { product: true } }, owner: true } } },
  });
  if (!reply) throw new Error("Reply not found");
  if (user.role === "rep" && reply.lead.ownerId !== user.id) throw new Error("Not your lead");
  return { user, reply };
}

/** Ensure-or-find the lead's single open deal, same pattern as logTouchOutcome (src/server/actions/touches.ts). */
async function findOrCreateOpenDeal(lead: { id: string; ownerId: string; campaignId: string; campaign: { productId: string } }, organizationId: string) {
  const existing = await prisma.deal.findFirst({ where: { leadId: lead.id, stage: { notIn: ["won", "lost"] } } });
  if (existing) return existing;
  return prisma.deal.create({
    data: {
      organizationId,
      leadId: lead.id,
      ownerId: lead.ownerId,
      productId: lead.campaign.productId,
      campaignId: lead.campaignId,
      stage: "interested",
    },
  });
}

export async function getReplyDetail(replyId: string) {
  const { reply } = await loadReplyForUser(replyId);
  const [touches, priorReplies, openDeal] = await Promise.all([
    prisma.touch.findMany({ where: { leadId: reply.leadId }, orderBy: { occurredAt: "desc" }, take: 10 }),
    prisma.reply.findMany({ where: { leadId: reply.leadId, id: { not: reply.id } }, orderBy: { receivedAt: "desc" }, take: 10 }),
    prisma.deal.findFirst({ where: { leadId: reply.leadId, stage: { notIn: ["won", "lost"] } } }),
  ]);

  const history = [
    ...touches.map((t) => ({ kind: "touch" as const, channel: t.channel, label: t.outcome, at: t.occurredAt })),
    ...priorReplies.map((r) => ({ kind: "reply" as const, channel: r.channel, label: "replied", at: r.receivedAt })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return {
    reply: { ...reply, lead: undefined },
    lead: {
      id: reply.lead.id,
      businessName: reply.lead.businessName,
      contactName: reply.lead.contactName,
      email: reply.lead.email,
      phone: reply.lead.phone,
      status: reply.lead.status,
    },
    hasOpenDeal: Boolean(openDeal),
    dealId: openDeal?.id ?? null,
    history: history.map((h) => ({ ...h, at: h.at.toISOString() })),
  };
}

/** Real AI call through the gateway — falls back to nothing (no fake classification) if AI is unavailable. */
export async function classifyReply(replyId: string) {
  const { user, reply } = await loadReplyForUser(replyId);
  const strategy = campaignStrategySchema.safeParse(reply.lead.campaign.strategy);

  try {
    const result = await callClaudeJSON({
      feature: "reply_classification",
      organizationId: user.organizationId,
      userId: user.id,
      system: SYSTEM_PROMPT,
      prompt: buildUserPrompt({
        business: reply.lead.businessName,
        contactName: reply.lead.contactName,
        productName: reply.lead.campaign.product.name,
        productSummary: reply.lead.campaign.product.summary,
        campaignSummary: strategy.success ? strategy.data.summary : "",
        objections: strategy.success ? strategy.data.objections.map((o) => ({ question: o.question, answer: o.answer })) : [],
        reply: reply.text,
      }),
      schema: classificationSchema,
      maxTokens: 700,
    });

    await prisma.reply.update({ where: { id: replyId }, data: { label: result.class, responseDraft: result.draft_reply } });
    revalidatePath("/replies");
    return { source: "ai" as const, promptVersion: PROMPT_VERSION, ...result };
  } catch (err) {
    if (!(err instanceof AiUnavailableError)) throw err;
    return { source: "unavailable" as const, reason: err.message };
  }
}

export async function rewriteReplyDraft(replyId: string, instruction: "shorter" | "casual" | "new_angle") {
  const { user, reply } = await loadReplyForUser(replyId);
  if (!reply.responseDraft) throw new Error("Classify the reply first before rewriting.");

  const draft = await callClaudeJSON({
    feature: "reply_classification",
    organizationId: user.organizationId,
    userId: user.id,
    system: SYSTEM_PROMPT,
    prompt: buildRewritePrompt({ currentDraft: reply.responseDraft, instruction }),
    schema: rewriteSchema,
    maxTokens: 400,
  });

  await prisma.reply.update({ where: { id: replyId }, data: { responseDraft: draft.draft_reply } });
  revalidatePath("/replies");
  return draft.draft_reply;
}

async function markHandled(replyId: string) {
  await prisma.reply.update({ where: { id: replyId }, data: { status: "handled", handledAt: new Date() } });
  revalidatePath("/replies");
  revalidatePath("/today");
}

/** "Mark as sent" — logs the send as a touch and, if this reply was AI-classified interested, ensures a deal exists. */
export async function markReplySent(replyId: string) {
  const { user, reply } = await loadReplyForUser(replyId);
  await prisma.touch.create({
    data: {
      organizationId: user.organizationId,
      leadId: reply.leadId,
      userId: user.id,
      channel: reply.channel,
      step: reply.lead.cadenceStep,
      outcome: "sent",
      body: reply.responseDraft,
      occurredAt: new Date(),
    },
  });
  if (reply.label === "interested") {
    const deal = await findOrCreateOpenDeal(reply.lead, user.organizationId);
    await prisma.lead.update({ where: { id: reply.leadId }, data: { status: "deal" } });
    void deal;
  }
  await markHandled(replyId);
}

export async function bookMeetingFromReply(replyId: string, whenISO: string, note: string) {
  const { user, reply } = await loadReplyForUser(replyId);
  const deal = await findOrCreateOpenDeal(reply.lead, user.organizationId);
  await prisma.lead.update({ where: { id: reply.leadId }, data: { status: "deal" } });
  await setNextStep(deal.id, note || "Meeting booked from reply", whenISO);
  await markHandled(replyId);
  return { dealId: deal.id };
}

export async function snoozeReply(replyId: string) {
  await loadReplyForUser(replyId);
  await prisma.reply.update({ where: { id: replyId }, data: { status: "snoozed" } });
  revalidatePath("/replies");
}

export async function closeLeadFromReply(replyId: string, reason: LostReason) {
  const { user, reply } = await loadReplyForUser(replyId);
  const openDeal = await prisma.deal.findFirst({ where: { leadId: reply.leadId, stage: { notIn: ["won", "lost"] } } });
  if (openDeal) {
    await setStage(openDeal.id, "lost", reason);
  } else {
    await prisma.lead.update({ where: { id: reply.leadId }, data: { status: "not_fit" } });
  }
  await writeAuditLog({
    organizationId: user.organizationId,
    actorId: user.id,
    action: "lead_closed_from_reply",
    entityType: "lead",
    entityId: reply.leadId,
    after: { reason },
  });
  await markHandled(replyId);
}

/** The one-click "unsubscribe -> do_not_contact" apply from SPEC 5.10 — never automatic, always a deliberate click. */
export async function applyUnsubscribe(replyId: string) {
  const { user, reply } = await loadReplyForUser(replyId);
  await prisma.lead.update({ where: { id: reply.leadId }, data: { status: "do_not_contact" } });
  await writeAuditLog({
    organizationId: user.organizationId,
    actorId: user.id,
    action: "lead_do_not_contact",
    entityType: "lead",
    entityId: reply.leadId,
    after: { reason: "unsubscribe reply" },
  });
  await markHandled(replyId);
}

export async function searchMyLeads(query: string) {
  const user = await requireUser();
  if (!query.trim()) return [];
  const leads = await prisma.lead.findMany({
    where: {
      organizationId: user.organizationId,
      businessName: { contains: query, mode: "insensitive" },
      ...(user.role === "rep" ? { ownerId: user.id } : {}),
    },
    select: { id: true, businessName: true, city: true },
    take: 8,
  });
  return leads;
}

export async function logManualReply(leadId: string, channel: "call" | "email" | "instagram" | "linkedin", text: string) {
  const user = await requireUser();
  const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId: user.organizationId } });
  if (!lead) throw new Error("Lead not found");
  if (user.role === "rep" && lead.ownerId !== user.id) throw new Error("Not your lead");

  const reply = await prisma.reply.create({
    data: { organizationId: user.organizationId, leadId, channel, text, status: "open" },
  });
  await prisma.lead.update({ where: { id: leadId }, data: { status: "replied" } });
  revalidatePath("/replies");
  return reply.id;
}
