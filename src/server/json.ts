/** Fit reasons, review notes, and similar lists are stored as JSON arrays. */
export function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}
