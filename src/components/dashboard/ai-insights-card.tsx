"use client";

import { InsightPanel } from "@/components/ui";
import { DASHBOARD_INSIGHT } from "@/lib/data/dashboard";

export function AiInsightsCard() {
  return (
    <InsightPanel
      title="AI Insights"
      body={DASHBOARD_INSIGHT}
      action="View Full Report"
    />
  );
}
