import type { Channel } from "@prisma/client";
import { writeAuditLog } from "@/server/audit";
import { prisma } from "@/server/db";
import { incrementDailyCount } from "@/server/targets";
import { trySheetDualWrite } from "@/server/sheetDualWrite";
import { dateStampFromDb, sheetRowForWriteback } from "@/lib/pipelineToday";
import { scheduleFocusCadenceAfterDone } from "@/server/focusCadenceSchedule";
import { outcomeStatus, type FocusOutcome } from "@/lib/focusIngest";

export class FocusIngestError extends Error {
  status: number;
  extra: Record<string, unknown>;

  constructor(status: number, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export type PipelineOutcomeRow = {
  id: string;
  organizationId: string;
  leadId: string;
  ownerId: string;
  kind: string;
  channel: Channel;
  actionLabel: string;
  contactName: string | null;
  company: string;
  sheetRow: number;
  timeLabel: string;
  externalKey: string;
  queueDate: Date;
  status: string;
  lead: { cadenceStep: number };
};

/**
 * Done / Skip / Needs follow-up for one pipeline_today_rows card.
 * Sheet writeback is best-effort and does not mark column G for API card ids.
 * `onlyFromOpen` makes a retry of the same outcome a no-op instead of a second touch.
 */
export async function commitPipelineTodayOutcome(input: {
  organizationId: string;
  actorId: string;
  row: PipelineOutcomeRow;
  outcome: FocusOutcome;
  dueAt?: Date | null;
  note?: string | null;
  occurredAt?: Date | null;
  onlyFromOpen?: boolean;
}): Promise<{ touchId: string | null; idempotent: boolean; status: "done" | "skipped" | "follow_up" }> {
  const row = input.row;
  const status = outcomeStatus(input.outcome);
  const occurredAt = input.occurredAt ?? new Date();
  const openDeal = await prisma.deal.findFirst({
    where: { leadId: row.leadId, stage: { notIn: ["won", "lost"] } },
    select: { id: true },
  });
  const touchOutcome = input.outcome === "needs_follow_up" ? "talked_not_now" : "sent";
  const reason =
    input.outcome === "needs_follow_up"
      ? "needs_follow_up"
      : row.kind === "linkedin_request"
        ? "connection_request"
        : row.kind === "reply"
          ? "reply_dm"
          : `pipeline_${row.kind}`;

  const touchId = await prisma.$transaction(async (tx) => {
    if (input.onlyFromOpen) {
      const updated = await tx.pipelineTodayRow.updateMany({
        where: { id: row.id, status: "open" },
        data: { status },
      });
      if (updated.count === 0) {
        const fresh = await tx.pipelineTodayRow.findUnique({ where: { id: row.id }, select: { status: true } });
        if (fresh?.status === status) return { id: null as string | null, idempotent: true };
        throw new FocusIngestError(409, "Card already has a different outcome", { cardId: row.externalKey, status: fresh?.status ?? null });
      }
    } else {
      await tx.pipelineTodayRow.update({ where: { id: row.id }, data: { status } });
    }

    if (input.outcome === "skip") return { id: null as string | null, idempotent: false };
    const touch = await tx.touch.create({
      data: {
        organizationId: input.organizationId,
        leadId: row.leadId,
        dealId: openDeal?.id ?? null,
        userId: input.actorId,
        channel: row.channel,
        step: row.lead.cadenceStep,
        outcome: touchOutcome,
        reason,
        occurredAt,
      },
    });
    if (input.outcome === "needs_follow_up") {
      const deal = await tx.deal.findFirst({
        where: { leadId: row.leadId, stage: { notIn: ["won", "lost"] } },
      });
      if (deal) {
        const nextStepText = (input.note?.trim() || row.actionLabel).slice(0, 280);
        await tx.deal.update({
          where: { id: deal.id },
          data: {
            nextStepText,
            nextStepAt: input.dueAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
      }
    }
    return { id: touch.id, idempotent: false };
  });

  if (touchId.idempotent) return { touchId: null, idempotent: true, status };

  if (
    input.outcome === "done" &&
    (row.kind === "send_email" || row.kind === "linkedin_request" || row.kind === "call" || row.kind === "follow_up") &&
    (row.channel === "email" || row.channel === "linkedin" || row.channel === "call")
  ) {
    await scheduleFocusCadenceAfterDone({
      organizationId: input.organizationId,
      leadId: row.leadId,
      completedChannel: row.channel,
      anchorHint: dateStampFromDb(row.queueDate),
    });
  }

  if (input.outcome === "done" && row.kind !== "next_action") {
    try {
      await incrementDailyCount(input.actorId, input.organizationId, row.channel);
    } catch (err) {
      console.error("[pipeline-today] daily count failed", err instanceof Error ? err.message : "error");
    }
  }

  const nextStep =
    input.outcome === "skip"
      ? null
      : input.outcome === "needs_follow_up"
        ? "needs_follow_up"
        : row.kind === "reply"
          ? "awaiting_reply"
          : row.kind === "linkedin_request"
            ? "email_or_wait_accept"
            : row.kind === "next_action"
              ? "done"
              : "next_cadence";

  const sheetRow = sheetRowForWriteback(row.externalKey, row.sheetRow);
  const sheet = await trySheetDualWrite({
    action: "pipeline_today_outcome",
    leadId: row.leadId,
    channel: row.channel,
    outcome: input.outcome,
    actorId: input.actorId,
    nextStep,
    contactName: row.contactName,
    businessName: row.company,
    note: row.actionLabel,
    sheetRow,
    timePkt: row.timeLabel,
    queueDate: dateStampFromDb(row.queueDate),
  });

  await writeAuditLog({
    organizationId: input.organizationId,
    actorId: input.actorId,
    action: "pipeline_today_outcome",
    entityType: "lead",
    entityId: row.leadId,
    after: {
      rowId: row.id,
      cardId: row.externalKey,
      sheetRow: row.sheetRow,
      kind: row.kind,
      outcome: input.outcome,
      status,
      touchId: touchId.id,
      note: input.note ?? null,
      dueAt: input.dueAt?.toISOString() ?? null,
      assigneeId: row.ownerId,
      leadId: row.leadId,
      sheetDualWrite: sheet.todo,
    },
  });

  return { touchId: touchId.id, idempotent: false, status };
}
