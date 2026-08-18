"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

interface SyncContextValue {
  /** True while a retrieval is in flight. */
  syncing: boolean;
  /** Human-readable freshness for the top bar: "syncing…" or "2 min ago". */
  label: string;
  sync: () => void;
}

const SyncContext = createContext<SyncContextValue | null>(null);

const SYNC_DURATION_MS = 1100;

/**
 * Mail triggers a sync, the top bar reports it. Sharing that through context
 * keeps the two sides of the shell in step without prop-drilling through pages.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const [syncing, setSyncing] = useState(false);
  const [minutesAgo, setMinutesAgo] = useState(2);

  const sync = useCallback(() => {
    setSyncing(true);
    setTimeout(() => {
      setSyncing(false);
      setMinutesAgo(0);
    }, SYNC_DURATION_MS);
  }, []);

  const value = useMemo<SyncContextValue>(
    () => ({
      syncing,
      label: syncing ? "syncing…" : `${minutesAgo} min ago`,
      sync,
    }),
    [syncing, minutesAgo, sync],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error("useSync must be used inside a SyncProvider");
  }
  return context;
}
