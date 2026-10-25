"use client";

import { useState } from "react";
import { Modal, Notice } from "@/components/forms/form-kit";
import { Button } from "@/components/ui";
import { EXPENSE_CATEGORIES, reportTitle } from "@/lib/finance";
import { monthLabel, periodEnd } from "@/lib/finance-periods";
import { formatMoney, formatSignedMoney } from "@/lib/format";
import { formatQuoteDay } from "@/lib/quotations";
import { DrillModal, FigureButton, type DrillRequest } from "./drill-down";
import { ReportSummary } from "./report-summary";
import type { FinanceSummary } from "@/lib/finance-summary";
import type { AnnualIncomeFigures, Figure, FinanceReportView } from "@/types";

const ROW = { padding: "7px 0", borderBottom: "1px solid var(--gray-50)" };

/** A figure's rows dated in one month, for opening a month of the annual report. */
function rowsIn(figure: Figure, month: string): Figure {
  const rows = figure.rows.filter((row) => row.dateKey.startsWith(`${month}-`));
  return { cents: rows.reduce((sum, row) => sum + row.amountCents, 0), rows };
}

/** The annual report's January-to-December lines; each month's sales open into their invoices. */
function MonthTable({ income, onOpen }: { income: AnnualIncomeFigures; onOpen: (label: string, month: string) => void }) {
  const cell = { fontSize: "12.5px", fontVariantNumeric: "tabular-nums" as const, textAlign: "right" as const };
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: "12px", fontWeight: 700, marginBottom: 4 }}>Monthly Net Income, January to December</div>
      <div className="grid gap-x-3" style={{ gridTemplateColumns: "1.3fr 1fr 1fr 1fr" }}>
        {["Month", "Sales", "Costs", "Net income"].map((head) => (
          <span key={head} style={{ fontSize: "10.5px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".06em", textAlign: head === "Month" ? "left" : "right" }}>
            {head}
          </span>
        ))}
        {income.months.map((line) => (
          <div key={line.month} className="contents">
            <span style={{ fontSize: "12.5px", padding: "4px 0", borderBottom: "1px solid var(--gray-50)" }}>{monthLabel(line.month)}</span>
            <span style={{ ...cell, padding: "4px 0", borderBottom: "1px solid var(--gray-50)" }}>
              {line.salesCents > 0 ? (
                <FigureButton label={`Sales, ${monthLabel(line.month)}`} onClick={() => onOpen(`Sales, ${monthLabel(line.month)}`, line.month)}>
                  {formatMoney(line.salesCents)}
                </FigureButton>
              ) : (
                formatMoney(0)
              )}
            </span>
            <span style={{ ...cell, padding: "4px 0", borderBottom: "1px solid var(--gray-50)" }}>{formatMoney(line.costsCents)}</span>
            <span style={{ ...cell, padding: "4px 0", borderBottom: "1px solid var(--gray-50)", fontWeight: 600 }}>{formatMoney(line.netIncomeCents)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function pdfHref(kind: string, period: string, revision: number, download = false): string {
  return `/api/finance/reports/pdf?kind=${kind}&period=${period}&rev=${revision}${download ? "&download=1" : ""}`;
}

/**
 * One frozen revision, read-only, exactly as it was kept. Its drill-down
 * opens the rows stored with it, not today's records, so it still adds up
 * whatever has changed since.
 */
export function FrozenReport({
  report,
  summary,
  aiReady,
  onClose,
}: {
  report: FinanceReportView;
  /** An AI summary already written for this revision, read from the cache. */
  summary: FinanceSummary | null;
  aiReady: boolean;
  onClose: () => void;
}) {
  const [drill, setDrill] = useState<DrillRequest | null>(null);
  const title = reportTitle(report.kind, report.period, report.revision);
  const generated = new Date(report.generatedAt).toLocaleString("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const open = (label: string, figure: Figure, sign: 1 | -1 = 1) =>
    setDrill({ title: `${label} (${title})`, sections: [{ label, figure, sign }], shownCents: sign * figure.cents });

  const line = (label: string, figure: Figure, opts: { bold?: boolean; minus?: boolean } = {}) => (
    <div key={label} className="flex items-baseline justify-between gap-3" style={ROW}>
      <span style={{ fontSize: "13px", fontWeight: opts.bold ? 700 : 400 }}>
        {opts.minus ? "Less " : ""}
        {label}
      </span>
      <FigureButton label={label} onClick={() => open(label, figure)} style={{ fontSize: "13.5px", fontWeight: opts.bold ? 700 : 600 }}>
        {opts.minus ? "-" : ""}
        {formatMoney(figure.cents)}
      </FigureButton>
    </div>
  );

  return (
    <>
      <Modal
        title={title}
        icon="archive"
        width={680}
        onClose={onClose}
        footer={
          <>
            <a href={pdfHref(report.kind, report.period, report.revision)} target="_blank" rel="noreferrer">
              <Button variant="secondary" icon="file-text">
                Open PDF
              </Button>
            </a>
            <a href={pdfHref(report.kind, report.period, report.revision, true)}>
              <Button icon="arrow-down">Download PDF</Button>
            </a>
          </>
        }
      >
        <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
          {report.businessName} · generated {generated} (Manila) by {report.generatedBy}
          {report.standing ? ` · as of the end of ${formatQuoteDay(periodEnd(report.period))}` : ""}
        </span>
        {report.revision > 1 && (
          <Notice tone="info">
            <strong>Correction:</strong> {report.reason}
          </Notice>
        )}
        <ReportSummary key={`${report.kind}:${report.period}:${report.revision}`} report={report} initial={summary} aiReady={aiReady} />
        {report.income && (
          <div className="flex flex-col">
            {line("Sales / Revenue", report.income.sales)}
            {line("Costs & Expenses", report.income.costs)}
            <div className="flex items-baseline justify-between gap-3" style={ROW}>
              <strong style={{ fontSize: "13px" }}>Net Income</strong>
              <FigureButton
                label="Net income"
                onClick={() =>
                  setDrill({
                    title: `Net income (${title})`,
                    sections: [
                      { label: "Sales / revenue", figure: report.income!.sales, sign: 1 },
                      { label: "Costs & expenses", figure: report.income!.costs, sign: -1 },
                    ],
                    shownCents: report.income!.netIncomeCents,
                  })
                }
                style={{ fontSize: "15px", fontWeight: 700 }}
              >
                {formatMoney(report.income.netIncomeCents)}
              </FigureButton>
            </div>
            <div className="flex items-baseline justify-between gap-3" style={ROW}>
              <span style={{ fontSize: "13px" }}>Net Margin</span>
              <span style={{ fontSize: "13.5px", fontWeight: 600 }}>
                {report.income.netMarginPercent === null ? "No sales" : `${report.income.netMarginPercent.toFixed(1)}%`}
              </span>
            </div>
            {"months" in report.income && <MonthTable income={report.income as AnnualIncomeFigures} onOpen={(label, month) => open(label, rowsIn(report.income!.sales, month), 1)} />}
            <div style={{ fontSize: "12px", fontWeight: 700, margin: "12px 0 2px" }}>
              {"months" in report.income ? "Annual expense-category totals" : "Simple expense breakdown"}
            </div>
            {EXPENSE_CATEGORIES.map(({ key, label }) => line(label, report.income!.byCategory[key]))}
          </div>
        )}
        {report.standing && report.attention && (
          <div className="flex flex-col">
            {line("Cash on hand", report.standing.cash)}
            {line("Bank accounts", report.standing.bankAccounts)}
            {line("Passbook accounts", report.standing.passbooks)}
            {line("E-wallet balances", report.standing.ewallet)}
            {line("Total accounts receivable", report.standing.receivable)}
            {line("Total accounts payable", report.standing.payable, { minus: true })}
            <div className="flex items-baseline justify-between gap-3" style={ROW}>
              <strong style={{ fontSize: "13px" }}>Current Financial Position</strong>
              <FigureButton
                label="Current financial position"
                onClick={() =>
                  setDrill({
                    title: `Current financial position (${title})`,
                    sections: [
                      { label: "Cash on hand", figure: report.standing!.cash, sign: 1 },
                      { label: "Bank accounts", figure: report.standing!.bankAccounts, sign: 1 },
                      { label: "Passbook accounts", figure: report.standing!.passbooks, sign: 1 },
                      { label: "E-wallet balances", figure: report.standing!.ewallet, sign: 1 },
                      { label: "Accounts receivable", figure: report.standing!.receivable, sign: 1 },
                      { label: "Accounts payable", figure: report.standing!.payable, sign: -1 },
                    ],
                    shownCents: report.standing!.positionCents,
                  })
                }
                style={{ fontSize: "15px", fontWeight: 700 }}
              >
                {formatMoney(report.standing.positionCents)}
              </FigureButton>
            </div>
            <div style={{ fontSize: "12px", fontWeight: 700, margin: "12px 0 2px" }}>
              Needing attention at the end of the {report.kind === "year-end-standing" ? "year" : "month"}
            </div>
            {[
              { label: "AR 90+ days", figure: report.attention.ar90 },
              { label: "Overdue AP", figure: report.attention.apOverdue },
              { label: "AP due within 7 days", figure: report.attention.apDue7 },
              { label: "Unreconciled cash/bank differences", figure: report.attention.differences },
            ].map((item) => (
              <div key={item.label} className="flex items-baseline justify-between gap-3" style={ROW}>
                <span style={{ fontSize: "13px" }}>
                  {item.label} <span style={{ color: "var(--text-muted)" }}>· {item.figure.rows.length}</span>
                </span>
                {item.figure.rows.length > 0 ? (
                  <FigureButton label={item.label} onClick={() => open(item.label, item.figure)} style={{ fontSize: "13.5px", fontWeight: 600 }}>
                    {item.figure.cents < 0 ? formatSignedMoney(item.figure.cents) : formatMoney(item.figure.cents)}
                  </FigureButton>
                ) : (
                  <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>None</span>
                )}
              </div>
            ))}
          </div>
        )}
        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
          This is the report as it was frozen. Each figure opens the records it was made from at the time.
        </span>
      </Modal>
      {drill && <DrillModal request={drill} accountNames={report.accountNames} onClose={() => setDrill(null)} />}
    </>
  );
}
