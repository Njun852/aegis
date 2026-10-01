import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ReportView } from "@/components/dashboard/report/report-view";
import { isAiConfigured } from "@/lib/ai/client";
import { cachedInsight } from "@/lib/ai/insight";
import { cachedReportSummary } from "@/lib/ai/report";
import { buildReport } from "@/lib/dal/report";
import { rangeFromSlug } from "@/lib/report";

export const metadata: Metadata = {
  title: "Full report · AEGIS AI",
  description: "Every real figure AEGIS holds for one period, section by section.",
};

export default async function ReportPage(props: PageProps<"/dashboard/report">) {
  const range = rangeFromSlug((await props.searchParams).range);

  const report = await buildReport(range);
  if (!report) redirect("/login");

  // Cache reads only. Neither can start a billable request, so opening or
  // reloading the report costs nothing; the summary is written by its button.
  const [insight, summary] = await Promise.all([cachedInsight(range), cachedReportSummary(report)]);

  return <ReportView report={report} insight={insight} summary={summary} aiEnabled={isAiConfigured()} />;
}
