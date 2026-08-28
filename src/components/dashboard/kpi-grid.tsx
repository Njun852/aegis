"use client";

import { StatCard } from "@/components/ui";
import { useDashboardRange } from "./dashboard-range-provider";
import type { DateRange } from "@/types";

const DELTA_CAPTION: Record<DateRange, string> = {
  "This month": "from last month",
  "Last month": "from the month before",
  "This quarter": "from last quarter",
};

export function KpiGrid() {
  const { data, range } = useDashboardRange();

  return (
    <div className="grid grid-cols-2 gap-4 wide:grid-cols-4">
      {data.kpis.map((kpi) => (
        <StatCard
          key={kpi.label}
          label={kpi.label}
          value={kpi.value}
          icon={kpi.icon}
          tone={kpi.tone}
          delta={kpi.delta}
          deltaCaption={DELTA_CAPTION[range]}
          points={kpi.points}
        />
      ))}
    </div>
  );
}
