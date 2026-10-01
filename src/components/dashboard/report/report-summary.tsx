"use client";

import { useState, useTransition } from "react";
import { generateReportSummaryAction } from "@/app/actions/ai";
import { Button, Icon, SkeletonText } from "@/components/ui";
import { useToast } from "@/components/layout/toast-provider";
import type { DateRange, ReportSummary as Summary } from "@/types";

export interface ReportSummaryProps {
  range: DateRange;
  /** The dashboard's short insight, if already cached. */
  insight: string | null;
  /** The longer summary, if one was already written for these figures. */
  initial: Summary | null;
  aiEnabled: boolean;
}

/**
 * The report's AI commentary.
 *
 * Opening the report never calls the model: `insight` and `initial` are cache
 * reads made on the server. The longer summary is written only when someone
 * presses the button, once, and is then stored against the figures, so the
 * button does not come back until the numbers change.
 */
export function ReportSummary({ range, insight, initial, aiEnabled }: ReportSummaryProps) {
  const toast = useToast();
  const [summary, setSummary] = useState<Summary | null>(initial);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const write = () => {
    setNote(null);
    startTransition(async () => {
      try {
        const result = await generateReportSummaryAction(range);
        if (result.summary) {
          setSummary(result.summary);
          toast({ tone: "success", title: "AI summary written", key: "report-summary" });
          return;
        }
        setNote(result.note);
        toast({
          tone: "error",
          title: "No summary was written",
          description: result.note ?? undefined,
          key: "report-summary",
        });
      } catch {
        const message = "The summary could not be written. Please try again.";
        setNote(message);
        toast({ tone: "error", title: "No summary was written", description: message, key: "report-summary" });
      }
    });
  };

  return (
    <section
      style={{
        background: "var(--grad-upsell)",
        border: "1px solid var(--blue-100)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--card-padding)",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="sparkles" size={16} color="var(--accent-primary)" />
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-h3-size)", fontWeight: 600 }}>
            AI summary
          </h3>
        </div>
        {!summary && aiEnabled && (
          <span className="aegis-no-print">
            <Button size="sm" icon="sparkles" onClick={write} disabled={pending}>
              {pending ? "Writing…" : "Write AI summary"}
            </Button>
          </span>
        )}
      </div>

      {pending && <SkeletonText lines={4} lineHeight={11} gap={9} />}

      {!pending && summary && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ margin: 0, fontSize: "14px", lineHeight: "21px", fontWeight: 600, textWrap: "pretty" }}>
            {summary.headline}
          </p>
          <div className="grid gap-4 wide:grid-cols-3">
            <SummaryList title="Highlights" icon="trending-up" items={summary.highlights} />
            <SummaryList title="Needs attention" icon="alert-triangle" items={summary.risks} empty="Nothing flagged." />
            <SummaryList title="Suggested next steps" icon="arrow-right" items={summary.actions} empty="None follow from these figures." />
          </div>
          <p style={{ margin: 0, fontSize: "11px", color: "var(--text-muted)" }}>
            Written by AI from the real figures in this report. The sample tiles marked DEMO DATA were not
            given to it. Suggestions only; a person decides.
          </p>
        </div>
      )}

      {!pending && !summary && (
        <p style={{ margin: 0, fontSize: "13px", lineHeight: "20px", color: "var(--text-secondary)", textWrap: "pretty", overflowWrap: "anywhere" }}>
          {insight ??
            (aiEnabled
              ? "No AI commentary has been written for these figures yet. The report below is complete without it."
              : "AI is not configured on this install, so this report is figures only.")}
        </p>
      )}

      {note && !pending && (
        <p role="alert" style={{ margin: 0, display: "flex", gap: 7, fontSize: "12px", color: "var(--status-negative)" }}>
          <Icon name="circle-alert" size={14} />
          {note}
        </p>
      )}
    </section>
  );
}

function SummaryList({
  title,
  icon,
  items,
  empty,
}: {
  title: string;
  icon: string;
  items: string[];
  empty?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: "var(--text-overline-size)",
          fontWeight: 600,
          letterSpacing: ".1em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
        }}
      >
        <Icon name={icon} size={12} />
        {title}
      </span>
      {items.length === 0 ? (
        <span style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>{empty}</span>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 5 }}>
          {items.map((item) => (
            <li key={item} style={{ fontSize: "12.5px", lineHeight: "19px", color: "var(--text-secondary)", overflowWrap: "anywhere" }}>
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
