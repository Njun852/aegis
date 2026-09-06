/**
 * How old a piece of live data is, and whether that age should worry someone.
 *
 * Deliberately pure and free of `server-only`: the server renders the first
 * label so the markup matches, and the client re-derives it as time passes.
 * Both sides must agree on the wording, so both call this.
 */

/** Mail is expected to be retrieved at least this often once a mailbox is connected. */
export const MAIL_STALE_AFTER_MS = 30 * 60 * 1000;

export type FreshnessTone = "fresh" | "stale" | "never";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"} ago`;
}

/**
 * "just now", "4 min ago", "3 hours ago", "2 months ago" — or "never" when
 * there is no timestamp at all, which is a state the UI must be able to say
 * out loud rather than hide behind a plausible-looking number.
 */
export function relativeAge(iso: string | null, now: number = Date.now()): string {
  if (!iso) return "never";

  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown";

  const elapsed = Math.max(0, now - then);
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return plural(Math.floor(elapsed / MINUTE), "min");
  if (elapsed < DAY) return plural(Math.floor(elapsed / HOUR), "hour");
  if (elapsed < MONTH) return plural(Math.floor(elapsed / DAY), "day");
  return plural(Math.floor(elapsed / MONTH), "month");
}

/**
 * Whether data of this age may still be presented as current. `never` is kept
 * distinct from `stale`: "we have never retrieved this" and "we retrieved this
 * too long ago" are different problems with different fixes.
 */
export function freshnessTone(
  iso: string | null,
  now: number = Date.now(),
  staleAfterMs: number = MAIL_STALE_AFTER_MS,
): FreshnessTone {
  if (!iso) return "never";

  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never";

  return now - then > staleAfterMs ? "stale" : "fresh";
}
