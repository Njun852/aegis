"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { refreshMailFreshnessAction } from "@/app/actions/mail";
import { freshnessTone, relativeAge } from "@/lib/freshness";
import type { FreshnessTone } from "@/lib/freshness";
import type { MailFreshnessState } from "@/types";



interface SyncContextValue {
  /** True while a retrieval is in flight. */
  syncing: boolean;
  /** "4 min ago", "2 months ago", "never" — derived from data, never invented. */
  label: string;
  tone: FreshnessTone;
  connected: boolean;
  /** Re-reads freshness from the server. Resolves to the connection state. */
  sync: () => Promise<boolean>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

/** How often the client re-words the age. Below a minute nothing would change. */
const TICK_MS = 30_000;

/**
 * The clock, as an external store.
 *
 * Relative ages have to be worded by the client — the server's "2 months ago"
 * would otherwise freeze at render time — but wording them during hydration
 * would race the server's clock and mismatch the markup. `getServerSnapshot`
 * hands both the server and the hydrating client the same sentinel, and only
 * afterwards does the real clock take over.
 */
const SERVER_TICK = -1;

function subscribeToClock(onChange: () => void) {
  const timer = setInterval(onChange, TICK_MS);
  return () => clearInterval(timer);
}

/** Bucketed, so the snapshot is stable between ticks as the store requires. */
function readClock(): number {
  return Math.floor(Date.now() / TICK_MS);
}

function readServerClock(): number {
  return SERVER_TICK;
}

/**
 * Mail freshness for the whole shell: how old the data is, and whether anything
 * is actually feeding it.
 *
 * This used to be a timer that counted from "2 min ago" and reset itself when
 * the sync button was pressed, which meant the top bar reported a retrieval
 * that had never happened. It now reports the newest message AEGIS actually
 * holds, and says "never" when that is the truth.
 */
export function SyncProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial: MailFreshnessState;
}) {
  const [state, setState] = useState(initial);
  const [syncing, setSyncing] = useState(false);
  const tick = useSyncExternalStore(
    subscribeToClock,
    readClock,
    readServerClock,
  );

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      const next = await refreshMailFreshnessAction();
      setState((current) => ({ ...current, ...next }));
      return next.connected;
    } finally {
      setSyncing(false);
    }
  }, []);

  const value = useMemo<SyncContextValue>(() => {
    // Before the clock takes over, the server's own wording; after it, the live
    // one, re-derived from the data rather than counted down from anything.
    const now = tick === SERVER_TICK ? null : tick * TICK_MS;
    const label =
      now === null ? state.label : relativeAge(state.newestReceivedAt, now);
    const tone =
      now === null ? state.tone : freshnessTone(state.newestReceivedAt, now);

    return {
      syncing,
      label,
      tone,
      connected: state.connected,
      sync,
    };
  }, [tick, state, syncing, sync]);

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error("useSync must be used inside a SyncProvider");
  }
  return context;
}
