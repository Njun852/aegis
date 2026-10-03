import "server-only";

import { listSweepBusinessIds, runReminderSweep } from "@/lib/dal/text-blast";

/**
 * The background job behind "fully automatic": every fifteen minutes, run the
 * reminder sweep for each business that has Text Blast and has switched it on.
 *
 * It lives in the server process, so it runs wherever AEGIS runs as a
 * long-lived server (`next dev`, `next start`). A host that suspends idle
 * servers would stop it; `npm run sms:run` does the same pass for an external
 * scheduler in that case.
 *
 * The sweep is idempotent, so a timer that fires twice, or two servers running
 * one each, cannot text anyone twice.
 */

const EVERY_MS = 15 * 60_000;
/** Long enough after boot for the database connection to be up. */
const FIRST_RUN_MS = 60_000;

const store = globalThis as typeof globalThis & { aegisTextBlastTimer?: NodeJS.Timeout };

/** One pass over every business. A failure in one never stops the others. */
export async function sweepAllBusinesses(now = new Date()): Promise<void> {
  let ids: string[];
  try {
    ids = await listSweepBusinessIds();
  } catch (error) {
    console.error("[text-blast] could not list businesses:", error instanceof Error ? error.message : error);
    return;
  }

  for (const businessId of ids) {
    try {
      const result = await runReminderSweep(businessId, now);
      if (result.created || result.sent || result.failed || result.expired) {
        console.log(`[text-blast] ${businessId}: ${result.note}`);
      }
    } catch (error) {
      // The message only: a provider error could carry a phone number.
      console.error(`[text-blast] ${businessId} failed:`, error instanceof Error ? error.message : "unknown error");
    }
  }
}

export function startTextBlastTimer(): void {
  // Hot reload re-runs this module; one timer is enough.
  if (store.aegisTextBlastTimer) return;

  const first = setTimeout(() => void sweepAllBusinesses(), FIRST_RUN_MS);
  first.unref();
  store.aegisTextBlastTimer = setInterval(() => void sweepAllBusinesses(), EVERY_MS);
  // Never the reason the process stays alive.
  store.aegisTextBlastTimer.unref();
  console.log("[text-blast] reminder timer started (every 15 minutes)");
}
