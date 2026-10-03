import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifyFocusCards, type FocusIngestCard } from "@/lib/focusIngest";
import { focusRebuildTransactionOptions } from "@/lib/focusIngestTx";

const { state } = vi.hoisted(() => ({
  state: {
    transaction: vi.fn(),
    orgFindMany: vi.fn(),
    settingsFind: vi.fn(),
    userFindMany: vi.fn(),
    rowFindMany: vi.fn(),
    auditCreate: vi.fn(),
  },
}));

vi.mock("@/server/db", () => ({
  prisma: {
    organization: { findMany: (...args: unknown[]) => state.orgFindMany(...args) },
    orgSettings: { findUnique: (...args: unknown[]) => state.settingsFind(...args) },
    user: { findMany: (...args: unknown[]) => state.userFindMany(...args) },
    pipelineTodayRow: { findMany: (...args: unknown[]) => state.rowFindMany(...args) },
    lead: { findMany: async () => [] },
    auditLog: { create: (...args: unknown[]) => state.auditCreate(...args) },
    $transaction: (...args: unknown[]) => state.transaction(...args),
  },
}));

import { applyFocusIngestRebuild } from "@/server/focusIngest";

type Tx = {
  campaign: { findFirst: ReturnType<typeof vi.fn> };
  lead: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  pipelineTodayRow: { upsert: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
};

function txMock(): Tx {
  return {
    campaign: { findFirst: vi.fn(async () => ({ id: "camp-1" })) },
    lead: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: "lead-1", status: "in_cadence" })),
      update: vi.fn(async () => ({ id: "lead-1", status: "in_cadence", signals: {} })),
    },
    pipelineTodayRow: {
      upsert: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
  };
}

function acceptedCards(count: number, done = false) {
  const cards: FocusIngestCard[] = Array.from({ length: count }, (_, index) => ({
    cardId: `2026-10-02-card-${index}`,
    timePkt: "5:00 PM",
    name: `Person ${index}`,
    company: `Company ${index}`,
    action: "LinkedIn request",
    link: { kind: "linkedin_profile", url: `https://www.linkedin.com/in/person-${index}`, label: "Open LinkedIn" },
    message: "",
    done,
  }));
  return classifyFocusCards(cards).accepted.map((card, index) => ({
    ...card,
    row: { ...card.row, sheetRow: index + 1 },
  }));
}

describe("applyFocusIngestRebuild transaction", () => {
  let tx: Tx;

  beforeEach(() => {
    tx = txMock();
    state.orgFindMany.mockReset().mockResolvedValue([{ id: "org-1" }]);
    state.settingsFind.mockReset().mockResolvedValue({ allowedEmailDomain: "nerdflow.tech" });
    state.userFindMany.mockReset().mockResolvedValue([
      {
        id: "user-1",
        email: "muqeet@nerdflow.tech",
        fullName: "Muqeet",
        role: "rep",
        organizationId: "org-1",
        channelsWorked: ["email", "linkedin", "call"],
        channelDailyCaps: { email: 30, linkedin: 30, call: 30 },
      },
    ]);
    state.rowFindMany.mockReset().mockResolvedValue([]);
    state.auditCreate.mockReset().mockResolvedValue({});
    state.transaction.mockReset().mockImplementation(async (fn: (client: Tx) => Promise<unknown>, options?: unknown) => {
      return fn(tx).then((result) => ({ result, options }));
    });
  });

  it.each([10, 15, 30])("writes %i cards in one transaction with a timeout above 5s", async (count) => {
    const captured: unknown[] = [];
    state.transaction.mockImplementation(async (fn: (client: Tx) => Promise<unknown>, options?: unknown) => {
      captured.push(options);
      return fn(tx);
    });

    const result = await applyFocusIngestRebuild({
      datePkt: "2026-10-02",
      source: "today-rebuild",
      force: false,
      accepted: acceptedCards(count),
      rejected: [],
    });

    expect(result.accepted).toBe(count);
    expect(result.cardIds).toHaveLength(count);
    expect(state.transaction).toHaveBeenCalledTimes(1);
    expect(tx.pipelineTodayRow.upsert).toHaveBeenCalledTimes(count);
    expect(captured).toEqual([focusRebuildTransactionOptions(count)]);
    const options = captured[0] as { timeout: number; maxWait: number };
    expect(options.timeout).toBeGreaterThan(5_000);
    expect(options.maxWait).toBeGreaterThan(2_000);
    if (count >= 15) expect(options.timeout).toBeGreaterThanOrEqual(40_000);
    if (count >= 30) expect(options.timeout).toBeGreaterThanOrEqual(70_000);
  });

  it("uses the same budget when every card is already done", async () => {
    const captured: unknown[] = [];
    state.transaction.mockImplementation(async (fn: (client: Tx) => Promise<unknown>, options?: unknown) => {
      captured.push(options);
      return fn(tx);
    });

    await applyFocusIngestRebuild({
      datePkt: "2026-10-02",
      source: "today-rebuild",
      force: false,
      accepted: acceptedCards(15, true),
      rejected: [],
    });

    expect(captured).toEqual([focusRebuildTransactionOptions(15)]);
    expect(tx.pipelineTodayRow.upsert).toHaveBeenCalledTimes(15);
  });

  it("retries once when the pool cannot start the transaction", async () => {
    const pool = new Error("Timed out fetching a new connection from the connection pool");
    Object.assign(pool, { code: "P2024" });
    let attempts = 0;
    state.transaction.mockImplementation(async (fn: (client: Tx) => Promise<unknown>) => {
      attempts += 1;
      if (attempts === 1) throw pool;
      return fn(tx);
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await applyFocusIngestRebuild({
      datePkt: "2026-10-02",
      source: "today-rebuild",
      force: false,
      accepted: acceptedCards(15),
      rejected: [],
    });

    expect(result.accepted).toBe(15);
    expect(attempts).toBe(2);
    expect(tx.pipelineTodayRow.upsert).toHaveBeenCalledTimes(15);
    spy.mockRestore();
  });

  it("does not retry an interactive transaction that already expired", async () => {
    const expired = new Error(
      "Transaction already closed. The timeout for this transaction was 5000 ms, however 5900 ms passed since the start of the transaction.",
    );
    Object.assign(expired, { code: "P2028" });
    let attempts = 0;
    state.transaction.mockImplementation(async () => {
      attempts += 1;
      throw expired;
    });

    await expect(
      applyFocusIngestRebuild({
        datePkt: "2026-10-02",
        source: "today-rebuild",
        force: false,
        accepted: acceptedCards(15),
        rejected: [],
      }),
    ).rejects.toBe(expired);
    expect(attempts).toBe(1);
    expect(state.auditCreate).not.toHaveBeenCalled();
  });

  it("does not open a card for a lead that already logged a reply", async () => {
    state.transaction.mockImplementation(async (fn: (client: Tx) => Promise<unknown>) => fn(tx));
    tx.lead.findFirst.mockResolvedValue({
      id: "lead-1",
      status: "replied",
      signals: { stopOutreach: true },
      fitScore: 0,
      approvedById: "user-1",
      businessName: "Company 0",
    });
    tx.lead.update.mockResolvedValue({ id: "lead-1", status: "replied", signals: { stopOutreach: true } });

    const result = await applyFocusIngestRebuild({
      datePkt: "2026-10-02",
      source: "today-rebuild",
      force: false,
      accepted: acceptedCards(1),
      rejected: [],
    });

    expect(result.accepted).toBe(0);
    expect(result.cardIds).toEqual([]);
    expect(result.rejected).toEqual([{ cardId: "2026-10-02-card-0", reason: "replied" }]);
    const upsert = tx.pipelineTodayRow.upsert.mock.calls[0]?.[0] as { create: { status: string }; update: { status: string } };
    expect(upsert.create.status).toBe("dropped");
    expect(upsert.update.status).toBe("dropped");
  });
});
