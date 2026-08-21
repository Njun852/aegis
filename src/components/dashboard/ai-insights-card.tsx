"use client";

import { InsightPanel } from "@/components/ui";
import { useDashboardRange } from "./dashboard-range-provider";

export function AiInsightsCard() {
  const { data } = useDashboardRange();

  return (
    <InsightPanel title="AI Insights" body={data.insight} action="View Full Report" />
  );
}
