import { StatCard } from "@/components/ui";
import { KPIS } from "@/lib/data/dashboard";

export function KpiGrid() {
  return (
    <div className="grid grid-cols-2 gap-4 wide:grid-cols-4">
      {KPIS.map((kpi) => (
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
