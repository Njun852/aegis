import { Card, DeltaIndicator, LegendItem } from "@/components/ui";
import {
  BOOKINGS_DELTA,
  BOOKINGS_TOTAL,
  BOOKING_ROWS,
} from "@/lib/data/dashboard";

export function BookingsCard() {
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
            {BOOKINGS_TOTAL}
          </div>
          <DeltaIndicator value={BOOKINGS_DELTA} size={11} />
        </div>
        <div className="flex flex-col gap-2.5">
          {BOOKING_ROWS.map((row) => (
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
