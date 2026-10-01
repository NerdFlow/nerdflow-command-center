"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Channel } from "@prisma/client";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { resolveLeadChannel } from "@/server/cadence";
import { writeAuditLog } from "@/server/audit";
import { incrementDailyCount } from "@/server/targets";
import { logTouchOutcome } from "@/server/actions/touches";
import { sheetDualWrite } from "@/server/sheetDualWrite";
import type { CampaignStrategy } from "@/server/strategy";
import { skipKeysFromSignals, todayActionKey, type TodayActionKind } from "@/lib/todayCards";

const doneSchema = z.object({
  leadId: z.string().min(1),
  kind: z.enum(["send_email", "linkedin_request", "reply", "contact_form", "instagram"]),
  replyId: z.string().min(1).optional(),
  scriptUsed: z.enum(["a", "b"]).optional(),
  scriptId: z.string().max(80).optional(),
  /** True only when this LinkedIn row is the cadence step. A cold pair beside an email row must not advance. */
  advanceCadence: z.boolean().optional(),
});

const skipSchema = z.object({
  leadId: z.string().min(1),
  actionKey: z.string().min(1).max(200),
  kind: z.string().max(40),
});

function revalidateWork() {
  revalidatePath("/focus");
  revalidatePath("/today");
  revalidatePath("/deals");
  revalidatePath("/replies");
}

async function loadLead(leadId: string, organizationId: string) {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, organizationId },
    include: { campaign: true, owner: true },
  });
  if (!lead) throw new Error("Lead not found");
  return lead;
}

async function rememberSkip(leadId: string, signals: unknown, actionKey: string, present: boolean) {
  const current = (signals as Record<string, unknown> | null) ?? {};
  const keys = skipKeysFromSignals(current);
  const next = present ? (keys.includes(actionKey) ? keys : [...keys, actionKey]) : keys.filter((key) => key !== actionKey);
  if (next.length === keys.length && present) return;
  await prisma.lead.update({
    where: { id: leadId },
    data: { signals: { ...current, shapeASkipKeys: next } },
  });
}

/** LinkedIn connect with no note. Does not advance an email cadence still waiting on the email row. */
async function logConnectionRequest(organizationId: string, actorId: string, lead: { id: string; cadenceStep: number }) {
  const now = new Date();
  const touch = await prisma.touch.create({
    data: {
      organizationId,
      leadId: lead.id,
      userId: actorId,
      channel: "linkedin",
      step: lead.cadenceStep,
      outcome: "sent",
      reason: "connection_request",
      occurredAt: now,
    },
  });
  await incrementDailyCount(actorId, organizationId, "linkedin");
  await writeAuditLog({
    organizationId,
    actorId,
    action: "touch_logged",
    entityType: "lead",
    entityId: lead.id,
    after: { channel: "linkedin", outcome: "sent", reason: "connection_request" },
  });
  return { touchId: touch.id, dealId: null as string | null };
}

async function completeReply(
  organizationId: string,
  actorId: string,
  lead: { id: string; cadenceStep: number },
  replyId: string | undefined,
) {
  const reply = await prisma.reply.findFirst({
    where: { id: replyId ?? "", organizationId, leadId: lead.id },
  });
  if (!reply) throw new Error("Reply card not found");
  const now = new Date();
  const touch = await prisma.touch.create({
    data: {
      organizationId,
      leadId: lead.id,
      userId: actorId,
      channel: reply.channel,
      step: lead.cadenceStep,
      outcome: "sent",
      reason: "reply_dm",
      occurredAt: now,
    },
  });
  await prisma.reply.update({ where: { id: reply.id }, data: { status: "handled", handledAt: now } });
  const deal = await prisma.deal.findFirst({
    where: { leadId: lead.id, stage: { notIn: ["won", "lost"] } },
  });
  if (deal) {
    const nextStepAt = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    await prisma.deal.update({
      where: { id: deal.id },
      data: { nextStepText: "Awaiting their reply", nextStepAt },
    });
  }
  await incrementDailyCount(actorId, organizationId, reply.channel);
  await writeAuditLog({
    organizationId,
    actorId,
    action: "touch_logged",
    entityType: "lead",
    entityId: lead.id,
    after: { channel: reply.channel, outcome: "sent", reason: "reply_dm", replyId: reply.id },
  });
  return { touchId: touch.id, dealId: deal?.id ?? null, channel: reply.channel };
}

export async function completeTodayRow(raw: z.input<typeof doneSchema>) {
  const params = doneSchema.parse(raw);
  const user = await requireUser();
  const lead = await loadLead(params.leadId, user.organizationId);
  const strategy = lead.campaign.strategy as unknown as CampaignStrategy;
  const cadence = resolveLeadChannel({
    strategy,
    cadenceStep: lead.cadenceStep,
    nextChannelOverride: lead.nextChannelOverride,
  });

  let touchId = "";
  let dealId: string | null = null;
  let channel: Channel = "email";

  if (params.kind === "reply") {
    const done = await completeReply(user.organizationId, user.id, lead, params.replyId);
    touchId = done.touchId;
    dealId = done.dealId;
    channel = done.channel;
  } else if (
    params.kind === "linkedin_request" &&
    (params.advanceCadence === false || (params.advanceCadence === undefined && cadence !== "linkedin"))
  ) {
    const done = await logConnectionRequest(user.organizationId, user.id, lead);
    touchId = done.touchId;
    channel = "linkedin";
  } else {
    channel = params.kind === "linkedin_request" ? "linkedin" : params.kind === "instagram" ? "instagram" : "email";
    const logged = await logTouchOutcome({
      leadId: lead.id,
      channel,
      outcome: "sent",
      scriptUsed: params.scriptUsed,
      scriptId: params.scriptId,
    });
    touchId = logged.touchId;
    dealId = logged.dealId;
  }

  const actionKey = todayActionKey(lead.id, params.kind as TodayActionKind, params.replyId);
  const fresh = await prisma.lead.findFirst({ where: { id: lead.id }, select: { signals: true } });
  await rememberSkip(lead.id, fresh?.signals, actionKey, false);

  const sheet = sheetDualWrite({
    action: "today_row_done",
    leadId: lead.id,
    channel,
    outcome: "done",
    actorId: user.id,
    nextStep: params.kind === "reply" ? "awaiting_reply" : params.kind === "linkedin_request" ? "email_or_wait_accept" : "next_cadence",
  });
  await writeAuditLog({
    organizationId: user.organizationId,
    actorId: user.id,
    action: "today_row_done",
    entityType: "lead",
    entityId: lead.id,
    after: { kind: params.kind, channel, touchId, sheetDualWrite: sheet.todo },
  });
  revalidateWork();
  return { touchId, dealId };
}

export async function skipTodayRow(raw: z.input<typeof skipSchema>) {
  const params = skipSchema.parse(raw);
  const user = await requireUser();
  const lead = await loadLead(params.leadId, user.organizationId);
  await rememberSkip(lead.id, lead.signals, params.actionKey, true);
  const sheet = sheetDualWrite({
    action: "today_row_skipped",
    leadId: lead.id,
    channel: params.kind,
    outcome: "skip",
    actorId: user.id,
    nextStep: null,
  });
  await writeAuditLog({
    organizationId: user.organizationId,
    actorId: user.id,
    action: "today_row_skipped",
    entityType: "lead",
    entityId: lead.id,
    after: { kind: params.kind, actionKey: params.actionKey, sheetDualWrite: sheet.todo },
  });
  revalidateWork();
  return { ok: true as const };
}
