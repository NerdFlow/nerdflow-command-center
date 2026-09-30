import type { CampaignStrategy } from "@/server/strategy";
import type { Channel } from "@prisma/client";

export type WorkingHours = { start: string; end: string; days: number[] };

/** Channels the campaign playbook actually allows (strategy.channels). */
export function campaignAllowedChannels(strategy: CampaignStrategy | null | undefined): Channel[] {
  const listed = strategy?.channels?.map((c) => c.channel) ?? [];
  if (listed.length > 0) return Array.from(new Set(listed));
  // No channel list → fall back to whatever appears in the cadence, else email.
  const fromCadence = strategy?.cadence?.map((c) => c.channel) ?? [];
  if (fromCadence.length > 0) return Array.from(new Set(fromCadence));
  return ["email"];
}

/**
 * Effective Focus channel for a lead. Honours a per-lead override when it is
 * still allowed; otherwise uses the current cadence step if that channel is
 * allowed; otherwise the next allowed step from here (or the first allowed
 * channel). Email-only campaigns never resolve to call.
 */
export function resolveLeadChannel(params: {
  strategy: CampaignStrategy | null | undefined;
  cadenceStep: number;
  nextChannelOverride?: Channel | null;
}): Channel {
  const allowed = campaignAllowedChannels(params.strategy);
  const cadence = params.strategy?.cadence ?? [];

  if (params.nextChannelOverride && allowed.includes(params.nextChannelOverride)) {
    return params.nextChannelOverride;
  }

  const current = cadence[params.cadenceStep];
  if (current && allowed.includes(current.channel)) return current.channel;

  for (let i = Math.max(params.cadenceStep, 0); i < cadence.length; i++) {
    const step = cadence[i];
    if (step && allowed.includes(step.channel)) return step.channel;
  }
  for (const step of cadence) {
    if (allowed.includes(step.channel)) return step.channel;
  }
  return allowed[0] ?? "email";
}

/**
 * True when the campaign's allowed channels do not include the channel stored
 * on the lead's current cadence step (typical: email-only campaign whose
 * playbook cadence still starts with a leftover Day 0 call).
 */
export function leadNeedsChannelRealign(params: {
  strategy: CampaignStrategy | null | undefined;
  cadenceStep: number;
  nextChannelOverride?: Channel | null;
}): boolean {
  if (params.nextChannelOverride) {
    const allowed = campaignAllowedChannels(params.strategy);
    return !allowed.includes(params.nextChannelOverride);
  }
  const cadence = params.strategy?.cadence ?? [];
  const current = cadence[params.cadenceStep];
  if (!current) return false;
  const allowed = campaignAllowedChannels(params.strategy);
  return !allowed.includes(current.channel);
}

/**
 * Plans the next cadence index after a non-terminal touch. Skips steps whose
 * channel is not in the campaign's allowed channels, so an email-only campaign
 * never schedules a call. Optional followUpChannel becomes a per-lead override.
 */
export function planNextCadenceStep(params: {
  strategy: CampaignStrategy | null | undefined;
  currentStep: number;
  followUpChannel?: Channel | null;
}): {
  finished: boolean;
  cadenceStep: number;
  dayDelta: number;
  nextChannelOverride: Channel | null;
  nextChannel: Channel | null;
} {
  const cadence = params.strategy?.cadence ?? [];
  const allowed = campaignAllowedChannels(params.strategy);
  const currentStepDef = cadence[params.currentStep];

  let nextIdx = params.currentStep + 1;
  while (nextIdx < cadence.length) {
    const step = cadence[nextIdx];
    if (step && allowed.includes(step.channel)) break;
    nextIdx += 1;
  }

  const nextStepDef = nextIdx < cadence.length ? cadence[nextIdx] : undefined;
  const hadFurtherSteps = params.currentStep + 1 < cadence.length;

  if (!nextStepDef && !params.followUpChannel) {
    // Remaining cadence steps existed but were all on disallowed channels
    // (email-only campaign whose playbook ends on a call). Stay on an allowed
    // channel after a short wait — never schedule the disallowed call.
    const stayOn = allowed[0];
    if (hadFurtherSteps && stayOn) {
      return {
        finished: false,
        cadenceStep: params.currentStep,
        dayDelta: 3,
        nextChannelOverride: stayOn,
        nextChannel: stayOn,
      };
    }
    return { finished: true, cadenceStep: params.currentStep, dayDelta: 0, nextChannelOverride: null, nextChannel: null };
  }

  const dayDelta = nextStepDef ? nextStepDef.day - (currentStepDef?.day ?? 0) : 1;
  const nextDefaultChannel = nextStepDef?.channel ?? currentStepDef?.channel ?? allowed[0] ?? "email";
  const followUp = params.followUpChannel && allowed.includes(params.followUpChannel) ? params.followUpChannel : null;
  const nextChannelOverride = followUp && followUp !== nextDefaultChannel ? followUp : null;
  const nextChannel = nextChannelOverride ?? nextDefaultChannel;

  return {
    finished: false,
    cadenceStep: nextStepDef ? nextIdx : params.currentStep + 1,
    dayDelta: Math.max(dayDelta, 0),
    nextChannelOverride,
    nextChannel,
  };
}

/** Split a playbook email draft ("Subject: …\\n\\nbody") into subject + body. */
export function splitEmailDraft(draft: string): { subject: string; body: string } {
  const trimmed = draft.replace(/^\uFEFF/, "");
  const match = /^(?:Subject|SUBJECT)\s*:\s*(.*?)(?:\r?\n)([\s\S]*)$/m.exec(trimmed);
  if (!match) return { subject: "", body: trimmed.trim() };
  const subject = (match[1] ?? "").trim();
  const body = (match[2] ?? "").replace(/^\r?\n/, "").trimEnd();
  return { subject, body };
}

export function joinEmailDraft(subject: string, body: string): string {
  const sub = subject.trim();
  const bod = body.replace(/^\n+/, "");
  if (!sub) return bod;
  return `Subject: ${sub}\n\n${bod}`;
}

const WEEKDAY_TO_ISO: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

function offsetMinutesAt(timeZone: string, instant: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) parts[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - instant.getTime()) / 60000;
}

/** Wall-clock date/time in `timeZone` for a given instant. */
export function zonedParts(instant: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    isoWeekday: WEEKDAY_TO_ISO[parts.weekday ?? ""] ?? 1,
  };
}

/** Converts a wall-clock date/time as observed in `timeZone` to a UTC instant. */
export function zonedToUtc(
  y: number,
  m: number,
  d: number,
  hh: number,
  mm: number,
  timeZone: string,
): Date {
  let guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const offset = offsetMinutesAt(timeZone, guess);
  guess = new Date(guess.getTime() - offset * 60000);
  const offset2 = offsetMinutesAt(timeZone, guess);
  if (offset2 !== offset) {
    guess = new Date(Date.UTC(y, m - 1, d, hh, mm) - offset2 * 60000);
  }
  return guess;
}

function addCalendarDays(y: number, m: number, d: number, delta: number) {
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function isoWeekdayOf(y: number, m: number, d: number) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  const jsDay = dt.getUTCDay(); // 0 = Sun
  return jsDay === 0 ? 7 : jsDay;
}

/**
 * Schedules the next cadence step at occurredAt + dayDelta calendar days,
 * landing inside the rep's working hours (per SPEC 5.4). Same-day steps keep
 * the current time if it's already inside working hours; everything else
 * lands at the working-day start time. Weekends/off-days roll forward to the
 * next configured working day.
 */
export function scheduleNextTouch(params: {
  occurredAt: Date;
  dayDelta: number;
  timezone: string;
  workingHours: WorkingHours;
}): Date {
  const { occurredAt, dayDelta, timezone, workingHours } = params;
  const now = zonedParts(occurredAt, timezone);
  let { y, m, d } = addCalendarDays(now.year, now.month, now.day, Math.max(dayDelta, 0));

  const [startH, startM] = workingHours.start.split(":").map(Number);
  const [endH, endM] = workingHours.end.split(":").map(Number);
  const days = workingHours.days?.length ? workingHours.days : [1, 2, 3, 4, 5];

  let targetHour = startH ?? 9;
  let targetMinute = startM ?? 0;

  if (dayDelta === 0) {
    const nowMinutes = now.hour * 60 + now.minute;
    const startMinutes = (startH ?? 9) * 60 + (startM ?? 0);
    const endMinutes = (endH ?? 17) * 60 + (endM ?? 30);
    if (nowMinutes >= startMinutes && nowMinutes <= endMinutes) {
      targetHour = now.hour;
      targetMinute = now.minute;
    }
  }

  let guardRail = 0;
  while (!days.includes(isoWeekdayOf(y, m, d)) && guardRail < 14) {
    ({ y, m, d } = addCalendarDays(y, m, d, 1));
    targetHour = startH ?? 9;
    targetMinute = startM ?? 0;
    guardRail += 1;
  }

  return zonedToUtc(y, m, d, targetHour, targetMinute, timezone);
}
