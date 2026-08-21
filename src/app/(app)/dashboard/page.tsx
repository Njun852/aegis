import type { Metadata } from "next";
import { AdsSummaryCard } from "@/components/dashboard/ads-summary-card";
import { AiInsightsCard } from "@/components/dashboard/ai-insights-card";
import { AlertsCard } from "@/components/dashboard/alerts-card";
import { BookingsCard } from "@/components/dashboard/bookings-card";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardRangeProvider } from "@/components/dashboard/dashboard-range-provider";
import { EmailSummaryCard } from "@/components/dashboard/email-summary-card";
import { KpiGrid } from "@/components/dashboard/kpi-grid";
import { RevenueCard } from "@/components/dashboard/revenue-card";

export const metadata: Metadata = {
  title: "Dashboard · AEGIS AI",
  description:
    "Balance, revenue, expenses and net profit, with AI commentary on the month.",
};

export default function DashboardPage() {
  return (
    <DashboardRangeProvider>
      <div className="flex flex-col gap-4">
        <DashboardHeader />
        <KpiGrid />

        {/* minmax(0,…) keeps long card content from stretching its own track. */}
        <div className="grid items-stretch gap-4 wide:grid-cols-[minmax(0,1.72fr)_minmax(0,1fr)]">
          <RevenueCard />
          <BookingsCard />
        </div>

        <div className="grid items-stretch gap-4 wide:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.95fr)_minmax(0,0.95fr)]">
          <EmailSummaryCard />
          <AlertsCard />
          <AdsSummaryCard />
          <AiInsightsCard />
        </div>
      </div>
    </DashboardRangeProvider>
  );
}
