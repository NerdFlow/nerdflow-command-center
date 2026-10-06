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
