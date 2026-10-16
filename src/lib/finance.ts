import { daysBetween, inMonth, monthLabel } from "@/lib/finance-periods";
import type {
  ApStatusGroup,
  ArAgingBucket,
  ArFollowUp,
  BillDocument,
  DateKey,
  ExpenseCategory,
  Figure,
  FinanceReportKind,
  IncomeFigures,
  InvoiceDocument,
  MoneyAccount,
  MonthKey,
  PaymentDocument,
  SourceRow,
  StandingFigures,
} from "@/types";

/**
 * The Finance rules, kept pure so the screens, the month-end close, the PDFs
 * and `scripts/finance-check.ts` all apply exactly the same ones.
 *
 * Two calculations, never mixed:
 *
 *   Income   (a month)  Net Income = Sales - Costs & Expenses
 *   Standing (a day)    Position   = Cash + Bank/Passbook + E-wallet + AR - AP
 *
 * Income reads invoices and bills by the day they are dated and never looks
 * at a balance. Standing reads balances and what is still owed and never
 * looks at a month's sales. Every figure carries the rows that make it up.
 */

// ---- Expense categories -------------------------------------------------------

export const EXPENSE_CATEGORIES: { key: ExpenseCategory; label: string }[] = [
  { key: "parts", label: "Parts / Materials" },
  { key: "payroll", label: "Payroll" },
  { key: "contractors", label: "Contractors" },
  { key: "utilities", label: "Utilities" },
  { key: "advertising", label: "Advertising" },
  { key: "rent", label: "Rent" },
  { key: "shop-supplies", label: "Shop Supplies" },
  { key: "equipment", label: "Equipment / Maintenance" },
  { key: "other", label: "Other Expenses" },
];

export function expenseCategoryLabel(category: ExpenseCategory): string {
  return EXPENSE_CATEGORIES.find((entry) => entry.key === category)?.label ?? category;
}

// ---- Figures ------------------------------------------------------------------

export function figureOf(rows: SourceRow[]): Figure {
  return { cents: rows.reduce((sum, row) => sum + row.amountCents, 0), rows };
}

/** The drill-down promise: a figure is exactly the sum of what it opens into. */
export function figureAddsUp(figure: Figure): boolean {
  return figure.rows.reduce((sum, row) => sum + row.amountCents, 0) === figure.cents;
}

/** Net Income / Sales x 100, to one decimal place. */
export function netMarginPercent(netIncomeCents: number, salesCents: number): number | null {
  if (salesCents === 0) return null;
  return Math.round((netIncomeCents / salesCents) * 1000) / 10;
}

// ---- Income -------------------------------------------------------------------

export type IncomeInvoice = Pick<InvoiceDocument, "ref" | "number" | "customerName" | "invoiceDate" | "amountCents" | "status">;
export type IncomeBill = Pick<BillDocument, "ref" | "payee" | "reference" | "billDate" | "amountCents" | "category" | "status">;

/**
 * The Monthly Income Report's numbers. Only invoices and bills dated in the
 * month count; a void one never does. Whether they have been paid does not
 * matter here, and no receivable, payable or account balance is read.
 */
export function incomeFigures(month: MonthKey, invoices: IncomeInvoice[], bills: IncomeBill[]): IncomeFigures {
  const sales = figureOf(
    invoices
      .filter((invoice) => invoice.status !== "void" && inMonth(invoice.invoiceDate, month))
      .map((invoice) => ({
        kind: "invoice" as const,
        ref: invoice.ref,
        dateKey: invoice.invoiceDate,
        label: `Invoice ${invoice.number} · ${invoice.customerName}`,
        amountCents: invoice.amountCents,
      })),
  );

  const counted = bills.filter((bill) => bill.status !== "void" && inMonth(bill.billDate, month));
  const billRow = (bill: IncomeBill): SourceRow => ({
    kind: "bill",
    ref: bill.ref,
    dateKey: bill.billDate,
    label: bill.reference ? `${bill.payee} · ${bill.reference}` : bill.payee,
    amountCents: bill.amountCents,
  });
  const costs = figureOf(counted.map(billRow));

  const byCategory = Object.fromEntries(
    EXPENSE_CATEGORIES.map(({ key }) => [key, figureOf(counted.filter((bill) => bill.category === key).map(billRow))]),
  ) as Record<ExpenseCategory, Figure>;

  const netIncomeCents = sales.cents - costs.cents;
  return {
    month,
    sales,
    costs,
    byCategory,
    netIncomeCents,
    netMarginPercent: netMarginPercent(netIncomeCents, sales.cents),
  };
}

// ---- Standing -----------------------------------------------------------------

export type StandingPayment = Pick<
  PaymentDocument,
  "ref" | "accountRef" | "direction" | "kind" | "amountCents" | "paidOn" | "invoiceRef" | "billRef" | "toAccountRef" | "note" | "status"
>;

const KIND_LABEL: Record<StandingPayment["kind"], string> = {
  collection: "Collection",
  bill: "Bill payment",
  transfer: "Transfer",
  other: "Other",
};
export type StandingInvoice = IncomeInvoice & Pick<InvoiceDocument, "dueDate">;
export type StandingBill = IncomeBill & Pick<BillDocument, "dueDate">;

function counts(payment: StandingPayment, asOf: DateKey): boolean {
  return payment.status === "recorded" && payment.paidOn <= asOf;
}

/** What has been collected on an invoice, or paid on a bill, up to a day. */
export function settledCents(
  payments: StandingPayment[],
  link: { invoiceRef: string } | { billRef: string },
  asOf: DateKey,
): number {
  return payments
    .filter((payment) => counts(payment, asOf))
    .filter((payment) =>
      "invoiceRef" in link ? payment.invoiceRef === link.invoiceRef : payment.billRef === link.billRef,
    )
    .reduce((sum, payment) => sum + payment.amountCents, 0);
}

/**
 * An account's balance on a day as the rows behind it: the opening balance,
 * then every recorded payment in or out up to that day, a transfer counting
 * out of one account and into the other. An account opened later than `asOf`
 * did not exist yet and has no rows.
 */
export function accountRows(account: MoneyAccount, payments: StandingPayment[], asOf: DateKey): SourceRow[] {
  if (account.openingDate > asOf) return [];
  const rows: SourceRow[] = [
    {
      kind: "opening",
      ref: account.ref,
      dateKey: account.openingDate,
      label: `${account.name} · opening balance`,
      amountCents: account.openingBalanceCents,
    },
  ];
  for (const payment of payments) {
    if (!counts(payment, asOf)) continue;
    const leaves = payment.accountRef === account.ref;
    const arrives = payment.kind === "transfer" && payment.toAccountRef === account.ref;
    if (!leaves && !arrives) continue;
    const kind = payment.kind === "transfer" ? (arrives ? "Transfer in" : "Transfer out") : KIND_LABEL[payment.kind];
    rows.push({
      kind: "payment",
      ref: payment.ref,
      dateKey: payment.paidOn,
      label: payment.note ? `${kind} · ${payment.note}` : kind,
      amountCents: arrives || payment.direction === "in" ? payment.amountCents : -payment.amountCents,
    });
  }
  return rows.sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0));
}

/**
 * The Financial Standing Report's numbers on a day.
 *
 * Each account is added once, under its own type: a passbook is a bank
 * account and appears under Bank/Passbook only. Two records for the same ref
 * are refused outright rather than quietly added twice; two records for the
 * same real account are stopped earlier, by `accountIdentity` and a unique
 * index, before either can hold money.
 */
export function standingFigures(
  asOf: DateKey,
  accounts: MoneyAccount[],
  payments: StandingPayment[],
  invoices: StandingInvoice[],
  bills: StandingBill[],
): StandingFigures {
  const seen = new Set<string>();
  for (const account of accounts) {
    if (seen.has(account.ref)) throw new Error(`Account ${account.ref} was listed twice; it would be counted twice.`);
    seen.add(account.ref);
  }

  const ofType = (type: MoneyAccount["type"]) =>
    figureOf(accounts.filter((account) => account.type === type).flatMap((account) => accountRows(account, payments, asOf)));

  const receivable = figureOf(
    invoices
      .filter((invoice) => invoice.status !== "void" && invoice.invoiceDate <= asOf)
      .map((invoice) => ({
        kind: "invoice" as const,
        ref: invoice.ref,
        dateKey: invoice.invoiceDate,
        label: `Invoice ${invoice.number} · ${invoice.customerName}`,
        amountCents: invoice.amountCents - settledCents(payments, { invoiceRef: invoice.ref }, asOf),
      }))
      .filter((row) => row.amountCents !== 0),
  );

  const payable = figureOf(
    bills
      .filter((bill) => bill.status !== "void" && bill.billDate <= asOf)
      .map((bill) => ({
        kind: "bill" as const,
        ref: bill.ref,
        dateKey: bill.billDate,
        label: bill.reference ? `${bill.payee} · ${bill.reference}` : bill.payee,
        amountCents: bill.amountCents - settledCents(payments, { billRef: bill.ref }, asOf),
      }))
      .filter((row) => row.amountCents !== 0),
  );

  const cash = ofType("cash");
  const bank = ofType("bank");
  const ewallet = ofType("ewallet");
  return {
    asOf,
    cash,
    bank,
    ewallet,
    receivable,
    payable,
    positionCents: cash.cents + bank.cents + ewallet.cents + receivable.cents - payable.cents,
  };
}

/**
 * What identifies the real account behind a record: the institution and the
 * number's digits. A passbook and the bank account it records are the same
 * money, so the kind is deliberately left out. Null for cash, which has no
 * number to match on.
 */
export function accountIdentity(institution: string, number: string): string | null {
  const digits = number.replace(/\D/g, "");
  if (!digits) return null;
  const bank = institution.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${bank}:${digits}`;
}

// ---- Receivables --------------------------------------------------------------

/** Days since the invoice was issued. */
export function daysOutstanding(invoiceDate: DateKey, today: DateKey): number {
  return Math.max(0, daysBetween(invoiceDate, today));
}

export function arAgingBucket(days: number): ArAgingBucket {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

export const AR_AGING_BUCKETS: { key: ArAgingBucket; label: string }[] = [
  { key: "0-30", label: "0-30 days" },
  { key: "31-60", label: "31-60 days" },
  { key: "61-90", label: "61-90 days" },
  { key: "90+", label: "90+ days" },
];

/**
 * Remarks that say nothing. Compared after lower-casing and dropping
 * punctuation, so "Not yet paid." and "NOT YET PAID" are both caught.
 */
const VAGUE_REMARKS = new Set([
  "not yet paid",
  "not paid",
  "unpaid",
  "no payment",
  "no payment yet",
  "pending",
  "pending payment",
  "waiting",
  "waiting for payment",
  "for follow up",
  "follow up",
  "to follow",
  "none",
  "na",
  "n a",
  "nil",
  "tbd",
  "ok",
]);

/** A detailed remark says what happened and what was agreed; this is the floor. */
export const MIN_DETAILED_REMARK = 30;

function isVague(text: string): boolean {
  const plain = text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return plain.length === 0 || VAGUE_REMARKS.has(plain);
}

export interface FollowUpProblem {
  field: keyof ArFollowUp;
  message: string;
}

/**
 * What a receivable over 90 days is still missing. Empty means it meets the
 * 90+ day control; anything else keeps it on the owner's critical list.
 */
export function ar90Problems(followUp: ArFollowUp, today: DateKey): FollowUpProblem[] {
  const problems: FollowUpProblem[] = [];
  const say = (field: keyof ArFollowUp, message: string) => problems.push({ field, message });

  if (isVague(followUp.reasonUnpaid)) say("reasonUnpaid", "Give the reason it is unpaid, not just that it is unpaid.");
  if (isVague(followUp.remarks)) {
    say("remarks", "\"Not yet paid\" is not an acceptable remark. Say what happened and what was agreed.");
  } else if (followUp.remarks.trim().length < MIN_DETAILED_REMARK) {
    say("remarks", `Remarks need more detail (at least ${MIN_DETAILED_REMARK} characters).`);
  }
  if (!followUp.responsiblePerson.trim()) say("responsiblePerson", "Name the person responsible for collecting it.");
  if (isVague(followUp.lastAction)) say("lastAction", "Record the last action taken.");
  if (isVague(followUp.nextAction)) say("nextAction", "Record the next action.");
  if (!followUp.nextFollowUpDate) {
    say("nextFollowUpDate", "Set the next follow-up date.");
  } else if (followUp.nextFollowUpDate < today) {
    say("nextFollowUpDate", "The follow-up date has passed. Record what happened and set a new one.");
  }
  return problems;
}

// ---- Payables -----------------------------------------------------------------

/** Days past due at which an overdue bill becomes critical. */
export const CRITICAL_OVERDUE_DAYS = 30;

/** Positive while there is time left, 0 on the day, negative once overdue. */
export function daysUntilDue(dueDate: DateKey, today: DateKey): number {
  return daysBetween(today, dueDate);
}

export function apStatusGroup(dueDate: DateKey, today: DateKey): ApStatusGroup {
  const days = daysUntilDue(dueDate, today);
  if (days < -CRITICAL_OVERDUE_DAYS) return "critical-overdue";
  if (days < 0) return "overdue";
  if (days === 0) return "due-today";
  if (days <= 7) return "due-7";
  if (days <= 30) return "due-30";
  return "due-later";
}

/** Most pressing first, the order the AP screen groups in. */
export const AP_STATUS_GROUPS: { key: ApStatusGroup; label: string }[] = [
  { key: "critical-overdue", label: "Critical overdue" },
  { key: "overdue", label: "Overdue" },
  { key: "due-today", label: "Due today" },
  { key: "due-7", label: "Due within 7 days" },
  { key: "due-30", label: "Due within 30 days" },
  { key: "due-later", label: "Due later" },
];

/** "Due in 5 days", "Due today", "12 days overdue". */
export function dueLabel(dueDate: DateKey, today: DateKey): string {
  const days = daysUntilDue(dueDate, today);
  if (days === 0) return "Due today";
  if (days > 0) return `Due in ${days} ${days === 1 ? "day" : "days"}`;
  return `${-days} ${days === -1 ? "day" : "days"} overdue`;
}

// ---- Accounts and transfers ---------------------------------------------------

/** Ten billion pesos: far past any balance here, well inside a safe integer. */
export const FINANCE_MAX_CENTS = 1_000_000_000_000;

export function isAmount(value: unknown, allowZero = false): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    (allowZero ? value >= 0 : value > 0) &&
    value <= FINANCE_MAX_CENTS
  );
}

export function accountTypeLabel(account: Pick<MoneyAccount, "type" | "bankKind">): string {
  if (account.type === "cash") return "Cash";
  if (account.type === "ewallet") return "E-wallet";
  return account.bankKind === "passbook" ? "Passbook" : "Bank account";
}

/** Why a new account cannot be saved as typed, or null when it can. */
export function accountInputProblem(
  input: {
    type: MoneyAccount["type"];
    bankKind: MoneyAccount["bankKind"] | null;
    name: string;
    institution: string;
    accountNumber: string;
    openingBalanceCents: number;
    openingDate: DateKey;
  },
  today: DateKey,
): string | null {
  if (!["cash", "bank", "ewallet"].includes(input.type)) return "Choose cash, bank or e-wallet.";
  if (input.type === "bank" && input.bankKind !== "account" && input.bankKind !== "passbook") {
    return "Say whether this is a bank account or a passbook.";
  }
  if (!input.name.trim()) return "Give the account a name, such as \"Petty cash\" or \"BDO savings\".";
  if (input.type !== "cash") {
    if (!input.institution.trim()) return input.type === "bank" ? "Name the bank." : "Name the e-wallet (GCash, Maya…).";
    // The number is what stops the same money being entered twice, so it is
    // required wherever there is one.
    if (input.accountNumber.replace(/\D/g, "").length < 4) {
      return input.type === "bank" ? "Enter the account number, as printed on the passbook or statement." : "Enter the e-wallet's mobile number.";
    }
  }
  if (!isAmount(input.openingBalanceCents, true)) return "The opening balance must be zero or more.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.openingDate)) return "Choose the day the opening balance is for.";
  if (input.openingDate > today) return "The opening balance cannot be for a day that has not come yet.";
  return null;
}

/** Why a transfer cannot be recorded as typed, or null when it can. Balances are `lowestBalance`'s job. */
export function transferProblem(
  transfer: { fromRef: string; toRef: string; amountCents: number; paidOn: DateKey },
  from: Pick<MoneyAccount, "ref" | "name" | "active" | "openingDate"> | null,
  to: Pick<MoneyAccount, "ref" | "name" | "active" | "openingDate"> | null,
  today: DateKey,
): string | null {
  if (!from || !to) return "Choose both accounts.";
  if (from.ref === to.ref) return "Choose two different accounts.";
  if (!from.active || !to.active) return "One of these accounts is no longer used.";
  if (!isAmount(transfer.amountCents)) return "Enter an amount above zero.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(transfer.paidOn)) return "Choose the day of the transfer.";
  if (transfer.paidOn > today) return "A transfer cannot be dated in the future.";
  const opened = from.openingDate > to.openingDate ? from : to;
  if (transfer.paidOn < opened.openingDate) return `${opened.name} has no balance on record before its opening day.`;
  return null;
}

/**
 * The lowest an account's balance stands on any day from `from` to `today`,
 * and the first day it is that low. A back-dated payment out must not leave
 * an account below zero on a later day either, so every day with activity is
 * checked, not only the day of the payment.
 */
export function lowestBalance(
  account: MoneyAccount,
  payments: StandingPayment[],
  from: DateKey,
  today: DateKey,
): { cents: number; dateKey: DateKey } {
  const days = new Set([from, today]);
  for (const row of accountRows(account, payments, today)) {
    if (row.dateKey >= from) days.add(row.dateKey);
  }
  let lowest = { cents: Number.POSITIVE_INFINITY, dateKey: from };
  for (const day of [...days].sort()) {
    const cents = figureOf(accountRows(account, payments, day)).cents;
    if (cents < lowest.cents) lowest = { cents, dateKey: day };
  }
  return lowest;
}

// ---- Reconciliation -----------------------------------------------------------

export function reconcile(bookCents: number, countedCents: number) {
  const differenceCents = countedCents - bookCents;
  return { differenceCents, status: differenceCents === 0 ? ("matched" as const) : ("open" as const) };
}

/** A resolution has to say what the difference was, not just that it was looked at. */
export const MIN_RESOLUTION = 15;

// ---- Reports ------------------------------------------------------------------

const REPORT_NAMES: Record<FinanceReportKind, string> = {
  income: "Income Report",
  standing: "Financial Standing Report",
  "annual-income": "Annual Income Report",
  "year-end-standing": "Year-End Financial Standing",
};

/** "September 2026 Income Report - Revision 1", "2026 Annual Income Report - Revision 2". */
export function reportTitle(kind: FinanceReportKind, period: string, revision: number): string {
  const when = period.length === 7 ? monthLabel(period) : period;
  return `${when} ${REPORT_NAMES[kind]} - Revision ${revision}`;
}
