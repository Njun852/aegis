"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { closeDueMonthsAction, issueRevisionAction } from "@/app/actions/finance";
import { INPUT, Modal, Notice } from "@/components/forms/form-kit";
import { useToast } from "@/components/layout/toast-provider";
import { Badge, Button } from "@/components/ui";
import { MIN_REVISION_REASON, reportTitle } from "@/lib/finance";
import { periodLabel } from "@/lib/finance-periods";
import { formatMoney, formatSignedMoney } from "@/lib/format";
import { formatQuoteDay } from "@/lib/quotations";
import { rowHref } from "./drill-down";
import { FrozenReport, pdfHref } from "./frozen-report";
import type { FinanceSummary } from "@/lib/finance-summary";
import type { ArchiveMonth, FigureChange, FinanceReportKind, FinanceReportView, ReportRevision } from "@/types";

const CARD = {
  background: "var(--surface-card)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-card)",
  padding: "14px 16px",
  minWidth: 0,
};

const KIND_NAME: Record<FinanceReportKind, string> = {
  income: "Monthly Income Report",
  standing: "Financial Standing Report",
  "annual-income": "Annual Income Report",
  "year-end-standing": "Year-End Financial Standing",
};

/** Each period has two reports: the income one and the standing one, monthly or annual. */
type Slot = "income" | "standing";

function stamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Manila", month: "short", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * The archive of month-end reports, by month: both reports, every revision,
 * each viewable and downloadable as it was frozen. A month whose records
 * changed after its report is flagged with exactly what changed; an
 * administrator reviews it and issues the next revision with a reason.
 */
export function ReportsPanel({
  archive,
  openReport,
  openSummary,
  aiReady,
}: {
  archive: ArchiveMonth[];
  openReport: FinanceReportView | null;
  openSummary: FinanceSummary | null;
  aiReady: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [reviewing, setReviewing] = useState<{ slot: Slot; month: ArchiveMonth } | null>(null);
  const [pending, startTransition] = useTransition();
  const [, startNavigation] = useTransition();

  const view = (revision: ReportRevision | null) =>
    startNavigation(() =>
      router.replace(
        revision ? `/finance?tab=reports&report=${revision.kind}:${revision.period}:${revision.revision}` : "/finance?tab=reports",
        { scroll: false },
      ),
    );

  const closeNow = () =>
    startTransition(async () => {
      const result = await closeDueMonthsAction();
      if (!result.ok) {
        toast({ tone: "error", title: "Reports not generated", description: result.error, key: "finance-close" });
        return;
      }
      toast({
        tone: result.months.length > 0 ? "success" : "info",
        title: result.months.length > 0 ? `Closed ${result.months.map(periodLabel).join(", ")}` : "Nothing to close",
        description: result.months.length > 0 ? "Both reports and their PDFs were made for each period." : "Every period that has ended already has its reports.",
        key: "finance-close",
      });
      router.refresh();
    });

  return (
    <>
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span style={{ fontSize: "12.5px", color: "var(--text-secondary)", maxWidth: 640, textWrap: "pretty" }}>
            Each month&apos;s two reports are made automatically after it ends (Manila time), and the two year-end reports after December
            closes, all kept with their PDFs. A correction makes a new revision; earlier revisions stay as they were.
          </span>
          <Button variant="secondary" icon="refresh-cw" onClick={closeNow} disabled={pending}>
            {pending ? "Checking…" : "Make any reports due"}
          </Button>
        </div>

        {archive.length === 0 && (
          <div style={{ ...CARD, textAlign: "center", fontSize: "12.5px", color: "var(--text-muted)", padding: "30px 16px" }}>
            No month has closed yet. Reports are made on the 1st for the month just ended, starting from the first month with finance records.
          </div>
        )}

        {archive.map((month) => {
          const changes = { income: month.incomeChanges, standing: month.standingChanges };
          return (
            <section key={month.period} style={CARD} className="flex flex-col gap-3">
              <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "15px", fontWeight: 700 }}>{periodLabel(month.period)}</h3>
              <div className="grid grid-cols-1 gap-3 wide:grid-cols-2">
                {(["income", "standing"] as const).map((kind) => {
                  const revisions = month[kind];
                  const current = revisions.at(-1);
                  if (!current) return null;
                  const changed = changes[kind].length > 0;
                  return (
                    <div key={kind} className="flex flex-col gap-2" style={{ border: `1px solid ${changed ? "var(--status-negative)" : "var(--border-default)"}`, borderRadius: 12, padding: "10px 12px" }}>
                      <div className="flex flex-wrap items-center gap-2">
                        <strong style={{ fontSize: "12.5px" }}>{KIND_NAME[current.kind]}</strong>
                        <Badge tone="accent">Revision {current.revision}</Badge>
                        {changed && <Badge tone="negative">Records changed</Badge>}
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                        {kind === "income" ? "Net income" : "Financial position"}{" "}
                        <strong style={{ color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{formatMoney(current.headlineCents)}</strong>
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        {stamp(current.generatedAt)} · {current.generatedBy}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={() => view(current)}>
                          View
                        </Button>
                        <a href={pdfHref(current.kind, month.period, current.revision)} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="ghost" icon="file-text">
                            PDF
                          </Button>
                        </a>
                        {changed && (
                          <Button size="sm" onClick={() => setReviewing({ slot: kind, month })}>
                            Review changes
                          </Button>
                        )}
                      </div>
                      {revisions.length > 1 && (
                        <details>
                          <summary style={{ fontSize: "11.5px", cursor: "pointer", color: "var(--text-secondary)" }}>
                            Earlier revisions ({revisions.length - 1})
                          </summary>
                          <div className="flex flex-col gap-1.5" style={{ marginTop: 6 }}>
                            {revisions
                              .slice(0, -1)
                              .reverse()
                              .map((revision) => (
                                <div key={revision.revision} className="flex flex-wrap items-center gap-2" style={{ fontSize: "11.5px" }}>
                                  <span style={{ fontWeight: 600 }}>Revision {revision.revision}</span>
                                  <span style={{ color: "var(--text-muted)" }}>
                                    {formatMoney(revision.headlineCents)} · {stamp(revision.generatedAt)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => view(revision)}
                                    style={{ border: "none", background: "none", padding: 0, font: "inherit", color: "var(--text-accent)", cursor: "pointer" }}
                                  >
                                    View
                                  </button>
                                  <a href={pdfHref(revision.kind, month.period, revision.revision)} target="_blank" rel="noreferrer" style={{ color: "var(--text-accent)" }}>
                                    PDF
                                  </a>
                                  {revision.reason && <span style={{ width: "100%", color: "var(--text-secondary)" }}>{revision.reason}</span>}
                                </div>
                              ))}
                          </div>
                        </details>
                      )}
                      {current.revision > 1 && (
                        <span style={{ fontSize: "11.5px", color: "var(--text-secondary)" }}>
                          <strong>Correction:</strong> {current.reason}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {openReport && <FrozenReport report={openReport} summary={openSummary} aiReady={aiReady} onClose={() => view(null)} />}
      {reviewing && (
        <ReviewChanges
          slot={reviewing.slot}
          month={reviewing.month}
          pending={pending}
          onClose={() => setReviewing(null)}
          onIssue={(reason) =>
            startTransition(async () => {
              const result = await issueRevisionAction(reviewing.month[reviewing.slot].at(-1)!.kind, reviewing.month.period, reason);
              if (!result.ok) {
                toast({ tone: "error", title: "Revision not issued", description: result.error, key: "finance-revise" });
                return;
              }
              toast({
                tone: "success",
                title: reportTitle(reviewing.month[reviewing.slot].at(-1)!.kind, reviewing.month.period, result.revision),
                description: "Issued, with its PDF. The earlier revision is kept as it was.",
                key: "finance-revise",
              });
              setReviewing(null);
              router.refresh();
            })
          }
        />
      )}
    </>
  );
}

/** What changed since the current revision, line by line, and the means to issue the next one. */
function ReviewChanges({
  slot,
  month,
  pending,
  onClose,
  onIssue,
}: {
  slot: Slot;
  month: ArchiveMonth;
  pending: boolean;
  onClose: () => void;
  onIssue: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const current = month[slot].at(-1)!;
  const kind = current.kind;
  const changes: FigureChange[] = slot === "income" ? month.incomeChanges : month.standingChanges;

  const issue = () => {
    if (reason.trim().length < MIN_REVISION_REASON) {
      setError(`Say what was corrected and why (at least ${MIN_REVISION_REASON} characters).`);
      return;
    }
    setError(null);
    onIssue(reason);
  };

  const amount = (cents: number | null) => (cents === null ? "—" : formatMoney(cents));

  return (
    <Modal
      title={`${periodLabel(month.period)} ${KIND_NAME[kind]}: changes since Revision ${current.revision}`}
      icon="alert-triangle"
      width={720}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Not now
          </Button>
          <Button icon="check" onClick={issue} disabled={pending}>
            {pending ? "Issuing…" : `Issue Revision ${current.revision + 1}`}
          </Button>
        </>
      }
    >
      <span style={{ fontSize: "12px", color: "var(--text-secondary)", textWrap: "pretty" }}>
        Records dated in {month.annual ? month.period : periodLabel(month.period)} were entered, changed or voided after Revision {current.revision} was made. Check each line.
        If it is a genuine correction, issue the next revision; Revision {current.revision} stays on record unchanged.
      </span>
      {changes.map((change) => (
        <section key={change.label} className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <strong style={{ fontSize: "12.5px" }}>{change.label}</strong>
            <span style={{ fontSize: "12.5px", fontVariantNumeric: "tabular-nums" }}>
              {formatMoney(change.fromCents)} → <strong>{formatMoney(change.toCents)}</strong>{" "}
              <span style={{ color: "var(--text-muted)" }}>({formatSignedMoney(change.toCents - change.fromCents)})</span>
            </span>
          </div>
          <div style={{ border: "1px solid var(--border-default)", borderRadius: 12, overflow: "hidden" }}>
            {change.rows.map((row) => {
              const href = rowHref({ kind: row.kind, ref: row.ref, dateKey: row.dateKey, label: row.label, amountCents: 0 });
              const what = row.fromCents === null ? "Added" : row.toCents === null ? "Removed" : "Changed";
              return (
                <div key={`${row.kind}-${row.ref}`} className="flex items-center gap-3" style={{ padding: "7px 12px", borderBottom: "1px solid var(--gray-50)", fontSize: "12px" }}>
                  <Badge tone={what === "Removed" ? "negative" : what === "Added" ? "info" : "warning"}>{what}</Badge>
                  <span style={{ width: 80, flex: "0 0 auto", color: "var(--text-muted)" }}>{formatQuoteDay(row.dateKey)}</span>
                  <span className="min-w-0 flex-1" style={{ overflowWrap: "anywhere" }}>
                    {href && row.kind !== "payment" && row.kind !== "opening" ? (
                      <a href={href} style={{ color: "var(--text-accent)" }}>
                        {row.label}
                      </a>
                    ) : (
                      row.label
                    )}{" "}
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "10.5px", color: "var(--text-muted)" }}>{row.ref}</span>
                  </span>
                  <span style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                    {amount(row.fromCents)} → {amount(row.toCents)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {error && <Notice tone="error">{error}</Notice>}
      <label className="flex flex-col gap-1.5">
        <span style={{ fontSize: "11.5px", fontWeight: 600 }}>
          What was corrected, and why <span style={{ color: "var(--status-negative)" }}>*</span>
        </span>
        <textarea
          rows={3}
          maxLength={600}
          style={{ ...INPUT, resize: "vertical" }}
          value={reason}
          placeholder="The September electricity bill arrived late and was entered on Oct 6…"
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
    </Modal>
  );
}
