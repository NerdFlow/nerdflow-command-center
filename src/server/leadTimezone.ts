import { zonedParts } from "@/server/cadence";

/**
 * Approximation, not real geocoding: US state/territory -> a representative
 * IANA timezone. States that span multiple zones (TX, FL, ID, etc.) get
 * their most-populous zone. Good enough to show "it's 2pm there" and gate
 * calling hours without an actual geocoding integration — labeled as such
 * everywhere it's surfaced, never presented as precise.
 */
const US_STATE_TIMEZONE: Record<string, string> = {
  AL: "America/Chicago", AK: "America/Anchorage", AZ: "America/Phoenix", AR: "America/Chicago",
  CA: "America/Los_Angeles", CO: "America/Denver", CT: "America/New_York", DE: "America/New_York",
  FL: "America/New_York", GA: "America/New_York", HI: "Pacific/Honolulu", ID: "America/Denver",
  IL: "America/Chicago", IN: "America/Indiana/Indianapolis", IA: "America/Chicago", KS: "America/Chicago",
  KY: "America/New_York", LA: "America/Chicago", ME: "America/New_York", MD: "America/New_York",
  MA: "America/New_York", MI: "America/Detroit", MN: "America/Chicago", MS: "America/Chicago",
  MO: "America/Chicago", MT: "America/Denver", NE: "America/Chicago", NV: "America/Los_Angeles",
  NH: "America/New_York", NJ: "America/New_York", NM: "America/Denver", NY: "America/New_York",
  NC: "America/New_York", ND: "America/Chicago", OH: "America/New_York", OK: "America/Chicago",
  OR: "America/Los_Angeles", PA: "America/New_York", RI: "America/New_York", SC: "America/New_York",
  SD: "America/Chicago", TN: "America/Chicago", TX: "America/Chicago", UT: "America/Denver",
  VT: "America/New_York", VA: "America/New_York", WA: "America/Los_Angeles", WV: "America/New_York",
  WI: "America/Chicago", WY: "America/Denver", DC: "America/New_York",
};

/** Falls back to the rep's own timezone when the lead's region isn't a recognized US state. */
export function timezoneForLead(lead: { region: string | null; country: string | null }, repTimezone: string): { timezone: string; isApproximate: boolean } {
  const region = lead.region?.trim().toUpperCase();
  if (region && (!lead.country || lead.country === "US") && US_STATE_TIMEZONE[region]) {
    return { timezone: US_STATE_TIMEZONE[region], isApproximate: true };
  }
  return { timezone: repTimezone, isApproximate: true };
}

export function leadLocalTimeStatus(lead: { region: string | null; country: string | null }, repTimezone: string, businessHours = { start: 9, end: 18 }) {
  const { timezone, isApproximate } = timezoneForLead(lead, repTimezone);
  const now = zonedParts(new Date(), timezone);
  const inBusinessHours = now.isoWeekday <= 5 && now.hour >= businessHours.start && now.hour < businessHours.end;
  const hour12 = now.hour % 12 === 0 ? 12 : now.hour % 12;
  const ampm = now.hour < 12 ? "AM" : "PM";
  const label = `${hour12}:${String(now.minute).padStart(2, "0")} ${ampm}`;
  return { timezone, isApproximate, inBusinessHours, label };
}
