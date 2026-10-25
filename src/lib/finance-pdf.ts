import "server-only";

import { createElement, type ComponentType, type ReactElement, type ReactNode } from "react";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { EXPENSE_CATEGORIES, expenseCategoryLabel, reportTitle } from "@/lib/finance";
import { monthLabel, periodEnd } from "@/lib/finance-periods";
import { formatAmount, formatQuoteDay } from "@/lib/quotations";
import type { AnnualIncomeFigures, Figure, FinanceReportDocument, FinanceReportKind, SourceRow } from "@/types";

/**
 * The month-end reports as PDFs: the Monthly Income Report and the Financial
 * Standing Report, always two separate documents. Each is rendered once, from
 * the frozen revision, when that revision is written, and the file is kept
 * with it, so the PDF can never drift from the figures it was made with.
 *
 * Plain on purpose: black on white, bold for emphasis, no colour. The PDF
 * built-in fonts have no peso sign, so amounts print as "PHP 1,234.00". Each
 * report ends with the records behind its figures, so the paper copy is as
 * traceable as the screen.
 *
 * Written with `createElement` rather than JSX so that `npm run
 * finance:close`, which Node runs by stripping types, can load it: Node
 * cannot read JSX.
 */

const h = createElement;
type Style = Record<string, unknown>;
type Loose = ComponentType<Record<string, unknown>>;
/** react-pdf's components, typed loosely for createElement; their props are checked by react-pdf at render. */
const PdfText = Text as unknown as Loose;
const PdfView = View as unknown as Loose;
const PdfPage = Page as unknown as Loose;
const PdfDocument = Document as unknown as Loose;

const styles = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 48, paddingHorizontal: 40, fontFamily: "Helvetica", fontSize: 9.5, color: "#111" },
  brand: { fontSize: 8, letterSpacing: 1, color: "#555", textAlign: "right" },
  business: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 6 },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginTop: 4 },
  meta: { fontSize: 8.5, color: "#444", marginTop: 3 },
  section: { marginTop: 16 },
  heading: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginBottom: 4, paddingBottom: 3, borderBottomWidth: 0.8, borderColor: "#111" },
  line: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, borderBottomWidth: 0.4, borderColor: "#bbb" },
  total: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderTopWidth: 0.8, borderColor: "#111", marginTop: 2 },
  bold: { fontFamily: "Helvetica-Bold" },
  note: { fontSize: 8, color: "#444", marginTop: 6, lineHeight: 1.35 },
  box: { marginTop: 10, padding: 8, borderWidth: 0.8, borderColor: "#111" },
  rowLine: { flexDirection: "row", paddingVertical: 2, borderBottomWidth: 0.3, borderColor: "#ccc" },
  colDate: { width: "16%" },
  colLabel: { width: "56%", paddingRight: 6 },
  colRef: { width: "12%" },
  colAmount: { width: "16%", textAlign: "right" },
  footer: { position: "absolute", bottom: 22, left: 40, right: 40, fontSize: 7.5, color: "#555", flexDirection: "row", justifyContent: "space-between" },
});

const text = (style: Style | undefined, ...children: ReactNode[]) => h(PdfText, { style }, ...children);
const view = (props: Record<string, unknown>, ...children: ReactNode[]) => h(PdfView, props, ...children);

function php(cents: number): string {
  return `${cents < 0 ? "-" : ""}PHP ${formatAmount(Math.abs(cents))}`;
}

function line(label: string, cents: number, bold = false): ReactElement {
  const style = bold ? styles.bold : undefined;
  return view({ key: label, style: bold ? styles.total : styles.line }, text(style, label), text(style, php(cents)));
}

function textLine(label: string, value: string): ReactElement {
  return view({ key: label, style: styles.line }, text(undefined, label), text(undefined, value));
}

function recordRow(row: SourceRow, label: string): ReactElement {
  return view(
    { key: `${row.kind}-${row.ref}`, style: styles.rowLine, wrap: false },
    text(styles.colDate, formatQuoteDay(row.dateKey)),
    text(styles.colLabel, label),
    text(styles.colRef, row.ref),
    text(styles.colAmount, php(row.amountCents)),
  );
}

/** The records behind one figure, with their total, so a reader can tick them off. */
function records(title: string, figure: Figure, names: Record<string, string>, labelOf?: (row: SourceRow) => string): ReactElement {
  const label = labelOf ?? ((row: SourceRow) => `${row.accountRef && row.kind !== "opening" && names[row.accountRef] ? `${names[row.accountRef]}: ` : ""}${row.label}`);
  return view(
    { key: title, style: styles.section, wrap: true },
    text(styles.heading, `${title} (${figure.rows.length} ${figure.rows.length === 1 ? "record" : "records"})`),
    figure.rows.length === 0 ? text(styles.note, "None.") : null,
    ...figure.rows.map((row) => recordRow(row, label(row))),
    view({ style: styles.total }, text(styles.bold, "Total"), text(styles.bold, php(figure.cents))),
  );
}

function header(doc: FinanceReportDocument): ReactElement {
  const generated = doc.generatedAt.toLocaleString("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return view(
    {},
    text(styles.brand, "AEGIS | FINANCE"),
    text(styles.business, doc.businessName),
    text(styles.title, reportTitle(doc.kind, doc.period, doc.revision)),
    text(styles.meta, `Generated ${generated} (Manila) by ${doc.generatedBy}.`),
    doc.revision > 1
      ? view(
          { style: styles.box },
          text(styles.bold, "Correction"),
          text({ marginTop: 2 }, doc.reason),
          text(
            styles.note,
            `This revision replaces Revision ${doc.revision - 1} as the current report. Earlier revisions are kept in AEGIS and are not changed.`,
          ),
        )
      : null,
  );
}

function footer(doc: FinanceReportDocument): ReactElement {
  return view(
    { style: styles.footer, fixed: true },
    text(undefined, reportTitle(doc.kind, doc.period, doc.revision)),
    h(PdfText, { render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `Page ${pageNumber} of ${totalPages}` }),
  );
}

function incomeReport(doc: FinanceReportDocument): ReactElement {
  const income = doc.income!;
  const categoryOf = (row: SourceRow) => EXPENSE_CATEGORIES.find(({ key }) => income.byCategory[key].rows.some((entry) => entry.ref === row.ref))?.key;
  return h(
    PdfPage,
    { size: "A4", style: styles.page },
    header(doc),
    view(
      { style: styles.section },
      text(styles.heading, "How much the business made"),
      line("Total Sales / Revenue", income.sales.cents),
      line("Total Costs & Expenses", income.costs.cents),
      line("Net Income", income.netIncomeCents, true),
      textLine("Net Margin", income.netMarginPercent === null ? "No sales" : `${income.netMarginPercent.toFixed(1)}%`),
      text(styles.note, "Net Income = Total Sales - Total Costs & Expenses. Net Margin = Net Income / Total Sales x 100."),
    ),
    view(
      { style: styles.section },
      text(styles.heading, "Simple expense breakdown"),
      ...EXPENSE_CATEGORIES.map(({ key, label }) => line(label, income.byCategory[key].cents)),
      line("Total Costs & Expenses", income.costs.cents, true),
    ),
    text(
      styles.note,
      "Only sales and costs dated in this month are included, paid or not. Cash, bank and passbook balances, receivables, payables and the financial position are not part of this report; they are in the Financial Standing Report.",
    ),
    records("Sales / Revenue: invoices", income.sales, doc.accountNames),
    records("Costs & Expenses: bills", income.costs, doc.accountNames, (row) => {
      const category = categoryOf(row);
      return `${row.label}${category ? ` (${expenseCategoryLabel(category)})` : ""}`;
    }),
    footer(doc),
  );
}

/**
 * The Annual Income Report: the year's totals, net income for each month from
 * January to December, and the year's total for each expense category.
 */
function annualIncomeReport(doc: FinanceReportDocument): ReactElement {
  const income = doc.income as AnnualIncomeFigures;
  const cell = (width: string, value: string, bold = false) => text({ width, textAlign: width === "34%" ? "left" : "right", ...(bold ? styles.bold : {}) }, value);
  const monthRow = (label: string, sales: number, costs: number, net: number, bold = false) =>
    view(
      { key: label, style: bold ? styles.total : styles.line },
      cell("34%", label, bold),
      cell("22%", php(sales), bold),
      cell("22%", php(costs), bold),
      cell("22%", php(net), bold),
    );
  return h(
    PdfPage,
    { size: "A4", style: styles.page },
    header(doc),
    view(
      { style: styles.section },
      text(styles.heading, "How much the business made in the year"),
      line("Total annual sales", income.sales.cents),
      line("Total annual costs & expenses", income.costs.cents),
      line("Annual Net Income", income.netIncomeCents, true),
      textLine("Annual Net Margin", income.netMarginPercent === null ? "No sales" : `${income.netMarginPercent.toFixed(1)}%`),
    ),
    view(
      { style: styles.section, wrap: false },
      text(styles.heading, "Monthly Net Income, January to December"),
      view({ style: styles.line }, cell("34%", "Month", true), cell("22%", "Sales", true), cell("22%", "Costs & expenses", true), cell("22%", "Net income", true)),
      ...income.months.map((month) => monthRow(monthLabel(month.month), month.salesCents, month.costsCents, month.netIncomeCents)),
      monthRow("Year", income.sales.cents, income.costs.cents, income.netIncomeCents, true),
    ),
    view(
      { style: styles.section },
      text(styles.heading, "Annual expense-category totals"),
      ...EXPENSE_CATEGORIES.map(({ key, label }) => line(label, income.byCategory[key].cents)),
      line("Total annual costs & expenses", income.costs.cents, true),
    ),
    text(
      styles.note,
      "Only sales and costs dated in the year are included, paid or not. The months add up to the year. Balances, receivables, payables and the financial position are in the Year-End Financial Standing, not here.",
    ),
    records("Sales / Revenue: invoices", income.sales, doc.accountNames),
    records("Costs & Expenses: bills", income.costs, doc.accountNames),
    footer(doc),
  );
}

/** Account balances one line per account, from rows that may hold many lines per account. */
function byAccount(figure: Figure, names: Record<string, string>): { name: string; cents: number }[] {
  const totals = new Map<string, number>();
  for (const row of figure.rows) {
    const key = row.accountRef ?? row.ref;
    totals.set(key, (totals.get(key) ?? 0) + row.amountCents);
  }
  return [...totals].map(([ref, cents]) => ({ name: `${names[ref] ?? ref} (${ref})`, cents }));
}

function standingReport(doc: FinanceReportDocument): ReactElement {
  const standing = doc.standing!;
  const attention = doc.attention!;
  const day = formatQuoteDay(periodEnd(doc.period));
  const accounts = [
    { title: "Cash on hand", figure: standing.cash },
    { title: "Bank accounts", figure: standing.bankAccounts },
    { title: "Passbook accounts", figure: standing.passbooks },
    { title: "E-wallet balances", figure: standing.ewallet },
  ];
  return h(
    PdfPage,
    { size: "A4", style: styles.page },
    header(doc),
    text(styles.meta, `As of the end of ${day}.`),
    view(
      { style: styles.section },
      text(styles.heading, "Where the business stands"),
      ...accounts.map((entry) => line(entry.title, entry.figure.cents)),
      line("Total Accounts Receivable", standing.receivable.cents),
      line("Less Total Accounts Payable", -standing.payable.cents),
      line("Current Financial Position", standing.positionCents, true),
      text(
        styles.note,
        "Current Financial Position = Cash + Bank/Passbook + E-wallet Balances + Accounts Receivable - Accounts Payable. A passbook is a bank account and is counted once.",
      ),
    ),
    view(
      { style: styles.section },
      text(styles.heading, `Needing attention on ${day}`),
      line(`AR 90+ days (${attention.ar90.rows.length})`, attention.ar90.cents),
      line(`Overdue AP (${attention.apOverdue.rows.length})`, attention.apOverdue.cents),
      line(`AP due within 7 days (${attention.apDue7.rows.length})`, attention.apDue7.cents),
      line(`Unreconciled cash/bank differences (${attention.differences.rows.length})`, attention.differences.cents),
    ),
    view(
      { style: styles.section },
      text(styles.heading, "Balances by account"),
      ...accounts.flatMap((entry) => byAccount(entry.figure, doc.accountNames).map((account) => line(`${entry.title}: ${account.name}`, account.cents))),
    ),
    records("Accounts Receivable: still owed on each invoice", standing.receivable, doc.accountNames),
    records("Accounts Payable: still owed on each bill", standing.payable, doc.accountNames),
    attention.ar90.rows.length > 0 ? records("AR 90+ days", attention.ar90, doc.accountNames) : null,
    attention.apOverdue.rows.length > 0 ? records("Overdue AP", attention.apOverdue, doc.accountNames) : null,
    attention.differences.rows.length > 0 ? records("Unreconciled differences (counted minus book)", attention.differences, doc.accountNames) : null,
    text(
      styles.note,
      doc.kind === "year-end-standing"
        ? "Sales, costs and net income for the year are not part of this report; they are in the Annual Income Report."
        : "Sales, costs and net income for the month are not part of this report; they are in the Monthly Income Report.",
    ),
    footer(doc),
  );
}

export async function renderFinanceReportPdf(doc: FinanceReportDocument): Promise<Buffer> {
  const page = doc.kind === "income" ? incomeReport(doc) : doc.kind === "annual-income" ? annualIncomeReport(doc) : standingReport(doc);
  const document = h(PdfDocument, { title: reportTitle(doc.kind, doc.period, doc.revision), author: "AEGIS", creator: "AEGIS" }, page);
  return renderToBuffer(document as Parameters<typeof renderToBuffer>[0]);
}

/** "AUTOBLITZ-2026-09-Income-Report-Rev1.pdf" */
export function financePdfFilename(businessName: string, kind: FinanceReportKind, period: string, revision: number): string {
  const name = businessName.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "AEGIS";
  const names: Record<FinanceReportKind, string> = {
    income: "Income-Report",
    standing: "Financial-Standing",
    "annual-income": "Annual-Income-Report",
    "year-end-standing": "Year-End-Financial-Standing",
  };
  return `${name}-${period}-${names[kind]}-Rev${revision}.pdf`;
}
