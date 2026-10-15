"use client";

import { useRouter } from "next/navigation";
import { Card, DeltaIndicator } from "@/components/ui";
import { useDashboardRange } from "./dashboard-range-provider";

/**
 * The connected ad account at a glance. Meta reports rolling windows, so this
 * is the last 30 days whatever the date picker says, and the card says so.
 */
export function AdsSummaryCard() {
  const router = useRouter();
  const { ads } = useDashboardRange();

  return (
    <Card title="Ads Summary" padding="16px" action="Open Ads" onAction={() => router.push("/ads")}>
      {ads ? (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            {ads.tiles.map((tile) => (
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
                {tile.delta && <DeltaIndicator value={tile.delta} caption="MoM" size={10} />}
              </div>
            ))}
          </div>
          <span style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>{ads.note}</span>
        </div>
      ) : (
        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
          No ad account is connected. An administrator connects one in Business Management.
        </span>
      )}
    </Card>
  );
}
