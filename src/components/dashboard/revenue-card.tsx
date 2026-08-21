"use client";

import { BarChart, Card, DeltaIndicator, LegendItem } from "@/components/ui";
import { useDashboardRange } from "./dashboard-range-provider";

export function RevenueCard() {
  const { data } = useDashboardRange();

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
          <DeltaIndicator value={data.revenueDelta} size={11} />
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
      />
    </Card>
  );
}
