import { describe, expect, it } from "vitest";
import {
  callDraftModel,
  DRAFT_BATCH_CONCURRENCY,
  mapWithConcurrency,
  runDraftAttempt,
} from "@/server/outreach/draftAttempt";
import {
  claimDraftSlot,
  draftUsageCountsTowardCap,
  PENDING_DRAFT_MODEL,
  refundDraftCapSlot,
  releaseDraftCapSlot,
  type DraftCapLedger,
} from "@/server/outreach/draftCap";
import { outreachDraftInTransaction, runInDraftTransaction } from "@/server/outreach/reserveDraftSlot";

function ledger(used: number, cap = 60): DraftCapLedger {
  return { used, cap, killSwitch: false, cards: new Map() };
}

function withLock<T>(mutex: { tail: Promise<void> }, fn: () => Promise<T>): Promise<T> {
  const run = mutex.tail.then(fn);
  mutex.tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

describe("draft cap under concurrent claims", () => {
  it("lets only the remaining daily slots through when claims overlap", async () => {
    const book = ledger(55);
    const mutex = { tail: Promise.resolve() };
    const results = await Promise.all(
      Array.from({ length: 15 }, (_, index) =>
        withLock(mutex, async () => {
          await Promise.resolve();
          return claimDraftSlot(book, { actionKey: `card-${index}`, mode: "generate", dnc: false });
        }),
      ),
    );
    const reserved = results.filter((result) => result.ok && !result.reuse);
    const denied = results.filter((result) => !result.ok);
    expect(reserved).toHaveLength(5);
    expect(denied).toHaveLength(10);
    expect(book.used).toBe(60);
    for (const result of denied) {
      if (!result.ok) expect(result.reason).toBe("Daily draft cap reached (60).");
    }
  });

  it("stops at 3 regenerations when they are claimed together", async () => {
    const book = ledger(0);
    book.cards.set("card", { hasDraft: true, regenerateCount: 0 });
    const mutex = { tail: Promise.resolve() };
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        withLock(mutex, async () => {
          await Promise.resolve();
          return claimDraftSlot(book, { actionKey: "card", mode: "regenerate", dnc: false });
        }),
      ),
    );
    expect(results.filter((result) => result.ok && !result.reuse)).toHaveLength(3);
    expect(book.cards.get("card")?.regenerateCount).toBe(3);
    expect(book.used).toBe(3);
    const denied = results.find((result) => !result.ok);
    expect(denied && !denied.ok ? denied.reason : "").toBe("This card has used its 3 regenerations.");
  });

  it("does not reserve a slot when generation is switched off", () => {
    const book = ledger(0);
    book.killSwitch = true;
    const result = claimDraftSlot(book, { actionKey: "card", mode: "generate", dnc: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("Draft generation is switched off.");
    expect(book.used).toBe(0);
  });

  it("returns an unlogged slot so a later card can still use the cap", () => {
    const book = ledger(60);
    releaseDraftCapSlot(book);
    const result = claimDraftSlot(book, { actionKey: "card", mode: "generate", dnc: false });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.reuse).toBe(false);
    expect(book.used).toBe(60);
  });
});

function timeoutError(): Error {
  return Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
}

async function failAfterClaim(
  book: DraftCapLedger,
  input: { actionKey: string; mode: "generate" | "regenerate"; error: Error },
) {
  const tx = { open: false };
  return runDraftAttempt({
    inTransaction: () => tx.open,
    claim: async () => {
      tx.open = true;
      try {
        const claim = claimDraftSlot(book, { actionKey: input.actionKey, mode: input.mode, dnc: false });
        if (!claim.ok || claim.reuse) throw new Error("expected a new reservation");
        return claim;
      } finally {
        tx.open = false;
      }
    },
    callModel: async () => {
      if (tx.open) throw new Error("transaction held across the model call");
      throw input.error;
    },
    onSoftFailure: async () => {
      refundDraftCapSlot(book, { actionKey: input.actionKey, mode: input.mode });
    },
    onHardFailure: async () => {
      refundDraftCapSlot(book, { actionKey: input.actionKey, mode: input.mode });
    },
    isSoftFailure: () => true,
  });
}

describe("draft cap refunds", () => {
  it("refunds the daily slot when the model times out", async () => {
    const book = ledger(59);
    const result = await failAfterClaim(book, {
      actionKey: "card-a",
      mode: "generate",
      error: timeoutError(),
    });
    expect(result.outcome).toBe("fallback");
    if (result.outcome === "fallback") expect(result.failure).toBe("timeout");
    expect(book.used).toBe(59);
    const next = claimDraftSlot(book, { actionKey: "card-b", mode: "generate", dnc: false });
    expect(next.ok).toBe(true);
    if (next.ok) expect(next.reuse).toBe(false);
    expect(book.used).toBe(60);
  });

  it("refunds the daily slot when the model API errors", async () => {
    const book = ledger(59);
    const result = await failAfterClaim(book, {
      actionKey: "card-a",
      mode: "generate",
      error: new Error("503 Service Unavailable"),
    });
    expect(result.outcome).toBe("fallback");
    if (result.outcome === "fallback") expect(result.failure).toBe("api_error");
    expect(book.used).toBe(59);
    const next = claimDraftSlot(book, { actionKey: "card-b", mode: "generate", dnc: false });
    expect(next.ok).toBe(true);
    if (next.ok) expect(next.reuse).toBe(false);
    expect(book.used).toBe(60);
  });

  it("does not consume a regeneration when the regenerate call fails", async () => {
    const book = ledger(0);
    book.cards.set("card", { hasDraft: true, regenerateCount: 2 });
    const result = await failAfterClaim(book, {
      actionKey: "card",
      mode: "regenerate",
      error: timeoutError(),
    });
    expect(result.outcome).toBe("fallback");
    expect(book.used).toBe(0);
    expect(book.cards.get("card")?.regenerateCount).toBe(2);
    const again = claimDraftSlot(book, { actionKey: "card", mode: "regenerate", dnc: false });
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.reuse).toBe(false);
    expect(book.cards.get("card")?.regenerateCount).toBe(3);
  });

  it("counts a returned draft and a fresh reservation, and ignores failures", () => {
    const now = new Date("2026-10-05T12:00:00Z");
    const fresh = new Date(now.getTime() - 30_000);
    const stale = new Date(now.getTime() - 5 * 60 * 1000 - 1_000);
    const rows = [
      { success: true, model: "gemini-2.5-flash", createdAt: fresh },
      { success: false, model: PENDING_DRAFT_MODEL, createdAt: fresh },
      { success: false, model: "gemini-2.5-flash", createdAt: fresh },
      { success: false, model: "claude-sonnet-4-5", createdAt: fresh },
      { success: false, model: PENDING_DRAFT_MODEL, createdAt: stale },
    ];
    expect(rows.filter((row) => draftUsageCountsTowardCap(row, now))).toHaveLength(2);
    expect(draftUsageCountsTowardCap(rows[2]!, now)).toBe(false);
    expect(draftUsageCountsTowardCap(rows[3]!, now)).toBe(false);
  });
});

describe("draft model call", () => {
  it("does not hold a transaction across the model call", async () => {
    const tx = { open: false };
    let sawOpen = true;
    const result = await runDraftAttempt({
      inTransaction: () => tx.open,
      claim: async () => {
        tx.open = true;
        await Promise.resolve();
        tx.open = false;
        return { usageId: "reserved" };
      },
      callModel: async () => {
        sawOpen = tx.open;
        await Promise.resolve();
        return { subject: "Hi" };
      },
      onSoftFailure: async () => undefined,
      onHardFailure: async () => undefined,
      isSoftFailure: () => false,
    });
    expect(result.outcome).toBe("model");
    expect(sawOpen).toBe(false);

    let called = false;
    await expect(
      runInDraftTransaction(() =>
        callDraftModel(outreachDraftInTransaction, async () => {
          called = true;
          return "draft";
        }),
      ),
    ).rejects.toThrow(/transaction/);
    expect(called).toBe(false);
  });

  it("runs at most two draft jobs at once", async () => {
    expect(DRAFT_BATCH_CONCURRENCY).toBe(2);
    let active = 0;
    let peak = 0;
    await mapWithConcurrency(
      Array.from({ length: 6 }, (_, index) => index),
      DRAFT_BATCH_CONCURRENCY,
      async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 15));
        active -= 1;
      },
    );
    expect(peak).toBe(2);
  });
});
