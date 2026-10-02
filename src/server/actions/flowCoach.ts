"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { resolveLeadChannel } from "@/server/cadence";
import { writeAuditLog } from "@/server/audit";
import { renderMessage, type CampaignStrategy } from "@/server/strategy";
import { coachReplyDraft, inferCoachChannel, noteSignalsInterest } from "@/lib/flowCoach";
import { trySheetDualWrite } from "@/server/sheetDualWrite";
import type { ShapeCard } from "@/lib/shapeCard";
import type { Channel, LeadSource } from "@prisma/client";

const confirmSchema = z.object({
  leadId: z.string().min(1),
  note: z.string().trim().min(1).max(2000),
});

export async function confirmFlowCoach(raw: z.input<typeof confirmSchema>) {
  const params = confirmSchema.parse(raw);
  const user = await requireUser();
  const lead = await prisma.lead.findFirst({
    where: { id: params.leadId, organizationId: user.organizationId },
    include: { campaign: { include: { product: true } }, owner: true },
  });
  if (!lead) throw new Error("Lead not found");

  const strategy = lead.campaign.strategy as unknown as CampaignStrategy;
  const cadence = resolveLeadChannel({
    strategy,
    cadenceStep: lead.cadenceStep,
    nextChannelOverride: lead.nextChannelOverride,
  });
  const channel = inferCoachChannel(params.note, cadence, lead.linkedinUrl);
  const replyChannel: Channel = channel === "call" ? "email" : channel;
  const interested = noteSignalsInterest(params.note);
  const values = {
    name: lead.contactName?.trim().split(/\s+/)[0] || "there",
    biz: lead.businessName,
    city: lead.city ?? "",
    me: user.fullName,
    product: lead.campaign.product.name,
  };
  let stored = "";
  try {
    if (strategy?.messages) {
      stored =
        renderMessage(strategy, replyChannel, "follow", values) || renderMessage(strategy, replyChannel, "first", values);
    }
  } catch {
    stored = "";
  }
  const draft = coachReplyDraft({ stored, contactName: lead.contactName, businessName: lead.businessName });
  const now = new Date();

  const reply = await prisma.reply.create({
    data: {
      organizationId: user.organizationId,
      leadId: lead.id,
      channel: replyChannel,
      text: params.note,
      responseDraft: draft,
      status: "open",
      label: interested ? "interested" : null,
      receivedAt: now,
    },
  });

  await prisma.conversation.create({
    data: {
      organizationId: user.organizationId,
      leadId: lead.id,
      kind: replyChannel === "email" ? "email_in" : "dm_in",
      title: `Flow — ${lead.businessName}`,
      body: params.note,
      source: "manual",
      occurredAt: now,
      reviewStatus: "none",
    },
  });

  let dealId: string | null = null;
  if (interested) {
    const existing = await prisma.deal.findFirst({
      where: { leadId: lead.id, stage: { notIn: ["won", "lost"] } },
    });
    const deal =
      existing ??
      (await prisma.deal.create({
        data: {
          organizationId: user.organizationId,
          leadId: lead.id,
          ownerId: lead.ownerId,
          productId: lead.campaign.productId,
          campaignId: lead.campaignId,
          stage: "interested",
          nextStepText: params.note.slice(0, 280),
        },
      }));
    if (existing) {
      await prisma.deal.update({
        where: { id: deal.id },
        data: { nextStepText: params.note.slice(0, 280) },
      });
    }
    await prisma.lead.update({ where: { id: lead.id }, data: { status: "deal" } });
    dealId = deal.id;
  }

  const sheet = await trySheetDualWrite({
    action: "flow_coach_logged",
    leadId: lead.id,
    channel: replyChannel,
    outcome: "coach_logged",
    actorId: user.id,
    nextStep: "reply_card",
    contactName: lead.contactName,
    businessName: lead.businessName,
    note: "flow_coach",
  });

  await writeAuditLog({
    organizationId: user.organizationId,
    actorId: user.id,
    action: "flow_coach_logged",
    entityType: "lead",
    entityId: lead.id,
    after: {
      replyId: reply.id,
      channel: replyChannel,
      interested,
      dealId,
      sheetDualWrite: sheet.todo,
    },
  });

  revalidatePath("/focus");
  revalidatePath("/today");
  revalidatePath("/deals");
  revalidatePath("/replies");

  const card: ShapeCard = {
    lead: {
      id: lead.id,
      businessName: lead.businessName,
      contactName: lead.contactName,
      contactRole: lead.contactRole,
      city: lead.city,
      region: lead.region,
      country: lead.country,
      cadenceStep: lead.cadenceStep,
      nextChannelOverride: lead.nextChannelOverride,
      signals: (lead.signals as Record<string, unknown>) ?? {},
      phone: lead.phone,
      email: lead.email,
      instagramUrl: lead.instagramUrl,
      linkedinUrl: lead.linkedinUrl,
      website: lead.website,
      sourceUrl: lead.sourceUrl,
      fitScore: lead.fitScore,
      fitReasons: (lead.fitReasons as string[] | null) ?? [],
      fitFlags: (lead.fitFlags as string[] | null) ?? [],
      source: lead.source as LeadSource,
      lastTouchLabel: null,
    },
    campaign: {
      id: lead.campaign.id,
      name: lead.campaign.name,
      productName: lead.campaign.product.name,
      strategy,
    },
    label: "Reply",
    linkedinRequestSent: true,
    replyOnly: true,
    openReplies: [{ id: reply.id, channel: replyChannel, text: params.note, responseDraft: draft }],
  };

  return {
    leadId: lead.id,
    replyId: reply.id,
    channel: replyChannel,
    draft,
    note: params.note,
    interested,
    dealId,
    sheetDualWrite: sheet.todo,
    card,
  };
}
