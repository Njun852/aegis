import { EXPENSE_CATEGORIES, reportTitle } from "@/lib/finance";
import { formatQuoteDay } from "@/lib/quotations";
import { monthLabel, periodEnd, periodLabel } from "@/lib/finance-periods";
import { formatMoney } from "@/lib/format";
import type { AnnualIncomeFigures, FinanceReportView } from "@/types";

/**
 * The rules for the AI summary of a frozen finance report, kept pure so the
 * check script can prove them.
 *
 * The specification's rule is that AI may summarise verified data but must
 * never invent financial figures. Two things enforce it here rather than in
 * the prompt alone: the model sees only the frozen report's own figures, and
 * `inventedNumbers` rejects any answer containing a number those figures do
 * not contain. A sum, ratio, rounding or estimate the report does not show is
 * an invented figure, so the whole answer is thrown away, never shown and
 * never cached.
 */

export interface FinanceSummary {
  /** Two to four sentences. */
  summary: string;
  /** Up to four short points worth the owner's attention. */
  points: string[];
}

/**
 * What the model is given: totals only. No customer, supplier or payee names
 * and no single records, which the summary does not need and which keeps the
 * request small.
 */
export function summaryFacts(report: FinanceReportView) {
  const base = {
    report: reportTitle(report.kind, report.period, report.revision),
    ...(report.revision > 1 ? { correction: report.reason } : {}),
  };
  if (report.income) {
    const income = report.income;
    const categories = Object.fromEntries(
      EXPENSE_CATEGORIES.filter(({ key }) => income.byCategory[key].cents !== 0).map(({ key, label }) => [label, formatMoney(income.byCategory[key].cents)]),
    );
    const months = "months" in income ? (income as AnnualIncomeFigures).months : null;
    return {
      ...base,
      period: periodLabel(report.period),
      sales: formatMoney(income.sales.cents),
      salesInvoices: income.sales.rows.length,
      costsAndExpenses: formatMoney(income.costs.cents),
      costBills: income.costs.rows.length,
      netIncome: formatMoney(income.netIncomeCents),
      netMargin: income.netMarginPercent === null ? "no sales" : `${income.netMarginPercent.toFixed(1)}%`,
      expenseCategories: categories,
      ...(months
        ? {
            monthlyNetIncome: months.map((line) => ({
              month: monthLabel(line.month),
              sales: formatMoney(line.salesCents),
              costs: formatMoney(line.costsCents),
              netIncome: formatMoney(line.netIncomeCents),
            })),
          }
        : {}),
    };
  }
  const standing = report.standing!;
  const attention = report.attention!;
  const item = (figure: { cents: number; rows: unknown[] }) => ({ amount: formatMoney(figure.cents), count: figure.rows.length });
  return {
    ...base,
    asOfEndOf: formatQuoteDay(periodEnd(report.period)),
    cashOnHand: formatMoney(standing.cash.cents),
    bankAccounts: formatMoney(standing.bankAccounts.cents),
    passbookAccounts: formatMoney(standing.passbooks.cents),
    eWallets: formatMoney(standing.ewallet.cents),
    accountsReceivable: { ...item(standing.receivable), meaning: "still owed by customers" },
    accountsPayable: { ...item(standing.payable), meaning: "still owed to suppliers and payees" },
    currentFinancialPosition: formatMoney(standing.positionCents),
    needingAttention: {
      receivablesOver90Days: item(attention.ar90),
      overdueBills: item(attention.apOverdue),
      billsDueWithin7Days: item(attention.apDue7),
      unexplainedCountDifferences: item(attention.differences),
    },
  };
}

/** "₱ 2,800,000.00", "2,800,000", "30.4%" all become "2800000" or "30.4". */
function normalise(token: string): string {
  const plain = token.replace(/,/g, "");
  return plain.includes(".") ? plain.replace(/\.?0+$/, "") || "0" : plain;
}

/** Every number written in a text, normalised so the same figure always compares equal. */
export function numbersIn(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map(normalise);
}

/**
 * The numbers in an answer that the facts it was given do not contain. Empty
 * means every figure was copied, not made up.
 */
export function inventedNumbers(answer: FinanceSummary, facts: unknown): string[] {
  const allowed = new Set(numbersIn(JSON.stringify(facts)));
  const written = numbersIn([answer.summary, ...answer.points].join(" "));
  return [...new Set(written.filter((number) => !allowed.has(number)))];
}

/** Narrows the model's JSON, or null when it is not the shape asked for. */
export function parseFinanceSummary(raw: unknown): FinanceSummary | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { summary, points } = raw as { summary?: unknown; points?: unknown };
  if (typeof summary !== "string" || !summary.trim()) return null;
  if (!Array.isArray(points) || points.some((point) => typeof point !== "string")) return null;
  return { summary: summary.trim(), points: (points as string[]).map((point) => point.trim()).filter(Boolean).slice(0, 4) };
}
