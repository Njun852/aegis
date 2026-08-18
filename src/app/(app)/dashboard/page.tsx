import type { Metadata } from "next";
import { AdsSummaryCard } from "@/components/dashboard/ads-summary-card";
import { AiInsightsCard } from "@/components/dashboard/ai-insights-card";
import { AlertsCard } from "@/components/dashboard/alerts-card";
import { BookingsCard } from "@/components/dashboard/bookings-card";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
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
    <div className="flex flex-col gap-4">
      <DashboardHeader />
      <KpiGrid />

      <div className="grid items-stretch gap-4 wide:grid-cols-[1.72fr_1fr]">
        <RevenueCard />
        <BookingsCard />
      </div>

      <div className="grid items-stretch gap-4 wide:grid-cols-[1.2fr_1fr_0.95fr_0.95fr]">
        <EmailSummaryCard />
        <AlertsCard />
        <AdsSummaryCard />
        <AiInsightsCard />
      </div>
    </div>
  );
}
