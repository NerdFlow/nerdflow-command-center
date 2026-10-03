import type { Channel, LeadStatus, Prisma } from "@prisma/client";
import { asSignalRecord, withStopOutreach } from "@/lib/replyLog";
import {
  cardForBadContactRoute,
  decideSkip,
  linkedinProfileUrl,
  validSkipReturnStamp,
  type SkipCardSlot,
  type SkipReason,
} from "@/lib/skipReason";
import type { MappedPipelineRow, PipelineActionKind, PipelineLinkKind, PipelineOutcomeMode } from "@/lib/pipelineToday";
import { dateStampFromDb, pktDateStamp, queueDateAsUtc } from "@/lib/pipelineToday";
import { writeAuditLog } from "@/server/audit";
import { prisma } from "@/server/db";
import { loadRouteReps } from "@/server/focusRouting";
import { FocusIngestError } from "@/server/pipelineTodayOutcome";
import { trySheetDualWrite } from "@/server/sheetDualWrite";

export type SkipApplyResult = {
  cardId: string;
  outcome: "skip";
  reason: SkipReason;
  note: string | null;
  status: "skipped" | "snoozed";
  idempotent: boolean;
  touchId: null;
  leadId: string;
  leadStatus: string;
  returnsOn: string | null;
  routedCardId: string | null;
};

type SkipLead = {
  id: string;
  ownerId: string;
  status: LeadStatus;
  email: string | null;
  linkedinUrl: string | null;
  phone: string | null;
  signals: Prisma.JsonValue;
  cadenceStep: number;
  contactName: string | null;
  businessName: string;
};

type SkipRow = {
  id: string;
  organizationId: string;
  ownerId: string;
  leadId: string;
  externalKey: string;
  queueDate: Date;
  sheetRow: number;
  timeLabel: string;
  contactName: string | null;
  company: string;
  actionLabel: string;
  kind: string;
  channel: Channel;
  linkKind: string;
  linkUrl: string | null;
  mailtoTo: string | null;
  mailtoSubject: string | null;
  message: string;
  connectNoNote: boolean;
  outcomeMode: string;
  intel: string;
  status: string;
  lead: SkipLead;
};

function asChannel(value: string): "email" | "linkedin" | "call" {
  if (value === "linkedin" || value === "call") return value;
  return "email";
}

function asOutcomeMode(value: string): PipelineOutcomeMode {
  if (value === "done_skip" || value === "done_skip_followup" || value === "done_followup") return value;
  return "done_skip";
}

function mappedFromRow(row: SkipRow, lead: SkipLead): MappedPipelineRow {
  return {
    sheetRow: row.sheetRow,
    timeLabel: row.timeLabel,
    contactName: row.contactName ?? lead.contactName ?? "",
    company: row.company,
    actionLabel: row.actionLabel,
    kind: (row.kind as PipelineActionKind) || "next_action",
    channel: asChannel(row.channel),
    linkKind: (row.linkKind as PipelineLinkKind) || "none",
    linkUrl: row.linkUrl,
    mailtoTo: row.mailtoTo,
    mailtoSubject: row.mailtoSubject,
    message: row.message,
    blankMessage: row.connectNoNote && !row.message,
    connectNoNote: row.connectNoNote,
    phone: lead.phone,
    outcomeMode: asOutcomeMode(row.outcomeMode),
    intel: row.intel,
    sheetDone: false,
  };
}

function cardSlot(row: SkipRow): SkipCardSlot {
  if (row.kind === "needs_contact") return "needs_contact";
  if (row.channel === "linkedin" || row.kind === "linkedin_request") return "linkedin";
  if (row.channel === "call" || row.kind === "call") return "call";
  return "email";
}

function skipKeys(signals: Record<string, unknown>): string[] {
  const raw = signals.shapeASkipKeys;
  if (!Array.isArray(raw)) return [];
  return raw.filter((key): key is string => typeof key === "string" && key.length > 0);
}

function skipUntil(signals: Record<string, unknown>): Record<string, string> {
  const raw = signals.shapeASkipUntil;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) out[key] = value;
  }
  return out;
}

export async function applyFocusCardSkip(input: {
  organizationId: string;
  actorId: string;
  reason: SkipReason;
  note: string | null;
  returnsOn: string | null;
  row: SkipRow | null;
  lead: SkipLead;
  actionKey: string;
}): Promise<SkipApplyResult> {
  const today = pktDateStamp();
  if (input.reason === "not_now" && input.returnsOn && !validSkipReturnStamp(input.returnsOn, today)) {
    throw new FocusIngestError(422, "Pick a later date");
  }

  const cardId = input.row?.externalKey ?? input.actionKey;
  const finished = input.row && input.row.status !== "open";
  if (finished && input.row) {
    if (input.row.status === "dropped" || input.row.status === "done" || input.row.status === "follow_up") {
      throw new FocusIngestError(409, "Card already has a different outcome", { cardId, status: input.row.status });
    }
    const prior = await prisma.focusCardSkip.findFirst({
      where: { organizationId: input.organizationId, cardId },
      orderBy: { createdAt: "desc" },
    });
    if (prior?.reason === input.reason) {
      return {
        cardId,
        outcome: "skip",
        reason: input.reason,
        note: prior.note,
        status: input.row.status === "snoozed" ? "snoozed" : "skipped",
        idempotent: true,
        touchId: null,
        leadId: input.lead.id,
        leadStatus: input.lead.status,
        returnsOn: prior.returnsOn ? dateStampFromDb(prior.returnsOn) : null,
        routedCardId: null,
      };
    }
    throw new FocusIngestError(409, "Card already has a different outcome", { cardId, status: input.row.status });
  }

  const { reps, defaultCap } = await loadRouteReps(input.organizationId, queueDateAsUtc(today));
  const profile = linkedinProfileUrl(input.lead.linkedinUrl, input.row?.linkKind, input.row?.linkUrl);
  const decision = decideSkip({
    reason: input.reason,
    linkedinUrl: profile,
    phone: input.lead.phone,
    reps,
    defaultCap,
    leadOwnerId: input.lead.ownerId,
    returnsOn: input.returnsOn,
    todayPkt: today,
    currentSlot: input.row ? cardSlot(input.row) : null,
  });

  const route = decision.route;

  const signals = asSignalRecord(input.lead.signals);
  if (decision.emailInvalid) signals.emailInvalid = true;
  if (decision.stopOutreach) {
    Object.assign(signals, withStopOutreach(signals), { stopOutreachReason: "already_in_touch" });
  }
  if (!input.row && decision.cardStatus === "snoozed" && decision.returnsOn) {
    signals.shapeASkipUntil = { ...skipUntil(signals), [input.actionKey]: decision.returnsOn };
  }
  if (!input.row && decision.cardStatus === "skipped") {
    const keys = skipKeys(signals);
    if (!keys.includes(input.actionKey)) signals.shapeASkipKeys = [...keys, input.actionKey];
  }

  const leadData: Prisma.LeadUpdateInput = { signals: signals as Prisma.InputJsonValue };
  if (decision.emailInvalid) leadData.emailVerification = "invalid";
  if (decision.leadStatus) {
    leadData.status = decision.leadStatus;
    leadData.nextTouchAt = null;
    leadData.nextChannelOverride = null;
  }
  if (decision.stopOutreach) {
    leadData.nextTouchAt = null;
    leadData.nextChannelOverride = null;
  }
  if (route && (route.slot === "linkedin" || route.slot === "call")) {
    leadData.nextChannelOverride = route.slot;
  }

  const saved = await prisma.$transaction(async (tx) => {
    if (input.row) {
      const updated = await tx.pipelineTodayRow.updateMany({
        where: { id: input.row.id, status: "open" },
        data: {
          status: decision.cardStatus,
          returnsOn: decision.returnsOn ? queueDateAsUtc(decision.returnsOn) : null,
        },
      });
      if (updated.count === 0) {
        throw new FocusIngestError(409, "Card already has a different outcome", { cardId });
      }
    }

    await tx.lead.update({ where: { id: input.lead.id }, data: leadData });

    if (input.reason === "not_fit" || input.reason === "already_in_touch") {
      await tx.pipelineTodayRow.updateMany({
        where: {
          organizationId: input.organizationId,
          leadId: input.lead.id,
          status: { in: ["open", "snoozed"] },
          ...(input.row ? { id: { not: input.row.id } } : {}),
        },
        data: { status: "dropped" },
      });
    }

    const replacement =
      route && (route.slot === "linkedin" || route.slot === "call")
        ? { slot: route.slot, assigneeId: route.assigneeId }
        : null;
    if (input.reason === "bad_contact" && !replacement) {
      await tx.pipelineTodayRow.updateMany({
        where: {
          organizationId: input.organizationId,
          leadId: input.lead.id,
          status: { in: ["open", "snoozed"] },
          ...(input.row ? { id: { not: input.row.id } } : {}),
        },
        data: { status: "dropped" },
      });
    }

    let routedCardId: string | null = null;
    if (input.row && replacement) {
      const kind = replacement.slot === "linkedin" ? "linkedin_request" : "call";
      const existing = await tx.pipelineTodayRow.findFirst({
        where: {
          organizationId: input.organizationId,
          leadId: input.lead.id,
          status: "open",
          kind,
          id: { not: input.row.id },
        },
        select: { externalKey: true },
      });
      if (existing) {
        routedCardId = existing.externalKey;
      } else {
        const rep = reps.find((item) => item.id === replacement.assigneeId);
        const next = cardForBadContactRoute(
          mappedFromRow(input.row, input.lead),
          { slot: replacement.slot, assigneeId: replacement.assigneeId },
          input.lead,
          rep,
        );
        if (next.kind === "needs_contact" || next.kind === "contact_form" || next.linkKind === "contact_form") {
          routedCardId = null;
        } else {
          const externalKey = `${input.row.externalKey}:routed:${replacement.slot}`.slice(0, 180);
          const created = await tx.pipelineTodayRow.upsert({
            where: { organizationId_externalKey: { organizationId: input.organizationId, externalKey } },
            create: {
              organizationId: input.organizationId,
              externalKey,
              ownerId: replacement.assigneeId,
              leadId: input.lead.id,
              queueDate: input.row.queueDate,
              sheetRow: input.row.sheetRow,
              timeLabel: input.row.timeLabel,
              contactName: input.row.contactName,
              company: input.row.company,
              actionLabel: next.actionLabel,
              kind: next.kind,
              channel: next.channel,
              linkKind: next.linkKind,
              linkUrl: next.linkUrl,
              mailtoTo: next.mailtoTo,
              mailtoSubject: next.mailtoSubject,
              message: next.message,
              connectNoNote: next.connectNoNote,
              outcomeMode: next.outcomeMode,
              intel: next.intel,
              status: "open",
              held: true,
              sheetDone: false,
            },
            update: { status: "open", held: true, ownerId: replacement.assigneeId },
          });
          routedCardId = created.externalKey;
        }
      }
    }

    await tx.focusCardSkip.create({
      data: {
        organizationId: input.organizationId,
        cardId,
        pipelineRowId: input.row?.id ?? null,
        leadId: input.lead.id,
        userId: input.actorId,
        reason: input.reason,
        note: input.note,
        returnsOn: decision.returnsOn ? queueDateAsUtc(decision.returnsOn) : null,
      },
    });

    return { routedCardId, leadStatus: decision.leadStatus ?? input.lead.status };
  });

  const sheet = await trySheetDualWrite({
    action: "focus_card_skipped",
    leadId: input.lead.id,
    channel: input.row?.channel ?? "email",
    outcome: "skip",
    actorId: input.actorId,
    nextStep: decision.returnsOn,
    contactName: input.lead.contactName,
    businessName: input.lead.businessName,
    note: input.note ? `${input.reason}: ${input.note}` : input.reason,
  });

  await writeAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "focus_card_skipped",
    entityType: "lead",
    entityId: input.lead.id,
    after: {
      reason: input.reason,
      note: input.note,
      cardId,
      leadId: input.lead.id,
      userId: input.actorId,
      at: new Date().toISOString(),
      status: decision.cardStatus,
      returnsOn: decision.returnsOn,
      routedCardId: saved.routedCardId,
      leadStatus: saved.leadStatus,
      sheetDualWrite: sheet.todo,
    },
  });

  return {
    cardId,
    outcome: "skip",
    reason: input.reason,
    note: input.note,
    status: decision.cardStatus,
    idempotent: false,
    touchId: null,
    leadId: input.lead.id,
    leadStatus: saved.leadStatus,
    returnsOn: decision.returnsOn,
    routedCardId: saved.routedCardId,
  };
}
