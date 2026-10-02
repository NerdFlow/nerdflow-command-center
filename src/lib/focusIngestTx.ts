/**
 * Prisma 5 interactive `$transaction` defaults, used when the call passes no options.
 * Production rebuilds returned 500 at exactly 10 cards because the write path used these.
 */
export const PRISMA_INTERACTIVE_TX_DEFAULTS = {
  maxWaitMs: 2_000,
  timeoutMs: 5_000,
} as const;

/** Floor covers campaign lookup plus an empty replace. Per-card budget is for a slow pooler. */
export const FOCUS_REBUILD_TX_FLOOR_MS = 10_000;
export const FOCUS_REBUILD_TX_PER_CARD_MS = 2_000;
export const FOCUS_REBUILD_TX_CAP_MS = 120_000;
/** Wait longer than Prisma's 2s default so a connection_limit of 5 can free a slot. */
export const FOCUS_REBUILD_TX_MAX_WAIT_MS = 15_000;
export const FOCUS_REBUILD_RETRY_DELAY_MS = 300;

const RETRYABLE_PRISMA_CODES = new Set([
  "P1001", // Can't reach database server
  "P1002", // Database server timed out
  "P1008", // Operations timed out
  "P1017", // Server closed the connection
  "P2024", // Timed out fetching a connection from the pool
  "P2034", // Write conflict or deadlock
]);

/** Pool and transaction failures the client can retry. P2028 is the interactive-transaction deadline. */
const DB_BUSY_CODES = new Set([...RETRYABLE_PRISMA_CODES, "P2028"]);

export type FocusRebuildTransactionOptions = {
  maxWait: number;
  timeout: number;
};

/**
 * Budget for one atomic rebuild transaction.
 * Observed on the pooler: about 500ms per card, so 9 cards finish under Prisma's 5s
 * timeout and the 10th does not. 2s per accepted card leaves headroom for a slower day.
 * 15 cards → 40s. 30 cards → 70s. Capped so a huge payload cannot hold a pool slot for minutes.
 */
export function focusRebuildTransactionOptions(cardCount: number): FocusRebuildTransactionOptions {
  const cards = Number.isFinite(cardCount) ? Math.max(0, Math.floor(cardCount)) : 0;
  const timeout = Math.min(FOCUS_REBUILD_TX_CAP_MS, FOCUS_REBUILD_TX_FLOOR_MS + cards * FOCUS_REBUILD_TX_PER_CARD_MS);
  return { maxWait: FOCUS_REBUILD_TX_MAX_WAIT_MS, timeout };
}

export type FocusIngestErrorLog = {
  name: string;
  code: string | null;
  message: string;
  clientVersion?: string;
  meta?: Record<string, string | number | boolean>;
};

export type FocusIngestFailure = {
  status: 500 | 503;
  body: { error: string; code: "save_failed" | "db_busy" };
  log: FocusIngestErrorLog;
};

export function prismaErrorCode(err: unknown): string | null {
  const direct = readPrismaCode(err);
  if (direct) return direct;
  if (err && typeof err === "object" && "cause" in err) return readPrismaCode((err as { cause?: unknown }).cause);
  return null;
}

/**
 * Retry only when the transaction never got a stable connection.
 * An expired interactive transaction (P2028 after the budget elapsed) is not retried here:
 * that attempt already held a pool slot for the full timeout. The response is still `db_busy`
 * so the caller can send the same body again.
 */
export function shouldRetryFocusRebuild(err: unknown): boolean {
  const code = prismaErrorCode(err);
  if (code === "P2028") return /unable to start a transaction/i.test(errorMessage(err));
  if (code) return RETRYABLE_PRISMA_CODES.has(code);
  return /ECONNRESET|ECONNREFUSED|ETIMEDOUT|Connection terminated|Server has closed the connection|Can't reach database server/i.test(
    errorMessage(err),
  );
}

export function describeFocusIngestFailure(err: unknown, fallbackError: string): FocusIngestFailure {
  const code = prismaErrorCode(err);
  const busy = isDbBusy(err, code);
  return {
    status: busy ? 503 : 500,
    body: { error: fallbackError, code: busy ? "db_busy" : "save_failed" },
    log: {
      name: err instanceof Error ? err.name : "NonError",
      code,
      message: sanitizeDbErrorMessage(errorMessage(err)),
      ...optionalLogFields(err),
    },
  };
}

export async function withFocusRebuildRetry<T>(
  run: () => Promise<T>,
  wait: (ms: number) => Promise<void> = delay,
): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (!shouldRetryFocusRebuild(err)) throw err;
    console.error(
      "[focus-ingest] rebuild retrying after transient database error",
      describeFocusIngestFailure(err, "Couldn't save the Today queue").log,
    );
    await wait(FOCUS_REBUILD_RETRY_DELAY_MS);
    return run();
  }
}

function isDbBusy(err: unknown, code: string | null): boolean {
  if (code) return DB_BUSY_CODES.has(code);
  return shouldRetryFocusRebuild(err);
}

function readPrismaCode(err: unknown): string | null {
  if (!err || typeof err !== "object" || !("code" in err)) return null;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" && /^P\d{4}$/.test(code) ? code : null;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "unknown error";
}

function optionalLogFields(err: unknown): Pick<FocusIngestErrorLog, "clientVersion" | "meta"> {
  const fields: Pick<FocusIngestErrorLog, "clientVersion" | "meta"> = {};
  if (err && typeof err === "object") {
    if ("clientVersion" in err && typeof (err as { clientVersion?: unknown }).clientVersion === "string") {
      fields.clientVersion = (err as { clientVersion: string }).clientVersion;
    }
    const meta = safeMeta(err);
    if (meta) fields.meta = meta;
  }
  return fields;
}

function safeMeta(err: object): Record<string, string | number | boolean> | undefined {
  if (!("meta" in err)) return undefined;
  const meta = (err as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
      continue;
    }
    if (typeof value === "string" && value.length <= 300 && !value.includes("{") && !/invocation/i.test(value)) {
      out[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Drop Prisma invocation args. Those include card message bodies and must not be logged. */
export function sanitizeDbErrorMessage(message: string): string {
  const marker = message.search(/\binvocation\s*:/i);
  if (marker === -1) return squash(message);
  const head = message.slice(0, marker).trim();
  const rest = message.slice(marker);
  const open = rest.indexOf("{");
  if (open === -1) return squash(`${head} invocation: [redacted]`);
  const end = endOfStringAwareObject(rest, open);
  const tail = end === null ? "" : rest.slice(end + 1);
  return squash(`${head} invocation: [redacted] ${tail}`);
}

function endOfStringAwareObject(text: string, open: number): number | null {
  let depth = 0;
  let i = open;
  while (i < text.length) {
    const char = text[i];
    if (char === '"') {
      i += 1;
      while (i < text.length) {
        if (text[i] === "\\") {
          i += 2;
          continue;
        }
        if (text[i] === '"') break;
        i += 1;
      }
      i += 1;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return null;
}

function squash(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 500);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
