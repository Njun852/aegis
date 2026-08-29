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
import { isAiConfigured } from "@/lib/ai/client";
import { cachedInsight } from "@/lib/ai/insight";
import { buildLedgerRevenue, revenueWindow } from "@/lib/dashboard";
import { revenueByMonth } from "@/lib/dal/ledger";
import { listMessages } from "@/lib/dal/mail";
import { DATE_RANGES } from "@/lib/data/dashboard";
import type { DateRange } from "@/types";

export const metadata: Metadata = {
  title: "Dashboard · AEGIS AI",
  description:
    "Balance, revenue, expenses and net profit, with AI commentary on the month.",
};

export default async function DashboardPage() {
  // One month-bucketed aggregation over the ledger answers all three ranges,
  // since every range the picker offers is month-aligned.
  const today = new Date();
  const { from, to } = revenueWindow(today);
  const [buckets, messages] = await Promise.all([
    revenueByMonth(from, to),
    listMessages(),
  ]);
  const revenue = buildLedgerRevenue(buckets, today);

  // Cache reads only — `cachedInsight` cannot start a billable request, so it
  // is safe on the render path. Anything missing is fetched by the card, for
  // the one range the visitor is actually looking at.
  const cachedInsights: Partial<Record<DateRange, string>> = {};
  for (const range of DATE_RANGES) {
    const text = await cachedInsight(range);
    if (text) cachedInsights[range] = text;
  }

  return (
    <DashboardRangeProvider revenue={revenue}>
      <div className="flex flex-col gap-4">
        <DashboardHeader />
        <KpiGrid />

        {/* minmax(0,…) keeps long card content from stretching its own track. */}
        <div className="grid items-stretch gap-4 wide:grid-cols-[minmax(0,1.72fr)_minmax(0,1fr)]">
          <RevenueCard />
          <BookingsCard />
        </div>

        <div className="grid items-stretch gap-4 wide:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.95fr)_minmax(0,0.95fr)]">
          <EmailSummaryCard messages={messages} />
          <AlertsCard />
          <AdsSummaryCard />
          <AiInsightsCard cached={cachedInsights} aiEnabled={isAiConfigured()} />
        </div>
      </div>
    </DashboardRangeProvider>
  );
}
