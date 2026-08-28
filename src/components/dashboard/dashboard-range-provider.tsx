"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { DASHBOARD_RANGES, DEFAULT_DATE_RANGE } from "@/lib/data/dashboard";
import type { DashboardRangeData, DateRange, LedgerRevenue } from "@/types";

interface DashboardRangeContextValue {
  range: DateRange;
  setRange: (range: DateRange) => void;
  data: DashboardRangeData;
}

const DashboardRangeContext = createContext<DashboardRangeContextValue | null>(
  null,
);

export interface DashboardRangeProviderProps {
  children: ReactNode;
  /** Real revenue from the `transactions` ledger, aggregated per range. */
  revenue: LedgerRevenue;
}

/**
 * Shares the selected date range across the header and every card it drives.
 *
 * Revenue comes from the ledger and overrides the sample figures; the rest of
 * `DASHBOARD_RANGES` — balance, expenses, net profit, bookings, ads, alerts —
 * is still invented, because nothing feeds those yet.
 */
export function DashboardRangeProvider({
  children,
  revenue,
}: DashboardRangeProviderProps) {
  const [range, setRange] = useState<DateRange>(DEFAULT_DATE_RANGE);

  const value = useMemo<DashboardRangeContextValue>(() => {
    const sample = DASHBOARD_RANGES[range];
    const real = revenue[range];

    return {
      range,
      setRange,
      data: {
        ...sample,
        revenueTotal: real.total,
        revenueDelta: real.delta,
        revenueMonths: real.months,
        revenueHighlightMonth: real.highlightMonth,
        kpis: sample.kpis.map((kpi) =>
          kpi.label === "Revenue"
            ? {
                ...kpi,
                value: real.total,
                delta: real.delta,
                points: real.points,
              }
            : kpi,
        ),
      },
    };
  }, [range, revenue]);

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
