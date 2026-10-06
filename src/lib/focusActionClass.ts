/**
 * Disabled controls use this class alone.
 * Primary fill and hover utilities are omitted, so they cannot paint over the muted look.
 */
const DISABLED =
  "inline-flex items-center justify-center border border-rule bg-panel text-muted font-semibold rounded-xl opacity-40 cursor-not-allowed";

const QUIET =
  "inline-flex items-center justify-center border border-rule bg-panel text-ink font-semibold rounded-xl hover:border-accent/40";

const PRIMARY =
  "inline-flex items-center justify-center bg-accent text-on-accent font-semibold rounded-xl hover:bg-accent-hover";

const SIZE = {
  md: "px-5 py-3 text-[15px]",
  sm: "px-4 py-2 text-sm",
} as const;

export function focusActionClass(input: { tone: "primary" | "quiet"; disabled: boolean; size?: "md" | "sm" }): string {
  const size = SIZE[input.size ?? "md"];
  const tone = input.disabled ? DISABLED : input.tone === "primary" ? PRIMARY : QUIET;
  return `${tone} ${size}`;
}
