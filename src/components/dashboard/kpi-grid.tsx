"use client";

import { StatCard } from "@/components/ui";
import { useDashboardRange } from "./dashboard-range-provider";

export function KpiGrid() {
  const { data } = useDashboardRange();

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
          points={kpi.points}
        />
      ))}
    </div>
  );
}
