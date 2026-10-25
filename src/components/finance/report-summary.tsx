"use client";

import { useState, useTransition } from "react";
import { summarizeReportAction } from "@/app/actions/finance";
import { useToast } from "@/components/layout/toast-provider";
import { Button, Icon } from "@/components/ui";
import type { FinanceSummary } from "@/lib/finance-summary";
import type { FinanceReportView } from "@/types";

/**
 * The AI summary beside a frozen report: shown if one was already written for
 * this revision, otherwise written only when an administrator asks. It never
 * changes the report or its PDF, and it is labelled as written by AI.
 */
export function ReportSummary({
  report,
  initial,
  aiReady,
}: {
  report: FinanceReportView;
  initial: FinanceSummary | null;
  aiReady: boolean;
}) {
  const toast = useToast();
  const [summary, setSummary] = useState<FinanceSummary | null>(initial);
  const [pending, startTransition] = useTransition();

  const write = () =>
    startTransition(async () => {
      const result = await summarizeReportAction(report.kind, report.period, report.revision);
      if (!result.ok) {
        toast({ tone: "error", title: "No AI summary", description: result.error, key: "finance-summary" });
        return;
      }
      setSummary(result.summary);
      toast({
        tone: "success",
        title: "AI summary written",
        description: result.cached ? "It was already written for this revision; nothing was charged." : "Every figure in it was checked against the report.",
        key: "finance-summary",
      });
    });

  return (
    <section className="flex flex-col gap-2" style={{ padding: "10px 12px", borderRadius: 12, background: "var(--surface-inset)" }}>
      <div className="flex items-center gap-2">
        <span style={{ color: "var(--accent-primary)" }}>
          <Icon name="sparkles" size={14} />
        </span>
        <strong style={{ fontSize: "12.5px" }}>AI summary</strong>
      </div>
      {summary ? (
        <>
          <p style={{ margin: 0, fontSize: "12.5px", lineHeight: 1.5, textWrap: "pretty" }}>{summary.summary}</p>
          {summary.points.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: "12.5px", lineHeight: 1.5 }}>
              {summary.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          )}
          <span style={{ fontSize: "11px", color: "var(--text-muted)", textWrap: "pretty" }}>
            Written by AI from this revision&apos;s figures only. Every figure in it was checked against the report; the report above is the
            record.
          </span>
        </>
      ) : aiReady ? (
        <div className="flex flex-wrap items-center gap-3">
          <span style={{ fontSize: "12px", color: "var(--text-secondary)", flex: 1, minWidth: 220, textWrap: "pretty" }}>
            A short plain-words summary of these figures. Written once per revision and kept; it can only repeat figures that are in the report.
          </span>
          <Button size="sm" variant="secondary" icon="sparkles" onClick={write} disabled={pending}>
            {pending ? "Writing…" : "Write AI summary"}
          </Button>
        </div>
      ) : (
        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>AI is not set up on this server, so no summary can be written.</span>
      )}
    </section>
  );
}
