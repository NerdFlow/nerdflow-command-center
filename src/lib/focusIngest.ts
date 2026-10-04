import { timingSafeEqual } from "crypto";
import { z } from "zod";
import { SKIP_REASONS, type SkipReason } from "@/lib/skipReason";
import {
  mapPipelineGrid,
  type MappedPipelineRow,
  type PipelineOutcomeMode,
} from "@/lib/pipelineToday";

const TERMINAL = new Set(["done", "skipped", "follow_up", "snoozed"]);

export const focusOutcomeSchema = z.enum(["done", "skip", "needs_follow_up"]);
export type FocusOutcome = z.infer<typeof focusOutcomeSchema>;

const cardSchema = z.object({
  cardId: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, "cardId may only use letters, numbers, and . _ : -"),
  timePkt: z.string().max(40).nullable().optional(),
  name: z.string().min(1).max(200),
  company: z.string().max(200).optional().default(""),
  dealId: z.string().max(64).nullable().optional(),
  action: z.string().min(1).max(200),
  link: z
    .object({
      kind: z.enum(["mailto", "linkedin_profile", "contact_form", "none"]).optional(),
      url: z.string().max(2000).nullable().optional(),
      label: z.string().max(300).nullable().optional(),
    })
    .nullable()
    .optional(),
  message: z.string().max(8000).nullable().optional(),
  rules: z
    .object({
      linkedinNote: z.boolean().optional(),
      autoSend: z.boolean().optional(),
      fromIdentity: z.string().max(200).nullable().optional(),
    })
    .nullable()
    .optional(),
  done: z.boolean().optional().default(false),
});

export const focusIngestBodySchema = z.object({
  owner: z.string().max(80).optional(),
  datePkt: z.string(),
  source: z.string().min(1).max(80),
  force: z.boolean().optional(),
  cards: z.array(cardSchema).max(200),
});

export const focusCompleteBodySchema = z.object({
  outcome: focusOutcomeSchema,
  reason: z.enum(SKIP_REASONS).optional(),
  dueDate: z.string().max(40).optional(),
  note: z.string().max(500).optional(),
  completedAtPkt: z.string().max(40).optional(),
});

export type FocusIngestCard = z.infer<typeof cardSchema>;

export type RejectedCard = { cardId: string; reason: string };

export type AcceptedFocusCard = {
  cardId: string;
  dealCode: string | null;
  row: MappedPipelineRow;
};

export type FocusIngestAuth = "ok" | "unconfigured" | "unauthorized";

export function focusIngestAuth(authorization: string | null, secret: string | undefined): FocusIngestAuth {
  const expectedSecret = secret?.trim() ?? "";
  if (!expectedSecret) return "unconfigured";
  const expected = Buffer.from(`Bearer ${expectedSecret}`);
  const actual = Buffer.from(authorization ?? "");
  if (actual.length !== expected.length) {
    timingSafeEqual(expected, expected);
    return "unauthorized";
  }
  if (!timingSafeEqual(actual, expected)) return "unauthorized";
  return "ok";
}

export function validDatePkt(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function parseForceFlag(query: string | null, bodyForce: boolean | undefined): boolean {
  if (bodyForce === true) return true;
  if (!query) return false;
  return query.trim().toLowerCase() === "true" || query.trim() === "1" || query.trim().toLowerCase() === "yes";
}

/** Word-boundary call/phone actions. The sheet mapper only drops actions that start with "call". */
export function isCallCardAction(action: string): boolean {
  const text = action.trim().toLowerCase();
  return /\bcalls?\b/.test(text) || /\bphone\b/.test(text);
}

export function cardToCells(card: FocusIngestCard): string[] {
  const time = card.timePkt?.trim() ? card.timePkt.trim() : "—";
  const link = card.link?.url?.trim() || card.link?.label?.trim() || "";
  return [time, card.name, card.company ?? "", card.action, link, card.message?.trim() ?? "", card.done ? "TRUE" : "FALSE"];
}

export function classifyFocusCards(cards: FocusIngestCard[]): { accepted: AcceptedFocusCard[]; rejected: RejectedCard[] } {
  const accepted: AcceptedFocusCard[] = [];
  const rejected: RejectedCard[] = [];
  for (const card of cards) {
    if (card.rules?.autoSend === true) {
      rejected.push({ cardId: card.cardId, reason: "auto_send_forbidden" });
      continue;
    }
    const mapped = mapPipelineGrid([cardToCells(card)]);
    const row = mapped.rows[0];
    if (!row) {
      rejected.push({ cardId: card.cardId, reason: "incomplete" });
      continue;
    }
    accepted.push({
      cardId: card.cardId,
      dealCode: card.dealId?.trim() || null,
      row,
    });
  }
  return { accepted, rejected };
}

export type StoredFocusCard = {
  externalKey: string;
  queueDate: string;
  status: string;
  ownerId: string;
  /** A card created by skip routing. A same-day rebuild does not drop it. */
  held?: boolean;
};

export type RebuildWrite = {
  cardId: string;
  status: "open" | "done" | "skipped" | "follow_up" | "snoozed";
  assigneeId: string;
  preserved: boolean;
};

export type RebuildPlan =
  | { ok: false; status: 403 | 409; error: string; cardId: string }
  | { ok: true; writes: RebuildWrite[]; dropKeys: string[] };

/**
 * Replace one day's open Focus cards. Assignees may differ per card.
 * Same payload twice yields the same statuses. Done / skipped / follow-up /
 * snoozed rows stay unless force is set, and a finished card keeps its assignee.
 * A card id that already lives on another day is 409.
 */
export function planFocusRebuild(input: {
  datePkt: string;
  cards: { cardId: string; done: boolean; assigneeId: string }[];
  existing: StoredFocusCard[];
  force: boolean;
}): RebuildPlan {
  const byKey = new Map(input.existing.map((row) => [row.externalKey, row]));
  const incoming = new Set(input.cards.map((card) => card.cardId));
  const writes: RebuildWrite[] = [];

  for (const card of input.cards) {
    const previous = byKey.get(card.cardId);
    if (previous && previous.queueDate !== input.datePkt) {
      return {
        ok: false,
        status: 409,
        error: `Card ${card.cardId} already belongs to ${previous.queueDate}`,
        cardId: card.cardId,
      };
    }
    if (previous && TERMINAL.has(previous.status) && !input.force) {
      writes.push({
        cardId: card.cardId,
        status: previous.status as RebuildWrite["status"],
        assigneeId: previous.ownerId,
        preserved: true,
      });
      continue;
    }
    writes.push({
      cardId: card.cardId,
      status: card.done ? "done" : "open",
      assigneeId: card.assigneeId,
      preserved: false,
    });
  }

  const dropKeys: string[] = [];
  for (const row of input.existing) {
    if (row.queueDate !== input.datePkt) continue;
    if (incoming.has(row.externalKey) || row.status === "dropped") continue;
    if (row.status === "snoozed" && !input.force) continue;
    if ((row.status === "open" && row.held !== true) || input.force) dropKeys.push(row.externalKey);
  }

  return { ok: true, writes, dropKeys };
}

export function outcomeAllowed(mode: PipelineOutcomeMode, outcome: FocusOutcome): boolean {
  if (outcome === "done" || outcome === "skip") return true;
  return mode === "done_skip_followup" || mode === "done_followup";
}

export function outcomeStatus(outcome: FocusOutcome): "done" | "skipped" | "follow_up" {
  if (outcome === "done") return "done";
  if (outcome === "skip") return "skipped";
  return "follow_up";
}

export function asOutcomeMode(value: string): PipelineOutcomeMode {
  if (value === "done_skip" || value === "done_skip_followup" || value === "done_followup") return value;
  return "done_skip";
}

export type CompletePlan =
  | { ok: false; status: 409 | 422; error: string }
  | { ok: true; status: "done" | "skipped" | "follow_up"; already: boolean };

export function planComplete(input: { status: string; outcomeMode: string; outcome: FocusOutcome }): CompletePlan {
  const mode = asOutcomeMode(input.outcomeMode);
  if (!outcomeAllowed(mode, input.outcome)) {
    return { ok: false, status: 422, error: `${input.outcome} is not an outcome for this card` };
  }
  const next = outcomeStatus(input.outcome);
  if (input.status === "dropped") return { ok: false, status: 409, error: "That card was removed from the day" };
  if (TERMINAL.has(input.status)) {
    if (input.status === next) return { ok: true, status: next, already: true };
    return { ok: false, status: 409, error: "Card already has a different outcome" };
  }
  if (input.status !== "open") return { ok: false, status: 409, error: "That card is not open" };
  return { ok: true, status: next, already: false };
}

export function parseDueDatePkt(value: string): Date | null {
  if (!validDatePkt(value)) return null;
  return new Date(`${value}T04:00:00.000Z`);
}

/** Date or datetime interpreted in Asia/Karachi when no zone is present. */
export function parseCompletedAtPkt(value: string): Date | null {
  const trimmed = value.trim();
  if (validDatePkt(trimmed)) return new Date(`${trimmed}T07:00:00.000Z`);
  const local = trimmed.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2})?$/);
  if (local) {
    const seconds = local[3] ?? ":00";
    const date = new Date(`${local[1]}T${local[2]}${seconds}+05:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

type Issue = { path: string; message: string };

function issuesOf(error: z.ZodError): Issue[] {
  return error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}

export type RebuildPreflight =
  | { ok: false; status: number; body: { error: string; issues?: Issue[]; rejected?: RejectedCard[] } }
  | {
      ok: true;
      datePkt: string;
      source: string;
      force: boolean;
      ownerHint: string | null;
      accepted: AcceptedFocusCard[];
      rejected: RejectedCard[];
    };

export function preflightRebuild(input: {
  authorization: string | null;
  secret: string | undefined;
  pathDate: string;
  queryForce: string | null;
  body: unknown;
}): RebuildPreflight {
  const auth = focusIngestAuth(input.authorization, input.secret);
  if (auth === "unconfigured") return { ok: false, status: 501, body: { error: "FOCUS_INGEST_SECRET not configured" } };
  if (auth === "unauthorized") return { ok: false, status: 401, body: { error: "Unauthorized" } };

  const parsed = focusIngestBodySchema.safeParse(input.body);
  if (!parsed.success) {
    return { ok: false, status: 422, body: { error: "Validation failed", issues: issuesOf(parsed.error) } };
  }
  if (!validDatePkt(input.pathDate) || !validDatePkt(parsed.data.datePkt)) {
    return { ok: false, status: 422, body: { error: "datePkt must be a real YYYY-MM-DD day in Asia/Karachi" } };
  }
  if (input.pathDate !== parsed.data.datePkt) {
    return { ok: false, status: 422, body: { error: "datePkt does not match the URL" } };
  }

  const seen = new Set<string>();
  for (const card of parsed.data.cards) {
    if (seen.has(card.cardId)) {
      return { ok: false, status: 422, body: { error: `Duplicate cardId ${card.cardId}` } };
    }
    seen.add(card.cardId);
  }

  const classified = classifyFocusCards(parsed.data.cards);
  if (parsed.data.cards.length > 0 && classified.accepted.length === 0) {
    return {
      ok: false,
      status: 422,
      body: { error: "No cards accepted", rejected: classified.rejected },
    };
  }

  return {
    ok: true,
    datePkt: parsed.data.datePkt,
    source: parsed.data.source,
    force: parseForceFlag(input.queryForce, parsed.data.force),
    ownerHint: parsed.data.owner?.trim() || null,
    accepted: classified.accepted.map((card, index) => ({
      ...card,
      row: { ...card.row, sheetRow: index + 1 },
    })),
    rejected: classified.rejected,
  };
}

export type CompletePreflight =
  | { ok: false; status: number; body: { error: string; issues?: Issue[] } }
  | {
      ok: true;
      outcome: FocusOutcome;
      reason: SkipReason | null;
      dueAt: Date | null;
      returnStamp: string | null;
      note: string | null;
      occurredAt: Date | null;
    };

export function preflightComplete(input: {
  authorization: string | null;
  secret: string | undefined;
  body: unknown;
}): CompletePreflight {
  const auth = focusIngestAuth(input.authorization, input.secret);
  if (auth === "unconfigured") return { ok: false, status: 501, body: { error: "FOCUS_INGEST_SECRET not configured" } };
  if (auth === "unauthorized") return { ok: false, status: 401, body: { error: "Unauthorized" } };

  const parsed = focusCompleteBodySchema.safeParse(input.body);
  if (!parsed.success) {
    return { ok: false, status: 422, body: { error: "Validation failed", issues: issuesOf(parsed.error) } };
  }

  if (parsed.data.outcome === "skip" && !parsed.data.reason) {
    return { ok: false, status: 422, body: { error: "skip needs a reason" } };
  }
  if (parsed.data.outcome !== "skip" && parsed.data.reason) {
    return { ok: false, status: 422, body: { error: "reason is only used with skip" } };
  }

  let dueAt: Date | null = null;
  let returnStamp: string | null = null;
  if (parsed.data.dueDate !== undefined) {
    const skipReturn = parsed.data.outcome === "skip" && parsed.data.reason === "not_now";
    if (parsed.data.outcome !== "needs_follow_up" && !skipReturn) {
      return { ok: false, status: 422, body: { error: "dueDate is only used with needs_follow_up or skip not_now" } };
    }
    dueAt = parseDueDatePkt(parsed.data.dueDate);
    if (!dueAt) return { ok: false, status: 422, body: { error: "dueDate must be YYYY-MM-DD" } };
    if (skipReturn) returnStamp = parsed.data.dueDate;
  }

  let occurredAt: Date | null = null;
  if (parsed.data.completedAtPkt !== undefined) {
    occurredAt = parseCompletedAtPkt(parsed.data.completedAtPkt);
    if (!occurredAt) return { ok: false, status: 422, body: { error: "completedAtPkt is not a valid time" } };
  }

  return {
    ok: true,
    outcome: parsed.data.outcome,
    reason: parsed.data.reason ?? null,
    dueAt,
    returnStamp,
    note: parsed.data.note?.trim() || null,
    occurredAt,
  };
}
