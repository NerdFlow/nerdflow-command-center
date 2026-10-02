import { focusRebuildTransactionOptions, withFocusRebuildRetry } from "@/lib/focusIngestTx";
import { writeAuditLog } from "@/server/audit";
import { prisma } from "@/server/db";
import { resolveFocusTodayOwner } from "@/server/focusTodayOwner";
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
import { dateStampFromDb, queueDateAsUtc } from "@/lib/pipelineToday";

export type RebuildApplyInput = {
  datePkt: string;
  source: string;
  force: boolean;
  accepted: AcceptedFocusCard[];
  rejected: RejectedCard[];
};

export type RebuildApplyResult = {
  accepted: number;
  cardIds: string[];
  rejected: RejectedCard[];
  queueDate: string;
};

function storedFromRow(row: { externalKey: string; queueDate: Date; status: string; ownerId: string }): StoredFocusCard {
  return {
    externalKey: row.externalKey,
    queueDate: dateStampFromDb(row.queueDate),
    status: row.status,
    ownerId: row.ownerId,
  };
}

export async function applyFocusIngestRebuild(input: RebuildApplyInput): Promise<RebuildApplyResult> {
  const orgs = await prisma.organization.findMany({ select: { id: true }, orderBy: { createdAt: "asc" } });
  let owner: Awaited<ReturnType<typeof resolveFocusTodayOwner>> = null;
  for (const org of orgs) {
    owner = await resolveFocusTodayOwner(org.id);
    if (owner) break;
  }
  if (!owner) throw new FocusIngestError(404, "Muqeet was not found");
  const focusOwner = owner;

  const keys = input.accepted.map((card) => card.cardId);
  const queueDay = queueDateAsUtc(input.datePkt);
  const [byKey, sameDay] = await Promise.all([
    keys.length === 0
      ? Promise.resolve([])
      : prisma.pipelineTodayRow.findMany({
          where: { organizationId: focusOwner.organizationId, externalKey: { in: keys } },
        }),
    prisma.pipelineTodayRow.findMany({
      where: { organizationId: focusOwner.organizationId, ownerId: focusOwner.id, queueDate: queueDay },
    }),
  ]);

  const existing = new Map<string, StoredFocusCard>();
  for (const row of [...sameDay, ...byKey]) existing.set(row.externalKey, storedFromRow(row));

  const plan = planFocusRebuild({
    datePkt: input.datePkt,
    ownerId: focusOwner.id,
    cards: input.accepted.map((card) => ({ cardId: card.cardId, done: card.row.sheetDone })),
    existing: [...existing.values()],
    force: input.force,
  });
  if (!plan.ok) throw new FocusIngestError(plan.status, plan.error, { cardId: plan.cardId });

  const byCard = new Map(input.accepted.map((card) => [card.cardId, card]));
  // One transaction so a failure cannot leave a half-replaced open queue.
  // Options scale with accepted cards; Prisma's 5s default dies at ~10 cards on the pooler.
  const saved = await withFocusRebuildRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const campaign = await ensurePipelineCampaign(tx, focusOwner.organizationId, focusOwner.id);
        const ids: string[] = [];
        const blockedRejected: RejectedCard[] = [];
        for (const write of plan.writes) {
          const card = byCard.get(write.cardId);
          if (!card) continue;
          if (write.preserved) {
            ids.push(card.cardId);
            continue;
          }
          const lead = await upsertPipelineLead(tx, focusOwner.organizationId, focusOwner.id, campaign.id, card.row, {
            dealCode: card.dealCode,
            source: input.source,
          });
          const blocked = lead.status === "do_not_contact" || lead.status === "not_fit";
          const status = blocked ? "dropped" : write.status;
          const data = {
            ownerId: focusOwner.id,
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
            where: { organizationId_externalKey: { organizationId: focusOwner.organizationId, externalKey: card.cardId } },
            create: { organizationId: focusOwner.organizationId, externalKey: card.cardId, ...data },
            update: data,
          });
          if (blocked) {
            blockedRejected.push({
              cardId: card.cardId,
              reason: lead.status === "not_fit" ? "not_a_fit" : "do_not_contact",
            });
          } else {
            ids.push(card.cardId);
          }
        }

        if (plan.dropKeys.length > 0) {
          await tx.pipelineTodayRow.updateMany({
            where: {
              organizationId: focusOwner.organizationId,
              ownerId: focusOwner.id,
              queueDate: queueDay,
              externalKey: { in: plan.dropKeys },
            },
            data: { status: "dropped" },
          });
        }
        return { ids, blockedRejected };
      },
      focusRebuildTransactionOptions(input.accepted.length),
    ),
  );

  const rejected = [...input.rejected, ...saved.blockedRejected];
  const cardIds = saved.ids;

  await writeAuditLog({
    organizationId: focusOwner.organizationId,
    actorId: focusOwner.id,
    action: "pipeline_today_synced",
    entityType: "user",
    entityId: focusOwner.id,
    after: {
      source: input.source,
      queueDate: input.datePkt,
      open: cardIds.filter((id) => plan.writes.find((write) => write.cardId === id)?.status === "open").length,
      stored: cardIds.length,
      dropped: plan.dropKeys.length,
      force: input.force,
      rejected: rejected.map((item) => ({ cardId: item.cardId, reason: item.reason })),
    },
  });

  return { accepted: cardIds.length, cardIds, rejected, queueDate: input.datePkt };
}

export async function applyFocusIngestComplete(input: {
  cardId: string;
  outcome: FocusOutcome;
  dueAt: Date | null;
  note: string | null;
  occurredAt: Date | null;
}): Promise<{ cardId: string; outcome: FocusOutcome; status: string; idempotent: boolean; touchId: string | null }> {
  const orgs = await prisma.organization.findMany({ select: { id: true }, orderBy: { createdAt: "asc" } });
  let owner: Awaited<ReturnType<typeof resolveFocusTodayOwner>> = null;
  for (const org of orgs) {
    owner = await resolveFocusTodayOwner(org.id);
    if (owner) break;
  }
  if (!owner) throw new FocusIngestError(404, "Muqeet was not found");

  const byExternalKey = await prisma.pipelineTodayRow.findFirst({
    where: { organizationId: owner.organizationId, externalKey: input.cardId },
    include: { lead: true },
  });
  const row =
    byExternalKey ??
    (await prisma.pipelineTodayRow.findFirst({
      where: { organizationId: owner.organizationId, id: input.cardId },
      include: { lead: true },
    }));
  if (!row) throw new FocusIngestError(404, "Unknown card");
  if (row.ownerId !== owner.id) throw new FocusIngestError(403, "That card belongs to another rep", { cardId: row.externalKey });

  const plan = planComplete({ status: row.status, outcomeMode: row.outcomeMode, outcome: input.outcome });
  if (!plan.ok) throw new FocusIngestError(plan.status, plan.error, { cardId: row.externalKey });
  if (plan.already) {
    return { cardId: row.externalKey, outcome: input.outcome, status: plan.status, idempotent: true, touchId: null };
  }

  const saved = await commitPipelineTodayOutcome({
    organizationId: owner.organizationId,
    actorId: owner.id,
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
