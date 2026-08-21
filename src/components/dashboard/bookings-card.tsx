"use client";

import { Card, DeltaIndicator, LegendItem } from "@/components/ui";
import { useDashboardRange } from "./dashboard-range-provider";

export function BookingsCard() {
  const { data } = useDashboardRange();

  return (
    <Card title="Bookings" padding="16px">
      <div className="flex flex-col gap-3">
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
            {data.bookingsTotal}
          </div>
          <DeltaIndicator value={data.bookingsDelta} size={11} />
        </div>
        <div className="flex flex-col gap-2.5">
          {data.bookingRows.map((row) => (
            <LegendItem
              key={row.label}
              color={row.color}
              label={row.label}
              percent={row.percent}
              detail={row.detail}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}
