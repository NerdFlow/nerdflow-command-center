import { describe, expect, it } from "vitest";
import { claimDraftSlot, releaseDraftCapSlot, type DraftCapLedger } from "@/server/outreach/draftCap";

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
