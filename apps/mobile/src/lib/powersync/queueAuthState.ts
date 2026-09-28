/**
 * In-memory signals from queue workers that authentication is the reason work
 * is blocked. Queue counts remain owned by PowerSync/SQLite; callers must pair
 * these signals with their source's current queued count before presenting a
 * waiting state.
 */
export type AuthBlockedQueueSource = "rows" | "media" | "deleteRetries"

const blocked = new Set<AuthBlockedQueueSource>()

export function setQueueAuthBlocked(
  source: AuthBlockedQueueSource,
  isBlocked: boolean,
): void {
  if (isBlocked) blocked.add(source)
  else blocked.delete(source)
}

export function isQueueAuthBlocked(source: AuthBlockedQueueSource): boolean {
  return blocked.has(source)
}

export function clearQueueAuthBlocked(
  source: AuthBlockedQueueSource,
): void {
  blocked.delete(source)
}

/** Test and lifecycle helper for resetting all process-local worker signals. */
export function resetQueueAuthBlockedState(): void {
  blocked.clear()
}
