import { z } from "zod";
import { leadHasPhone } from "@/lib/focusQueue";
import { addDaysToStamp } from "@/lib/skipReason";
import { zonedToUtc } from "@/server/cadence";

export const FOCUS_TIME_ZONE = "Asia/Karachi";

export const CADENCE_CHANNELS = ["email", "linkedin", "call"] as const;
export type CadenceChannel = (typeof CADENCE_CHANNELS)[number];

export type FocusCadenceStep = { day: number; channel: CadenceChannel };

/** Email, then LinkedIn, then two more emails. No call unless the team adds one. */
export const DEFAULT_FOCUS_CADENCE: FocusCadenceStep[] = [
  { day: 0, channel: "email" },
  { day: 2, channel: "linkedin" },
  { day: 4, channel: "email" },
  { day: 10, channel: "email" },
];

const stepSchema = z.object({
  day: z.number().int().min(0).max(365),
  channel: z.enum(CADENCE_CHANNELS),
});

const cadenceSchema = z.array(stepSchema).min(1).max(12);

export type CadenceContact = {
  email: string | null;
  emailInvalid: boolean;
  linkedinUrl: string | null;
  phone: string | null;
};

export type CadenceView =
  | { state: "due" | "waiting"; stepIndex: number; channel: CadenceChannel; dueOn: string }
  | { state: "finished" };

export function parseFocusCadence(value: unknown): FocusCadenceStep[] {
  const parsed = cadenceSchema.safeParse(value);
  if (!parsed.success) return DEFAULT_FOCUS_CADENCE.map((step) => ({ ...step }));
  return [...parsed.data].sort((a, b) => a.day - b.day);
}

export function cadenceContact(lead: {
  email: string | null;
  emailVerification?: string | null;
  linkedinUrl: string | null;
  phone: string | null;
  signals?: unknown;
}): CadenceContact {
  const signals =
    lead.signals && typeof lead.signals === "object" && !Array.isArray(lead.signals)
      ? (lead.signals as Record<string, unknown>)
      : {};
  return {
    email: lead.email,
    emailInvalid: lead.emailVerification === "invalid" || signals.emailInvalid === true,
    linkedinUrl: lead.linkedinUrl,
    phone: lead.phone,
  };
}

/** Start of that Asia/Karachi calendar day, as a UTC instant. */
export function pktDayStart(stamp: string): Date {
  const [year, month, day] = stamp.split("-").map(Number);
  return zonedToUtc(year ?? 1970, month ?? 1, day ?? 1, 0, 0, FOCUS_TIME_ZONE);
}

export function stepUsable(step: FocusCadenceStep, contact: CadenceContact, ownerChannels: readonly string[]): boolean {
  if (!ownerChannels.includes(step.channel)) return false;
  if (step.channel === "email") {
    const email = contact.email?.trim() ?? "";
    return email.includes("@") && !contact.emailInvalid;
  }
  if (step.channel === "linkedin") return /linkedin\.com/i.test(contact.linkedinUrl?.trim() ?? "");
  return leadHasPhone(contact.phone);
}

/**
 * The step Focus may show, starting at `startIndex`.
 * Unusable steps are jumped. A usable step stays hidden until its Asia/Karachi day.
 */
export function walkCadence(input: {
  cadence: FocusCadenceStep[];
  startIndex: number;
  anchor: string;
  today: string;
  contact: CadenceContact;
  ownerChannels: readonly string[];
}): CadenceView {
  const steps = input.cadence;
  if (steps.length === 0) return { state: "finished" };
  let index = Math.max(0, input.startIndex);
  while (index < steps.length) {
    const step = steps[index];
    if (!step || !stepUsable(step, input.contact, input.ownerChannels)) {
      index += 1;
      continue;
    }
    const dueOn = addDaysToStamp(input.anchor, step.day);
    if (dueOn > input.today) return { state: "waiting", stepIndex: index, channel: step.channel, dueOn };
    return { state: "due", stepIndex: index, channel: step.channel, dueOn };
  }
  return { state: "finished" };
}

export type RoutedCadencePlacement = {
  stepIndex: number;
  /** Null when the replacement card is the step and should show now. */
  dueOn: string | null;
  /** The routed channel is itself a cadence step, so the queue must not open another one. */
  matchedCadenceStep: boolean;
};

/**
 * A skip that already opened LinkedIn (or a call) occupies that cadence step.
 * It does not schedule a second card for the same channel.
 * A channel that is not in the sequence leaves the following step on its own day.
 */
export function placeRoutedChannel(input: {
  cadence: FocusCadenceStep[];
  stepIndex: number;
  routedChannel: "linkedin" | "call";
  anchor: string;
  today: string;
  contact: CadenceContact;
  ownerChannels: readonly string[];
}): RoutedCadencePlacement {
  const start = Math.max(0, input.stepIndex);
  const match = input.cadence.findIndex((step, index) => index >= start && step.channel === input.routedChannel);
  if (match >= 0) return { stepIndex: match, dueOn: null, matchedCadenceStep: true };
  const next = walkCadence({ ...input, startIndex: start + 1 });
  if (next.state === "finished") return { stepIndex: input.cadence.length, dueOn: null, matchedCadenceStep: false };
  return { stepIndex: next.stepIndex, dueOn: next.dueOn, matchedCadenceStep: false };
}

/** An open pipeline card is the lead's Focus card. The cadence queue does not add another. */
export function queueLeadBlockedByPipeline(leadId: string, openPipelineLeadIds: ReadonlySet<string>): boolean {
  return openPipelineLeadIds.has(leadId);
}
