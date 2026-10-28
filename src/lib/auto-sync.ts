/**
 * How often AEGIS syncs on its own, now that there are no sync buttons. Shared
 * by the timers and the screens that say how often they update, so the two can
 * never disagree.
 *
 * These run in the browser, for the active business, while a signed-in tab is
 * open and visible. The server adds its own limits on top: one inbox sync per
 * business a minute, and one Meta read per account every two minutes.
 */

/** The mailbox: retrieval, then AI triage and suggested replies for what arrived. */
export const MAIL_SYNC_EVERY_MS = 2 * 60_000;

/** The connected Meta ad account, read-only. */
export const ADS_SYNC_EVERY_MS = 5 * 60_000;

/** Screens that only re-read what AEGIS already holds: System Status, Text Blast. */
export const RECHECK_EVERY_MS = 60_000;

/** "2 minutes", "5 minutes", "minute": for copy such as "updates every …". */
export function everyLabel(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  return minutes === 1 ? "minute" : `${minutes} minutes`;
}
