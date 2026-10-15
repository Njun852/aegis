"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { DEFAULT_DATE_RANGE } from "@/lib/data/dashboard";
import type { AdSummary, AlertRow, DashboardRangeData, DateRange } from "@/types";

interface DashboardRangeContextValue {
  range: DateRange;
  setRange: (range: DateRange) => void;
  data: DashboardRangeData;
  alerts: AlertRow[];
  ads: AdSummary | null;
}

const DashboardRangeContext = createContext<DashboardRangeContextValue | null>(
  null,
);

export interface DashboardRangeProviderProps {
  children: ReactNode;
  /** Every range's figures, built on the server from the business's records. */
  ranges: Record<DateRange, DashboardRangeData>;
  /** What needs attention now; the same whatever range is picked. */
  alerts: AlertRow[];
  /** The ad account's last 30 days, or null without one. */
  ads: AdSummary | null;
}

/**
 * Shares the selected date range across the header and every card it drives.
 * All three ranges arrive from the server at once, so switching is instant.
 */
export function DashboardRangeProvider({ children, ranges, alerts, ads }: DashboardRangeProviderProps) {
  const [range, setRange] = useState<DateRange>(DEFAULT_DATE_RANGE);

  const value = useMemo<DashboardRangeContextValue>(
    () => ({ range, setRange, data: ranges[range], alerts, ads }),
    [range, ranges, alerts, ads],
  );

  return (
    <DashboardRangeContext.Provider value={value}>
      {children}
    </DashboardRangeContext.Provider>
  );
}

export function useDashboardRange() {
  const context = useContext(DashboardRangeContext);
  if (!context) {
    throw new Error(
      "useDashboardRange must be used inside a DashboardRangeProvider",
    );
  }
  return context;
}
