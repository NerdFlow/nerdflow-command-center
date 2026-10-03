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
import {
  leadStatusForConfirmedReply,
  outreachStopped,
  REPLY_LABELS,
  withStopOutreach,
} from "@/lib/replyLog";
import type { LostReason, Prisma, ReplyLabel } from "@prisma/client";

const classificationSchema = z.object({
  class: z.enum(["interested", "not_now", "objection", "question", "unsubscribe", "out_of_office", "wrong_person"]),
  follow_up_date: z.string().nullable(),
  objection: z.string(),
  referral: z.string(),
  draft_reply: z.string(),
  why: z.string(),
});

const rewriteSchema = z.object({ draft_reply: z.string() });

/** Reps can work a lead they own, or a Focus card that was routed to them. */
async function assertCanWorkLead(user: { id: string; role: string; organizationId: string }, lead: { id: string; ownerId: string }) {
  if (user.role !== "rep" || lead.ownerId === user.id) return;
  const assigned = await prisma.pipelineTodayRow.findFirst({
    where: { leadId: lead.id, ownerId: user.id, organizationId: user.organizationId },
    select: { id: true },
  });
  if (!assigned) throw new Error("Not your lead");
}

async function loadReplyForUser(replyId: string) {
  const user = await requireUser();
  const reply = await prisma.reply.findFirst({
    where: { id: replyId, organizationId: user.organizationId },
    include: { lead: { include: { campaign: { include: { product: true } }, owner: true } } },
  });
  if (!reply) throw new Error("Reply not found");
  await assertCanWorkLead(user, reply.lead);
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

/** Summary strip + "Waiting on you" + "Did they reply?" for the stacked Replies page. */
export async function getRepliesOverview() {
  const user = await requireUser();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  const leadScope = repliesLeadScope(user.id, user.organizationId);
  const [openReplies, loggedReplies, messagedThisWeek, repliedThisWeek, sentTouches] = await Promise.all([
    prisma.reply.findMany({
      where: { status: "open", lead: leadScope },
      include: { lead: true },
      orderBy: { receivedAt: "desc" },
    }),
    prisma.reply.findMany({
      where: { status: "handled", receivedAt: { gte: twoWeeksAgo }, lead: leadScope },
      include: { lead: true },
      orderBy: { receivedAt: "desc" },
      take: 20,
    }),
    prisma.touch.count({ where: { userId: user.id, outcome: "sent", occurredAt: { gte: weekAgo } } }),
    prisma.reply.count({ where: { receivedAt: { gte: weekAgo }, lead: leadScope } }),
    prisma.touch.findMany({
      where: { userId: user.id, outcome: "sent", occurredAt: { gte: twoWeeksAgo } },
      include: { lead: true },
      orderBy: { occurredAt: "desc" },
      take: 100,
    }),
  ]);

  const waitingCandidates = sentTouches.filter((t) =>
    ["in_cadence", "queued", "finished"].includes(t.lead.status),
  );
  const repliesByLead = await prisma.reply.findMany({
    where: { leadId: { in: waitingCandidates.map((t) => t.leadId) } },
    select: { leadId: true, receivedAt: true },
  });
  const latestReplyByLead = new Map<string, Date>();
  for (const r of repliesByLead) {
    const cur = latestReplyByLead.get(r.leadId);
    if (!cur || r.receivedAt > cur) latestReplyByLead.set(r.leadId, r.receivedAt);
  }
  const seenLead = new Set<string>();
  const waitingForReply = waitingCandidates.filter((t) => {
    if (seenLead.has(t.leadId)) return false;
    const replyAt = latestReplyByLead.get(t.leadId);
    if (replyAt && replyAt > t.occurredAt) return false;
    seenLead.add(t.leadId);
    return true;
  });

  return {
    channelAccounts: (user.channelAccounts as { gmail?: string; instagram?: string; linkedin?: string }) ?? {},
    summary: { messagedThisWeek, repliedThisWeek, waiting: openReplies.length },
    openReplies: openReplies.map((r) => ({
      id: r.id,
      businessName: r.lead.businessName,
      channel: r.channel,
      label: r.label,
      text: r.text,
      receivedAt: r.receivedAt.toISOString(),
    })),
    loggedReplies: loggedReplies.map((r) => ({
      id: r.id,
      businessName: r.lead.businessName,
      channel: r.channel,
      label: r.label,
      text: r.text,
      receivedAt: r.receivedAt.toISOString(),
    })),
    waitingForReply: waitingForReply.map((t) => ({
      touchId: t.id,
      leadId: t.leadId,
      businessName: t.lead.businessName,
      channel: t.channel,
      occurredAt: t.occurredAt.toISOString(),
    })),
  };
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
  await assertCanWorkLead(user, lead);

  const reply = await prisma.reply.create({
    data: { organizationId: user.organizationId, leadId, channel, text, status: "open" },
  });
  await prisma.lead.update({ where: { id: leadId }, data: { status: "replied" } });
  revalidatePath("/replies");
  return reply.id;
}

const beginReplySchema = z.object({
  leadId: z.string().min(1),
  channel: z.enum(["call", "email", "instagram", "linkedin"]),
  text: z.string().trim().min(1).max(8000),
});

const confirmReplySchema = z.object({
  replyId: z.string().min(1),
  label: z.enum(REPLY_LABELS),
  meetingAt: z.string().min(1).optional(),
  meetingNote: z.string().max(500).optional(),
});

export type LoggedReplySuggestion = {
  label: ReplyLabel;
  why: string;
  draft: string;
  followUpDate: string | null;
};

/**
 * Paste a reply, store it, and classify it with the existing classifier.
 * The label is a suggestion until confirmLoggedReply. Nothing is sent.
 */
export async function beginLoggedReply(raw: z.input<typeof beginReplySchema>): Promise<{
  replyId: string;
  suggestion: LoggedReplySuggestion | null;
}> {
  const input = beginReplySchema.parse(raw);
  const user = await requireUser();
  const lead = await prisma.lead.findFirst({ where: { id: input.leadId, organizationId: user.organizationId } });
  if (!lead) throw new Error("Lead not found");
  await assertCanWorkLead(user, lead);

  const reply = await prisma.reply.create({
    data: {
      organizationId: user.organizationId,
      leadId: lead.id,
      channel: input.channel,
      text: input.text,
      status: "open",
    },
  });

  let suggestion: LoggedReplySuggestion | null = null;
  try {
    const result = await classifyReply(reply.id);
    if (result.source === "ai") {
      suggestion = {
        label: result.class,
        why: result.why,
        draft: result.draft_reply,
        followUpDate: result.follow_up_date,
      };
    }
  } catch (err) {
    console.error("[reply] classify failed", err instanceof Error ? err.message : "error");
  }

  revalidatePath("/replies");
  return { replyId: reply.id, suggestion };
}

/** Drop the paste when the rep closes the sheet before confirming the label. */
export async function discardLoggedReply(replyId: string) {
  try {
    const { reply } = await loadReplyForUser(replyId);
    if (reply.status !== "open" || outreachStopped(reply.lead.signals)) return;
    await prisma.reply.delete({ where: { id: reply.id } });
  } catch {
    return;
  }
  revalidatePath("/replies");
}

/**
 * The confirmed label is what sticks: deal, finished, do-not-contact, or replied.
 * Open Focus cards for the lead are removed and later outreach cards are blocked.
 */
export async function confirmLoggedReply(raw: z.input<typeof confirmReplySchema>) {
  const input = confirmReplySchema.parse(raw);
  const { user, reply } = await loadReplyForUser(input.replyId);
  const meeting = input.label === "interested" && Boolean(input.meetingAt);

  if (outreachStopped(reply.lead.signals)) {
    const closed = await prisma.pipelineTodayRow.updateMany({
      where: { organizationId: user.organizationId, leadId: reply.leadId, status: "open" },
      data: { status: "dropped" },
    });
    return {
      leadId: reply.leadId,
      label: reply.label,
      status: reply.lead.status,
      closedCards: closed.count,
    };
  }

  if (meeting && input.meetingAt && Number.isNaN(new Date(input.meetingAt).getTime())) {
    throw new Error("Pick a real meeting time.");
  }

  if (reply.label !== input.label) {
    await prisma.reply.update({ where: { id: reply.id }, data: { label: input.label } });
  }

  if (input.label === "unsubscribe") {
    await applyUnsubscribe(reply.id);
  } else if (input.label === "not_now") {
    await prisma.lead.update({
      where: { id: reply.leadId },
      data: { status: "finished", nextTouchAt: null, nextChannelOverride: null },
    });
    await markHandled(reply.id);
  } else if (meeting && input.meetingAt) {
    await bookMeetingFromReply(reply.id, input.meetingAt, input.meetingNote ?? "");
  } else if (input.label === "interested") {
    await findOrCreateOpenDeal(reply.lead, user.organizationId);
    await prisma.lead.update({
      where: { id: reply.leadId },
      data: { status: "deal", nextTouchAt: null, nextChannelOverride: null },
    });
  } else {
    await prisma.lead.update({
      where: { id: reply.leadId },
      data: { status: "replied", nextTouchAt: null, nextChannelOverride: null },
    });
  }

  const fresh = await prisma.lead.findUniqueOrThrow({ where: { id: reply.leadId } });
  await prisma.lead.update({
    where: { id: fresh.id },
    data: {
      signals: withStopOutreach(fresh.signals) as Prisma.InputJsonValue,
      nextTouchAt: null,
      nextChannelOverride: null,
    },
  });

  const closed = await prisma.pipelineTodayRow.updateMany({
    where: { organizationId: user.organizationId, leadId: reply.leadId, status: "open" },
    data: { status: "dropped" },
  });

  const status = leadStatusForConfirmedReply(input.label, meeting);
  await writeAuditLog({
    organizationId: user.organizationId,
    actorId: user.id,
    action: "reply_logged",
    entityType: "reply",
    entityId: reply.id,
    after: {
      leadId: reply.leadId,
      label: input.label,
      leadStatus: status,
      meeting,
      closedCards: closed.count,
    },
  });

  revalidatePath("/replies");
  revalidatePath("/focus");
  revalidatePath("/today");
  revalidatePath("/deals");

  return { leadId: reply.leadId, label: input.label, status, closedCards: closed.count };
}

function repliesLeadScope(userId: string, organizationId: string) {
  return {
    organizationId,
    OR: [{ ownerId: userId }, { pipelineTodayRows: { some: { ownerId: userId } } }],
  };
}
