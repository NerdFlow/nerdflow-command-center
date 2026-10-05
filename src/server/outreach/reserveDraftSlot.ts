import { AsyncLocalStorage } from "node:async_hooks";
import type { Channel, Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { pktDayStart } from "@/server/kb/load";
import {
  claimDraftSlot,
  DRAFT_RESERVATION_TTL_MS,
  outreachDraftCountsTowardCapWhere,
  PENDING_DRAFT_MODEL,
  type DraftCapLedger,
} from "@/server/outreach/draftCap";

const draftTransaction = new AsyncLocalStorage<true>();

/** True only inside a draft claim or refund transaction. Concurrent calls keep their own context. */
export function outreachDraftInTransaction(): boolean {
  return draftTransaction.getStore() === true;
}

export function runInDraftTransaction<T>(fn: () => Promise<T>): Promise<T> {
  return draftTransaction.run(true, fn);
}

function lockDraftCap(tx: Prisma.TransactionClient, organizationId: string) {
  return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`outreach-draft:${organizationId}`})::bigint)`;
}

export type ReservedDraft =
  | {
      ok: true;
      reuse: true;
      usedToday: number;
      draft: {
        subject: string;
        body: string;
        regenerateCount: number;
        openerSourceUrl: string | null;
        source: string;
      };
    }
  | {
      ok: true;
      reuse: false;
      usageId: string;
      regenerateCount: number;
      openerSourceUrl: string | null;
    }
  | { ok: false; reason: string };

export type FallbackDraftWrite = {
  leadId: string;
  pipelineRowId: string | null;
  channel: Channel;
  subject: string;
  body: string;
  openerSourceUrl: string | null;
};

export type RefundedDraft = {
  subject: string;
  body: string;
  regenerateCount: number;
  openerSourceUrl: string | null;
  source: string;
};

/**
 * One slot per organization at a time, only for the check and the reservation row.
 * The transaction commits before the caller starts the model, so the connection
 * is back in the pool while the LLM runs.
 */
export async function claimOutreachDraftSlot(input: {
  organizationId: string;
  userId: string;
  actionKey: string;
  mode: "generate" | "regenerate";
  dnc: boolean;
}): Promise<ReservedDraft> {
  return runInDraftTransaction(() =>
    prisma.$transaction(
      async (tx) => {
        await lockDraftCap(tx, input.organizationId);
        const now = new Date();
        await releaseStalePendingReservations(tx, input.organizationId, now);
        const dayStart = pktDayStart(now);
        const [settings, existing, usedToday] = await Promise.all([
          tx.orgSettings.findUnique({ where: { organizationId: input.organizationId } }),
          tx.outreachDraft.findUnique({
            where: { organizationId_actionKey: { organizationId: input.organizationId, actionKey: input.actionKey } },
          }),
          tx.aiUsage.count({
            where: {
              organizationId: input.organizationId,
              feature: "outreach_draft",
              createdAt: { gte: dayStart },
              ...outreachDraftCountsTowardCapWhere(dayStart, now),
            },
          }),
        ]);
        const ledger: DraftCapLedger = {
          used: usedToday,
          cap: settings?.outreachDraftDailyCap ?? 60,
          killSwitch: settings?.outreachDraftKillSwitch ?? false,
          cards: new Map([[input.actionKey, { hasDraft: Boolean(existing), regenerateCount: existing?.regenerateCount ?? 0 }]]),
        };
        const claim = claimDraftSlot(ledger, { actionKey: input.actionKey, mode: input.mode, dnc: input.dnc });
        if (!claim.ok) return claim;
        if (claim.reuse) {
          if (!existing) return { ok: false, reason: "Generate a draft first." };
          return {
            ok: true,
            reuse: true,
            usedToday,
            draft: {
              subject: existing.subject,
              body: existing.body,
              regenerateCount: existing.regenerateCount,
              openerSourceUrl: existing.openerSourceUrl,
              source: existing.source,
            },
          };
        }
        if (input.mode === "regenerate" && existing) {
          await tx.outreachDraft.update({
            where: { id: existing.id },
            data: { regenerateCount: claim.nextRegenerateCount },
          });
        }
        const usage = await tx.aiUsage.create({
          data: {
            organizationId: input.organizationId,
            userId: input.userId,
            feature: "outreach_draft",
            model: PENDING_DRAFT_MODEL,
            inputTokens: 0,
            outputTokens: 0,
            costUsd: 0,
            latencyMs: 0,
            success: false,
            cardId: input.actionKey,
            taskType: input.mode,
          },
        });
        return {
          ok: true,
          reuse: false,
          usageId: usage.id,
          regenerateCount: claim.nextRegenerateCount,
          openerSourceUrl: existing?.openerSourceUrl ?? null,
        };
      },
      { timeout: 20_000 },
    ),
  );
}

/**
 * Drops a reservation the model did not answer, and rolls back a regenerate bump.
 * Pending rows are deleted. A logged failure (real model, success false) stays for
 * token history and is excluded by the cap filter. The lock is not held across the model call.
 */
export async function refundDraftReservation(input: {
  organizationId: string;
  userId: string;
  usageId: string;
  actionKey: string;
  mode: "generate" | "regenerate";
  claimedRegenerateCount: number;
  fallback?: FallbackDraftWrite;
}): Promise<RefundedDraft | null> {
  return runInDraftTransaction(() =>
    prisma.$transaction(
      async (tx) => {
        await lockDraftCap(tx, input.organizationId);
        const row = await tx.aiUsage.findUnique({ where: { id: input.usageId } });
        if (row && row.organizationId !== input.organizationId) return null;
        if (row?.success) return null;
        const alreadyRefunded = row?.taskType?.endsWith(":refunded") === true;
        if (row && !alreadyRefunded) {
          if (row.model === PENDING_DRAFT_MODEL) {
            await tx.aiUsage.delete({ where: { id: row.id } });
          } else {
            await tx.aiUsage.update({
              where: { id: row.id },
              data: { taskType: `${row.taskType ?? "draft"}:refunded` },
            });
          }
        }

        const existing = await tx.outreachDraft.findUnique({
          where: { organizationId_actionKey: { organizationId: input.organizationId, actionKey: input.actionKey } },
        });
        const shouldRollBack =
          !alreadyRefunded &&
          input.mode === "regenerate" &&
          existing !== null &&
          existing.regenerateCount === input.claimedRegenerateCount;
        const regenerateCount = shouldRollBack ? Math.max(0, input.claimedRegenerateCount - 1) : (existing?.regenerateCount ?? 0);

        if (!input.fallback) {
          if (shouldRollBack && existing) {
            await tx.outreachDraft.update({ where: { id: existing.id }, data: { regenerateCount } });
          }
          return null;
        }

        const saved = existing
          ? await tx.outreachDraft.update({
              where: { id: existing.id },
              data: {
                subject: input.fallback.subject,
                body: input.fallback.body,
                openerSourceUrl: input.fallback.openerSourceUrl,
                regenerateCount,
                source: "fallback",
                userId: input.userId,
                pipelineRowId: input.fallback.pipelineRowId,
              },
            })
          : await tx.outreachDraft.create({
              data: {
                organizationId: input.organizationId,
                userId: input.userId,
                leadId: input.fallback.leadId,
                actionKey: input.actionKey,
                pipelineRowId: input.fallback.pipelineRowId,
                channel: input.fallback.channel,
                subject: input.fallback.subject,
                body: input.fallback.body,
                openerSourceUrl: input.fallback.openerSourceUrl,
                regenerateCount,
                source: "fallback",
              },
            });
        return {
          subject: saved.subject,
          body: saved.body,
          regenerateCount: saved.regenerateCount,
          openerSourceUrl: saved.openerSourceUrl,
          source: saved.source,
        };
      },
      { timeout: 10_000 },
    ),
  );
}

/** Crashed reservations older than the in-flight window. Rolls back a regenerate bump once. */
async function releaseStalePendingReservations(tx: Prisma.TransactionClient, organizationId: string, now: Date) {
  const cutoff = new Date(now.getTime() - DRAFT_RESERVATION_TTL_MS);
  const stale = await tx.aiUsage.findMany({
    where: {
      organizationId,
      feature: "outreach_draft",
      model: PENDING_DRAFT_MODEL,
      success: false,
      createdAt: { lt: cutoff },
    },
    select: { id: true, taskType: true, cardId: true },
  });
  for (const row of stale) {
    if (row.taskType === "regenerate" && row.cardId) {
      await tx.outreachDraft.updateMany({
        where: { organizationId, actionKey: row.cardId, regenerateCount: { gt: 0 } },
        data: { regenerateCount: { decrement: 1 } },
      });
    }
    await tx.aiUsage.delete({ where: { id: row.id } });
  }
}
