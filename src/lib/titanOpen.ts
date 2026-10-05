/** Shown on a disabled Open in Titan control when the card has no message yet. */
export const TITAN_NO_DRAFT_HINT = "Generate or paste a draft first";

export type TitanOpenState = {
  visible: boolean;
  enabled: boolean;
  href: string | null;
  reasons: string[];
  hint: string | null;
};

/**
 * Email Focus always shows Open in Titan when there is an address.
 * The checklist still disables it, with the same block reasons Copy and Done use.
 * An empty draft stays visible and explains what to do next.
 */
export function titanOpenState(input: {
  show: boolean;
  href: string | null;
  sendBlocked: boolean;
  reasons: readonly string[];
  hasDraft: boolean;
}): TitanOpenState {
  if (!input.show) {
    return { visible: false, enabled: false, href: null, reasons: [], hint: null };
  }
  const reasons = input.sendBlocked ? [...input.reasons] : [];
  const hint = input.hasDraft ? null : TITAN_NO_DRAFT_HINT;
  const enabled = input.hasDraft && !input.sendBlocked && Boolean(input.href);
  return {
    visible: true,
    enabled,
    href: enabled ? input.href : null,
    reasons,
    hint,
  };
}
