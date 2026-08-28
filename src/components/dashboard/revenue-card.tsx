"use client";

import { BarChart, Card, DeltaIndicator, LegendItem } from "@/components/ui";
import { useDashboardRange } from "./dashboard-range-provider";
import type { DateRange } from "@/types";

const DELTA_CAPTION: Record<DateRange, string> = {
  "This month": "from last month",
  "Last month": "from the month before",
  "This quarter": "from last quarter",
};

export function RevenueCard() {
  const { data, range } = useDashboardRange();

  return (
    <Card title="Revenue Overview" padding="16px">
      <div className="mb-2.5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-metric-size)",
              lineHeight: "var(--text-metric-lh)",
              fontWeight: 700,
              letterSpacing: "var(--text-metric-ls)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {data.revenueTotal}
          </div>
          <DeltaIndicator
            value={data.revenueDelta}
            caption={DELTA_CAPTION[range]}
            size={11}
          />
        </div>
        <div className="flex items-center gap-[18px]">
          <LegendItem color="var(--viz-1)" label="Revenue" />
          <LegendItem color="var(--viz-2)" label="Expense" />
        </div>
      </div>
      <BarChart
        data={data.revenueMonths}
        height={160}
        highlight={data.revenueHighlightMonth}
        formatY={(value) =>
          value >= 1000 ? `$${Math.round(value / 1000)}K` : `$${Math.round(value)}`
        }
      />
    </Card>
  );
}
