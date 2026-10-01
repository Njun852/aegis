import "server-only";

/**
 * A sliding-window counter for the public booking page, keyed by action and
 * visitor address.
 *
 * Held in this process's memory, so it resets when the server restarts and is
 * not shared between instances. That is enough to stop one person or script
 * filling the book from one address on a single-server install; a deployment
 * with several instances needs a shared store instead.
 */
const hits = new Map<string, number[]>();

/** Returns true when the call is allowed, and records it. */
export function allow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);

  // Keeps the map from growing without bound on a long-running server.
  if (hits.size > 5000) {
    for (const [entry, times] of hits) {
      if (times.every((at) => now - at >= windowMs)) hits.delete(entry);
    }
  }
  return true;
}
