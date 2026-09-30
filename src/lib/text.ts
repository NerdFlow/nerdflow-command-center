/** Some fit reasons/flags/signal keys are stored as raw snake_case (e.g. "instagram_active_14d") instead of prose - display them readably either way. */
export function humanizeTag(s: string): string {
  if (!/^[a-z0-9]+(_[a-z0-9]+)+$/.test(s)) return s;
  return s.replace(/_/g, " ");
}
