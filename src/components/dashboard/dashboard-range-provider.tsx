"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { DASHBOARD_RANGES, DEFAULT_DATE_RANGE } from "@/lib/data/dashboard";
import type { DashboardRangeData, DateRange } from "@/types";

interface DashboardRangeContextValue {
  range: DateRange;
  setRange: (range: DateRange) => void;
  data: DashboardRangeData;
}

const DashboardRangeContext = createContext<DashboardRangeContextValue | null>(
  null,
);

/** Shares the selected date range across the header and every card it drives. */
export function DashboardRangeProvider({ children }: { children: ReactNode }) {
  const [range, setRange] = useState<DateRange>(DEFAULT_DATE_RANGE);

  const value = useMemo<DashboardRangeContextValue>(
    () => ({ range, setRange, data: DASHBOARD_RANGES[range] }),
    [range],
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
