"use client";

import { useEffect, useEffectEvent } from "react";

export interface AutoSyncOptions {
  /** Set false to stop the timer, e.g. while there is nothing to sync. */
  enabled?: boolean;
  /** Run once as soon as the screen opens, rather than a full interval later. */
  immediate?: boolean;
}

/** Timers drift; a turn this close to due counts as due. */
const SLACK_MS = 1_000;

/**
 * Runs `work` on a fixed interval for as long as the screen is open. It is what
 * replaced the "Sync now", "Re-check now" and "Refresh" buttons.
 *
 * Only while the tab is visible: a hidden tab polling a mailbox or Meta spends
 * calls, and for mail AI triage, on figures nobody is looking at. Coming back
 * to the tab after a missed turn runs one straight away.
 *
 * Never two at once: a run still in flight when the next falls due is skipped
 * rather than queued, so a slow mailbox cannot pile up behind itself.
 *
 * `work` reports its own outcome. A throw is swallowed here so that one bad
 * run never stops the timer.
 */
export function useAutoSync(
  work: () => Promise<unknown> | void,
  everyMs: number,
  { enabled = true, immediate = true }: AutoSyncOptions = {},
): void {
  const run = useEffectEvent(work);

  useEffect(() => {
    if (!enabled) return;
    let running = false;
    let lastRun = immediate ? -Infinity : Date.now();

    const tick = async () => {
      if (running || document.visibilityState !== "visible") return;
      if (Date.now() - lastRun < everyMs - SLACK_MS) return;
      running = true;
      lastRun = Date.now();
      try {
        await run();
      } catch {
        // Reported by `work` itself; the timer carries on regardless.
      } finally {
        running = false;
      }
    };

    const timer = setInterval(() => void tick(), everyMs);
    const onVisible = () => void tick();
    document.addEventListener("visibilitychange", onVisible);
    void tick();

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, everyMs, immediate]);
}
