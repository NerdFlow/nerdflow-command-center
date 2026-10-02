import { describe, expect, it, vi } from "vitest";
import {
  FOCUS_REBUILD_RETRY_DELAY_MS,
  PRISMA_INTERACTIVE_TX_DEFAULTS,
  describeFocusIngestFailure,
  focusRebuildTransactionOptions,
  sanitizeDbErrorMessage,
  shouldRetryFocusRebuild,
  withFocusRebuildRetry,
} from "@/lib/focusIngestTx";

describe("focus rebuild transaction budget", () => {
  it("stays above Prisma's default 5s timeout for a full day and for 30 cards", () => {
    expect(PRISMA_INTERACTIVE_TX_DEFAULTS).toEqual({ maxWaitMs: 2_000, timeoutMs: 5_000 });

    for (const count of [0, 1, 9, 10, 12, 15, 30, 40]) {
      const options = focusRebuildTransactionOptions(count);
      expect(options.maxWait).toBeGreaterThan(PRISMA_INTERACTIVE_TX_DEFAULTS.maxWaitMs);
      expect(options.timeout).toBeGreaterThan(PRISMA_INTERACTIVE_TX_DEFAULTS.timeoutMs);
    }

    // 10s floor + 2s per accepted card. These numbers are the regression lock for the ≥10 card 500.
    expect(focusRebuildTransactionOptions(0)).toEqual({ maxWait: 15_000, timeout: 10_000 });
    expect(focusRebuildTransactionOptions(9)).toEqual({ maxWait: 15_000, timeout: 28_000 });
    expect(focusRebuildTransactionOptions(10)).toEqual({ maxWait: 15_000, timeout: 30_000 });
    expect(focusRebuildTransactionOptions(15)).toEqual({ maxWait: 15_000, timeout: 40_000 });
    expect(focusRebuildTransactionOptions(30)).toEqual({ maxWait: 15_000, timeout: 70_000 });
    expect(focusRebuildTransactionOptions(30).timeout).toBeGreaterThan(focusRebuildTransactionOptions(15).timeout);
    expect(focusRebuildTransactionOptions(200).timeout).toBe(120_000);
    expect(focusRebuildTransactionOptions(1.9).timeout).toBe(focusRebuildTransactionOptions(1).timeout);
  });
});

describe("focus ingest failure logging", () => {
  it("keeps the Prisma timeout message and strips invocation payloads", () => {
    const timeout = new Error(
      "Transaction API error: Transaction already closed: A query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 5900 ms passed since the start of the transaction.",
    );
    timeout.name = "PrismaClientKnownRequestError";
    Object.assign(timeout, { code: "P2028", clientVersion: "5.20.0", meta: { error: "Transaction already closed" } });

    const failure = describeFocusIngestFailure(timeout, "Couldn't save the Today queue");
    expect(failure.status).toBe(503);
    expect(failure.body).toEqual({ error: "Couldn't save the Today queue", code: "db_busy" });
    expect(failure.log.code).toBe("P2028");
    expect(failure.log.message).toContain("5000 ms");
    expect(failure.log.clientVersion).toBe("5.20.0");
    expect(failure.log.meta).toEqual({ error: "Transaction already closed" });
    expect(JSON.stringify(failure.body)).not.toContain("5000");

    const leaked = new Error(
      "Invalid `prisma.pipelineTodayRow.upsert()` invocation:\n{\n  message: \"Hi Lee, secret outreach } body\",\n  company: \"Acme\"\n}\nTransaction already closed. The timeout for this transaction was 5000 ms, however 6100 ms passed.",
    );
    leaked.name = "PrismaClientKnownRequestError";
    Object.assign(leaked, { code: "P2028" });
    const redacted = describeFocusIngestFailure(leaked, "Couldn't save the Today queue");
    expect(redacted.log.message).toContain("5000 ms");
    expect(redacted.log.message).not.toContain("secret outreach");
    expect(sanitizeDbErrorMessage(leaked.message)).not.toContain("Acme");
  });

  it("returns save_failed for an unknown error and does not retry an expired transaction", () => {
    const unknown = new Error("column missing");
    const failure = describeFocusIngestFailure(unknown, "Couldn't save the Today queue");
    expect(failure.status).toBe(500);
    expect(failure.body.code).toBe("save_failed");
    expect(shouldRetryFocusRebuild(unknown)).toBe(false);

    const expired = new Error("Transaction already closed. The timeout for this transaction was 5000 ms.");
    Object.assign(expired, { code: "P2028" });
    expect(shouldRetryFocusRebuild(expired)).toBe(false);
    expect(describeFocusIngestFailure(expired, "Couldn't save the Today queue").status).toBe(503);
  });

  it("retries pool-start failures once and then gives up", async () => {
    const pool = new Error("Timed out fetching a new connection from the connection pool. (connection_limit=5)");
    pool.name = "PrismaClientKnownRequestError";
    Object.assign(pool, { code: "P2024" });
    expect(shouldRetryFocusRebuild(pool)).toBe(true);

    const unable = new Error("Transaction API error: Unable to start a transaction in the given time.");
    Object.assign(unable, { code: "P2028" });
    expect(shouldRetryFocusRebuild(unable)).toBe(true);

    const waits: number[] = [];
    const logs: unknown[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logs.push(args);
    });
    let attempts = 0;
    const saved = await withFocusRebuildRetry(async () => {
      attempts += 1;
      if (attempts === 1) throw pool;
      return "saved";
    }, async (ms) => {
      waits.push(ms);
    });
    expect(saved).toBe("saved");
    expect(attempts).toBe(2);
    expect(waits).toEqual([FOCUS_REBUILD_RETRY_DELAY_MS]);
    expect(JSON.stringify(logs)).toContain("P2024");

    logs.length = 0;
    attempts = 0;
    await expect(
      withFocusRebuildRetry(async () => {
        attempts += 1;
        throw pool;
      }, async () => {}),
    ).rejects.toBe(pool);
    expect(attempts).toBe(2);
    expect(JSON.stringify(logs)).toContain("P2024");
    expect(JSON.stringify(logs)).toContain("Timed out fetching a new connection");
    spy.mockRestore();
  });
});
