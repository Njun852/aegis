import "server-only";

import { closeDueMonths, listFinanceBusinessIds, purgeDiscardedIntake } from "@/lib/dal/finance-close";

/**
 * The automatic month-end close: every half hour, for each business with
 * Finance, write Revision 1 of the Monthly Income Report and the Financial
 * Standing Report for any month that has ended and has none. The first pass
 * after midnight Manila on the 1st closes the month just gone; a server that
 * was down catches up on its first pass back.
 *
 * Like the Text Blast timer, it lives in the server process. A host that does
 * not keep the server running schedules `npm run finance:close` instead. The
 * close is idempotent (a unique index on each revision), so a timer that fires
 * twice, or two servers, cannot write a report twice.
 */

const EVERY_MS = 30 * 60_000;
/** Long enough after boot for the database connection to be up. */
const FIRST_RUN_MS = 90_000;

const store = globalThis as typeof globalThis & { aegisFinanceCloseTimer?: NodeJS.Timeout };

/** One pass over every business. A failure in one never stops the others. */
export async function closeAllBusinesses(now = new Date()): Promise<void> {
  let ids: string[];
  try {
    ids = await listFinanceBusinessIds();
  } catch (error) {
    console.error("[finance] could not list businesses:", error instanceof Error ? error.message : error);
    return;
  }
  for (const businessId of ids) {
    try {
      const months = await closeDueMonths(businessId, now);
      if (months.length > 0) console.log(`[finance] ${businessId}: closed ${months.join(", ")}`);
      // The same pass clears Review Queue uploads discarded more than 90 days ago.
      const purged = await purgeDiscardedIntake(businessId, now);
      if (purged > 0) console.log(`[finance] ${businessId}: removed ${purged} discarded uploads`);
    } catch (error) {
      console.error(`[finance] ${businessId} close failed:`, error instanceof Error ? error.message : "unknown error");
    }
  }
}

export function startFinanceCloseTimer(): void {
  // Hot reload re-runs this module; one timer is enough.
  if (store.aegisFinanceCloseTimer) return;
  const first = setTimeout(() => void closeAllBusinesses(), FIRST_RUN_MS);
  first.unref();
  store.aegisFinanceCloseTimer = setInterval(() => void closeAllBusinesses(), EVERY_MS);
  store.aegisFinanceCloseTimer.unref();
  console.log("[finance] month-end close timer started (every 30 minutes)");
}
