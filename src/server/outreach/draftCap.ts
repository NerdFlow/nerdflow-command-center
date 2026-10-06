import { draftGenerationDecision } from "@/lib/outreachDraftRules";

/** Placeholder model on a reserved ai_usage row. Replaced when the call is logged. */
export const PENDING_DRAFT_MODEL = "pending";

/**
 * A reserved row counts only while the model call is still in flight.
 * Two attempts can run about three minutes (90s each). After five minutes a
 * still-pending row is a crashed call and drops out of the daily cap.
 */
export const DRAFT_RESERVATION_TTL_MS = 5 * 60 * 1000;

export type DraftUsageRow = {
  success: boolean;
  model: string;
  createdAt: Date;
};

/** True for a draft the model returned, or a reservation that is still in flight. */
export function draftUsageCountsTowardCap(row: DraftUsageRow, now = new Date()): boolean {
  if (row.success) return true;
  if (row.model !== PENDING_DRAFT_MODEL) return false;
  return now.getTime() - row.createdAt.getTime() < DRAFT_RESERVATION_TTL_MS;
}

/** Prisma filter matching `draftUsageCountsTowardCap` for rows already inside the PKT day. */
export function outreachDraftCountsTowardCapWhere(dayStart: Date, now = new Date()) {
  const freshSince = new Date(now.getTime() - DRAFT_RESERVATION_TTL_MS);
  const pendingSince = freshSince > dayStart ? freshSince : dayStart;
  return {
    OR: [{ success: true }, { model: PENDING_DRAFT_MODEL, createdAt: { gte: pendingSince } }],
  };
}

export type DraftCardSlot = {
  hasDraft: boolean;
  regenerateCount: number;
};

/**
 * In-memory picture of one organization's draft cap.
 * Production builds this inside a Postgres advisory lock, then writes the reservation.
 * Tests share one ledger across overlapping claims to prove the cap cannot be overshot.
 */
export type DraftCapLedger = {
  used: number;
  cap: number;
  killSwitch: boolean;
  cards: Map<string, DraftCardSlot>;
};

export type DraftClaim =
  | { ok: true; reuse: true; nextRegenerateCount: number }
  | { ok: true; reuse: false; nextRegenerateCount: number }
  | { ok: false; reason: string };

export function claimDraftSlot(
  ledger: DraftCapLedger,
  input: { actionKey: string; mode: "generate" | "regenerate"; dnc: boolean },
): DraftClaim {
  const card = ledger.cards.get(input.actionKey) ?? { hasDraft: false, regenerateCount: 0 };
  const decision = draftGenerationDecision({
    mode: input.mode,
    hasDraft: card.hasDraft,
    regenerateCount: card.regenerateCount,
    killSwitch: ledger.killSwitch,
    usedToday: ledger.used,
    dailyCap: ledger.cap,
    dnc: input.dnc,
  });
  if (!decision.ok) return decision;
  if (decision.reuse) return { ok: true, reuse: true, nextRegenerateCount: card.regenerateCount };
  const nextRegenerateCount = input.mode === "regenerate" ? card.regenerateCount + 1 : 0;
  ledger.used += 1;
  ledger.cards.set(input.actionKey, { hasDraft: true, regenerateCount: nextRegenerateCount });
  return { ok: true, reuse: false, nextRegenerateCount };
}

/** Drops a reservation that never became a logged model call, so a fallback does not consume the daily cap. */
export function releaseDraftCapSlot(ledger: DraftCapLedger): void {
  if (ledger.used > 0) ledger.used -= 1;
}

/**
 * Returns a slot the model did not answer.
 * A failed regenerate also gives back the regeneration it reserved.
 */
export function refundDraftCapSlot(
  ledger: DraftCapLedger,
  input: { actionKey: string; mode: "generate" | "regenerate" },
): void {
  releaseDraftCapSlot(ledger);
  if (input.mode !== "regenerate") return;
  const card = ledger.cards.get(input.actionKey);
  if (!card || card.regenerateCount <= 0) return;
  ledger.cards.set(input.actionKey, { hasDraft: card.hasDraft, regenerateCount: card.regenerateCount - 1 });
}
