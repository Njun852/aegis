"use client";

import { Card, DeltaIndicator } from "@/components/ui";
import { useDashboardRange } from "./dashboard-range-provider";

export function AdsSummaryCard() {
  const { data } = useDashboardRange();

  return (
    <Card title="Ads Summary" padding="16px">
      <div className="grid grid-cols-2 gap-2">
        {data.adTiles.map((tile) => (
          <div
            key={tile.label}
            className="flex flex-col gap-[3px] rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-[11px] py-[9px]"
          >
            <span style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>
              {tile.label}
            </span>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "16px",
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {tile.value}
            </span>
            <DeltaIndicator value={tile.delta} caption="MoM" size={10} />
          </div>
        ))}
      </div>
    </Card>
  );
}
