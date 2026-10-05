import { matchOwnerHint, selectRoutedCards } from "@/lib/focusRouting";
import { outreachBlockReason } from "@/lib/replyLog";
import { focusRebuildTransactionOptions, withFocusRebuildRetry } from "@/lib/focusIngestTx";
import { pipelinePersonKey, dateStampFromDb, queueDateAsUtc } from "@/lib/pipelineToday";
import { writeAuditLog } from "@/server/audit";
import { prisma } from "@/server/db";
import { loadRouteReps } from "@/server/focusRouting";
import { ensurePipelineCampaign, upsertPipelineLead } from "@/server/pipelineTodaySync";
import { FocusIngestError, commitPipelineTodayOutcome } from "@/server/pipelineTodayOutcome";
import {
  planComplete,
  planFocusRebuild,
  type AcceptedFocusCard,
  type FocusOutcome,
  type RejectedCard,
  type StoredFocusCard,
} from "@/lib/focusIngest";
import { applyFocusCardSkip } from "@/server/skipFocus";
import type { SkipReason } from "@/lib/skipReason";

const TERMINAL = new Set(["done", "skipped", "follow_up", "snoozed"]);

export type RebuildApplyInput = {
  datePkt: string;
  source: string;
  force: boolean;
  ownerHint?: string | null;
  accepted: AcceptedFocusCard[];
  rejected: RejectedCard[];
};

export type RebuildApplyResult = {
  accepted: number;
  cardIds: string[];
  rejected: RejectedCard[];
  queueDate: string;
  routes: { cardId: string; assigneeId: string; leadOwnerId: string; slot: string }[];
};

function storedFromRow(row: { externalKey: string; queueDate: Date; status: string; ownerId: string; held?: boolean }): StoredFocusCard {
  return {
    externalKey: row.externalKey,
    queueDate: dateStampFromDb(row.queueDate),
    status: row.status,
    ownerId: row.ownerId,
    held: row.held === true,
  };
}

export async function applyFocusIngestRebuild(input: RebuildApplyInput): Promise<RebuildApplyResult> {
  const orgs = await prisma.organization.findMany({ select: { id: true }, orderBy: { createdAt: "asc" } });
  let organizationId: string | null = null;
  let loaded: Awaited<ReturnType<typeof loadRouteReps>> | null = null;
  const queueDay = queueDateAsUtc(input.datePkt);
  const keys = input.accepted.map((card) => card.cardId);
  for (const org of orgs) {
    const snapshot = await loadRouteReps(org.id, queueDay, { skipKeys: new Set(keys), force: input.force });
    if (snapshot.users.length > 0) {
      organizationId = org.id;
      loaded = snapshot;
      break;
    }
  }
  if (!organizationId || !loaded?.fallbackOwnerId) throw new FocusIngestError(404, "No active users to route Focus cards");
  const orgId = organizationId;
  const route = loaded;

  const personKeys = [...new Set(input.accepted.map((card) => pipelinePersonKey(card.row.company, card.row.contactName)))];
  const [byKey, sameDay, existingLeads] = await Promise.all([
    keys.length === 0
      ? Promise.resolve([])
      : prisma.pipelineTodayRow.findMany({
          where: { organizationId: orgId, externalKey: { in: keys } },
        }),
    prisma.pipelineTodayRow.findMany({
      where: { organizationId: orgId, queueDate: queueDay },
    }),
    personKeys.length === 0
      ? Promise.resolve([])
      : prisma.lead.findMany({
          where: { organizationId: orgId, dedupeKey: { in: personKeys } },
          select: { dedupeKey: true, ownerId: true },
        }),
  ]);

  const existing = new Map<string, StoredFocusCard>();
  for (const row of [...sameDay, ...byKey]) existing.set(row.externalKey, storedFromRow(row));

  const locked = new Map<string, string>();
  if (!input.force) {
    for (const row of existing.values()) {
      if (row.queueDate === input.datePkt && TERMINAL.has(row.status) && keys.includes(row.externalKey)) {
        locked.set(row.externalKey, row.ownerId);
      }
    }
  }

  const hint = matchOwnerHint(route.users, input.ownerHint);
  const decision = selectRoutedCards({
    cards: input.accepted,
    leadOwners: new Map(existingLeads.map((lead) => [lead.dedupeKey, lead.ownerId])),
    hintOwnerId: hint?.id ?? null,
    fallbackOwnerId: route.fallbackOwnerId,
    reps: route.reps,
    defaultCap: route.defaultCap,
    locked,
  });
  const rejected = [...input.rejected, ...decision.rejected];
  if (input.accepted.length > 0 && decision.routed.length === 0) {
    throw new FocusIngestError(422, "No cards accepted", { rejected });
  }

  const plan = planFocusRebuild({
    datePkt: input.datePkt,
    cards: decision.routed.map((card) => ({ cardId: card.cardId, done: card.row.sheetDone, assigneeId: card.assigneeId })),
    existing: [...existing.values()],
    force: input.force,
  });
  if (!plan.ok) throw new FocusIngestError(plan.status, plan.error, { cardId: plan.cardId });

  const byCard = new Map(decision.routed.map((card) => [card.cardId, card]));
  const saved = await withFocusRebuildRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const campaign = await ensurePipelineCampaign(tx, orgId, route.fallbackOwnerId!);
        const ids: string[] = [];
        const blockedRejected: RejectedCard[] = [];
        for (const write of plan.writes) {
          const card = byCard.get(write.cardId);
          if (!card) continue;
          if (write.preserved) {
            ids.push(card.cardId);
            continue;
          }
          const lead = await upsertPipelineLead(tx, orgId, card.leadOwnerId, campaign.id, card.row, {
            dealCode: input.accepted.find((item) => item.cardId === card.cardId)?.dealCode ?? null,
            source: input.source,
            queueDate: input.datePkt,
          });
          const blockReason = outreachBlockReason(lead);
          const blocked = blockReason !== null;
          const status = blocked ? "dropped" : write.status;
          const data = {
            ownerId: write.assigneeId,
            leadId: lead.id,
            queueDate: queueDay,
            sheetRow: card.row.sheetRow,
            timeLabel: card.row.timeLabel,
            contactName: card.row.contactName || null,
            company: card.row.company,
            actionLabel: card.row.actionLabel,
            kind: card.row.kind,
            channel: card.row.channel,
            linkKind: card.row.linkKind,
            linkUrl: card.row.linkUrl,
            mailtoTo: card.row.mailtoTo,
            mailtoSubject: card.row.mailtoSubject,
            message: card.row.message,
            sheetDone: card.row.sheetDone,
            status,
            outcomeMode: card.row.outcomeMode,
            intel: card.row.intel,
            connectNoNote: card.row.connectNoNote,
          };
          await tx.pipelineTodayRow.upsert({
            where: { organizationId_externalKey: { organizationId: orgId, externalKey: card.cardId } },
            create: { organizationId: orgId, externalKey: card.cardId, ...data },
            update: data,
          });
          if (blocked) {
            blockedRejected.push({
              cardId: card.cardId,
              reason: blockReason ?? "replied",
            });
          } else {
            ids.push(card.cardId);
          }
        }

        if (plan.dropKeys.length > 0) {
          await tx.pipelineTodayRow.updateMany({
            where: {
              organizationId: orgId,
              queueDate: queueDay,
              externalKey: { in: plan.dropKeys },
            },
            data: { status: "dropped" },
          });
        }
        return { ids, blockedRejected };
      },
      focusRebuildTransactionOptions(decision.routed.length),
    ),
  );

  const allRejected = [...rejected, ...saved.blockedRejected];
  const cardIds = saved.ids;
  const routes = decision.routed
    .filter((card) => cardIds.includes(card.cardId))
    .map((card) => ({
      cardId: card.cardId,
      assigneeId: plan.writes.find((write) => write.cardId === card.cardId)?.assigneeId ?? card.assigneeId,
      leadOwnerId: card.leadOwnerId,
      slot: card.slot,
    }));

  await writeAuditLog({
    organizationId: orgId,
    actorId: route.fallbackOwnerId,
    action: "pipeline_today_synced",
    entityType: "user",
    entityId: route.fallbackOwnerId,
    after: {
      source: input.source,
      queueDate: input.datePkt,
      open: cardIds.filter((id) => plan.writes.find((write) => write.cardId === id)?.status === "open").length,
      stored: cardIds.length,
      dropped: plan.dropKeys.length,
      force: input.force,
      rejected: allRejected.map((item) => ({ cardId: item.cardId, reason: item.reason })),
      routes,
    },
  });

  return { accepted: cardIds.length, cardIds, rejected: allRejected, queueDate: input.datePkt, routes };
}

export async function applyFocusIngestComplete(input: {
  cardId: string;
  outcome: FocusOutcome;
  reason: SkipReason | null;
  dueAt: Date | null;
  returnStamp: string | null;
  note: string | null;
  occurredAt: Date | null;
}): Promise<{
  cardId: string;
  outcome: FocusOutcome;
  status: string;
  idempotent: boolean;
  touchId: string | null;
  reason?: SkipReason | null;
  note?: string | null;
  leadId?: string;
  leadStatus?: string | null;
  returnsOn?: string | null;
  routedCardId?: string | null;
}> {
  const byExternalKey = await prisma.pipelineTodayRow.findFirst({
    where: { externalKey: input.cardId },
    include: { lead: true },
  });
  const row =
    byExternalKey ??
    (await prisma.pipelineTodayRow.findFirst({
      where: { id: input.cardId },
      include: { lead: true },
    }));
  if (!row) throw new FocusIngestError(404, "Unknown card");

  if (input.outcome === "skip") {
    if (!input.reason) throw new FocusIngestError(422, "skip needs a reason", { cardId: row.externalKey });
    return applyFocusCardSkip({
      organizationId: row.organizationId,
      actorId: row.ownerId,
      reason: input.reason,
      note: input.note,
      returnsOn: input.returnStamp,
      row,
      lead: row.lead,
      actionKey: row.externalKey,
    });
  }

  const plan = planComplete({ status: row.status, outcomeMode: row.outcomeMode, outcome: input.outcome });
  if (!plan.ok) throw new FocusIngestError(plan.status, plan.error, { cardId: row.externalKey });
  if (plan.already) {
    return { cardId: row.externalKey, outcome: input.outcome, status: plan.status, idempotent: true, touchId: null };
  }

  const saved = await commitPipelineTodayOutcome({
    organizationId: row.organizationId,
    actorId: row.ownerId,
    row,
    outcome: input.outcome,
    dueAt: input.dueAt,
    note: input.note,
    occurredAt: input.occurredAt,
    onlyFromOpen: true,
  });
  return {
    cardId: row.externalKey,
    outcome: input.outcome,
    status: saved.status,
    idempotent: saved.idempotent,
    touchId: saved.touchId,
  };
}
