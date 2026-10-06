export const DISCARD_DRAFT_EDITS = "Discard unsaved edits?";

export type DraftFields = { subject: string; body: string; opener: string };

export function draftIsDirty(current: DraftFields, seed: DraftFields): boolean {
  return current.subject !== seed.subject || current.body !== seed.body || current.opener !== seed.opener;
}

/** Same card is a no-op. A dirty card stays put unless the rep confirms the discard. */
export function mayLeaveCardForJump(input: {
  key: string;
  currentKey: string | null;
  dirty: boolean;
  confirmDiscard: (message: string) => boolean;
}): boolean {
  if (input.key === input.currentKey) return false;
  if (!input.dirty) return true;
  return input.confirmDiscard(DISCARD_DRAFT_EDITS);
}

/**
 * Pins a queue card locally. The optional server bag is accepted so callers can
 * prove a jump never logs a skip or any other server action.
 */
export function commitQueueJump(
  key: string,
  setJumpedKey: (key: string | null) => void,
  _serverActions?: Record<string, (...args: never[]) => unknown>,
): void {
  setJumpedKey(key);
}

/** Moves one queue item to the front. The others stay, in the same order, and nothing is logged. */
export function promoteQueueItem<T>(items: readonly T[], key: string | null, getKey: (item: T) => string): T[] {
  if (!key) return items.slice();
  const index = items.findIndex((item) => getKey(item) === key);
  if (index <= 0) return items.slice();
  const next = items.slice();
  const [picked] = next.splice(index, 1);
  if (!picked) return next;
  next.unshift(picked);
  return next;
}
