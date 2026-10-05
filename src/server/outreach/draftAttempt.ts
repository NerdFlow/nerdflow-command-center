export const DRAFT_BATCH_CONCURRENCY = 2;

export const DRAFT_MODEL_HELD_TRANSACTION = "Draft model call must not run inside a database transaction.";

export class DraftTransactionHeldError extends Error {
  constructor() {
    super(DRAFT_MODEL_HELD_TRANSACTION);
    this.name = "DraftTransactionHeldError";
  }
}

export type DraftCallFailure = "timeout" | "api_error" | "unavailable";

export function classifyDraftFailure(err: unknown): DraftCallFailure {
  if (!(err instanceof Error)) return "api_error";
  if (err.name === "TimeoutError" || err.name === "AbortError" || /timeout|timed out|aborted/i.test(err.message)) {
    return "timeout";
  }
  if (/schema|json/i.test(err.message)) return "unavailable";
  return "api_error";
}

/** Runs the model call only when no draft transaction is open. */
export async function callDraftModel<T>(inTransaction: () => boolean, callModel: () => Promise<T>): Promise<T> {
  if (inTransaction()) throw new DraftTransactionHeldError();
  const value = await callModel();
  if (inTransaction()) throw new DraftTransactionHeldError();
  return value;
}

/**
 * Claim, then call the model, then refund on failure.
 * The model call starts only after `claim` resolves, and only if that
 * transaction has already closed.
 */
export async function runDraftAttempt<TClaim, TValue>(input: {
  inTransaction: () => boolean;
  claim: () => Promise<TClaim>;
  callModel: (claim: TClaim) => Promise<TValue>;
  onSoftFailure: (claim: TClaim, failure: DraftCallFailure) => Promise<void>;
  onHardFailure: (claim: TClaim, failure: DraftCallFailure) => Promise<void>;
  isSoftFailure: (err: unknown) => boolean;
}): Promise<{ outcome: "model"; claim: TClaim; value: TValue } | { outcome: "fallback"; claim: TClaim; failure: DraftCallFailure }> {
  const claim = await input.claim();
  try {
    const value = await callDraftModel(input.inTransaction, () => input.callModel(claim));
    return { outcome: "model", claim, value };
  } catch (err) {
    if (err instanceof DraftTransactionHeldError) throw err;
    const failure = classifyDraftFailure(err);
    if (input.isSoftFailure(err)) {
      await input.onSoftFailure(claim, failure);
      return { outcome: "fallback", claim, failure };
    }
    await input.onHardFailure(claim, failure);
    throw err;
  }
}

export async function mapWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  if (items.length === 0) return;
  let cursor = 0;
  const run = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
}
