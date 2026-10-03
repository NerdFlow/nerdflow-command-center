import type { LeadStatus, ReplyLabel } from "@prisma/client";

/** Set on the lead when a reply is confirmed. Stops a new Focus card for that lead. */
export const STOP_OUTREACH_SIGNAL = "stopOutreach";

/** Statuses that stop a new outreach card on their own. Cadence "finished" does not. */
const STATUS_BLOCKS: Record<string, string> = {
  do_not_contact: "do_not_contact",
  not_fit: "not_a_fit",
  replied: "replied",
  deal: "deal",
};

const SIGNAL_REASON: Record<string, string> = {
  ...STATUS_BLOCKS,
  finished: "finished",
};

export const REPLY_LABELS = [
  "interested",
  "question",
  "objection",
  "not_now",
  "unsubscribe",
  "out_of_office",
  "wrong_person",
] as const satisfies readonly ReplyLabel[];

export const REPLY_LABEL_TEXT: Record<ReplyLabel, string> = {
  interested: "Interested",
  question: "Asked a question",
  objection: "Objection",
  not_now: "Not now",
  unsubscribe: "Unsubscribe",
  out_of_office: "Out of office",
  wrong_person: "Wrong person",
};

export function asSignalRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function outreachStopped(signals: unknown): boolean {
  return asSignalRecord(signals)[STOP_OUTREACH_SIGNAL] === true;
}

export function withStopOutreach(signals: unknown): Record<string, unknown> {
  return { ...asSignalRecord(signals), [STOP_OUTREACH_SIGNAL]: true };
}

/**
 * Why a new outreach card must not be created for this lead.
 * Null means a Today sync or rebuild may still open one.
 */
export function outreachBlockReason(lead: { status?: string | null; signals?: unknown }): string | null {
  if (outreachStopped(lead.signals)) return SIGNAL_REASON[lead.status ?? ""] ?? "replied";
  if (!lead.status) return null;
  return STATUS_BLOCKS[lead.status] ?? null;
}

/** Lead status once the rep confirms the label. A meeting is the interested deal path. */
export function leadStatusForConfirmedReply(label: ReplyLabel, meeting: boolean): LeadStatus {
  if (label === "unsubscribe") return "do_not_contact";
  if (label === "not_now") return "finished";
  if (label === "interested" || meeting) return "deal";
  return "replied";
}
