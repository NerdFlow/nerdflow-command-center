export type WorkingHours = { start: string; end: string; days: number[] };

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
