import { prisma } from "@/server/db";
import { pktDayStart } from "@/server/kb/load";
import { claimDraftSlot, PENDING_DRAFT_MODEL, type DraftCapLedger } from "@/server/outreach/draftCap";

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

/**
 * One slot per organization at a time, only for the check and the reservation row.
 * The model call happens after this transaction commits, so a batch can run in parallel
 * without two cards both reading "59 of 60" and both writing.
 */
export async function claimOutreachDraftSlot(input: {
  organizationId: string;
  userId: string;
  actionKey: string;
  mode: "generate" | "regenerate";
  dnc: boolean;
}): Promise<ReservedDraft> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`outreach-draft:${input.organizationId}`})::bigint)`;
      const [settings, existing, usedToday] = await Promise.all([
        tx.orgSettings.findUnique({ where: { organizationId: input.organizationId } }),
        tx.outreachDraft.findUnique({
          where: { organizationId_actionKey: { organizationId: input.organizationId, actionKey: input.actionKey } },
        }),
        tx.aiUsage.count({
          where: { organizationId: input.organizationId, feature: "outreach_draft", createdAt: { gte: pktDayStart() } },
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
  );
}

/** Removes a reservation when the model never logged, so the daily cap is not charged for a fallback. */
export async function releaseUnloggedDraftSlot(usageId: string): Promise<void> {
  await prisma.aiUsage.delete({ where: { id: usageId } }).catch(() => undefined);
}
