import { addMonths, daysBetween, inMonth, monthLabel, monthToClose } from "@/lib/finance-periods";
import { formatMoney } from "@/lib/format";
import type {
  AnnualIncomeFigures,
  ApStatusGroup,
  ArAgingBucket,
  ArFollowUp,
  BillDocument,
  BillInput,
  BillPayState,
  DateKey,
  DuplicateMatch,
  ExpenseCategory,
  FeeKind,
  FeeRule,
  FieldChange,
  Figure,
  FigureChange,
  FinanceDocumentStatus,
  FinanceReportKind,
  IncomeFigures,
  InvoiceDocument,
  InvoiceInput,
  MoneyAccount,
  MoneyEntryInput,
  MoneyNature,
  MonthKey,
  PaymentDocument,
  PaymentFeeInput,
  RowChange,
  SourceRow,
  StandingAttention,
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
 * Income reads invoices and bills by the day they are dated, and payment
 * fees by the day they were paid, and never looks at a balance. Standing
 * reads balances and what is still owed and never looks at a month's sales.
 * Every figure carries the rows that make it up.
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
 * matter here, and no receivable, payable or account balance is read. The
 * one cost that is not a bill is a payment's fee (card MDR, a bank charge, an
 * e-wallet fee), counted in the month it was paid under Other Expenses.
 */
export function incomeFigures(
  month: MonthKey,
  invoices: IncomeInvoice[],
  bills: IncomeBill[],
  payments: IncomePayment[] = [],
): IncomeFigures {
  return incomeOver(month, invoices, bills, payments);
}

/** A payment as Income reads it: only its fee, which is a cost of the day it was paid. */
export type IncomePayment = Pick<PaymentDocument, "ref" | "accountRef" | "fee" | "paidOn" | "note" | "status">;

/** Fees are costs, under Other Expenses: the nine printed lines stay the nine lines. */
export const FEE_CATEGORY: ExpenseCategory = "other";

function feeRows(payments: IncomePayment[], dated: (day: DateKey) => boolean): SourceRow[] {
  const rows: SourceRow[] = [];
  for (const payment of payments) {
    const fee = payment.fee;
    if (payment.status !== "recorded" || !fee || fee.cents <= 0 || !dated(payment.paidOn)) continue;
    rows.push({
      kind: "payment",
      ref: payment.ref,
      dateKey: payment.paidOn,
      label: `${feeKindLabel(fee.kind)} · ${payment.ref}${payment.note ? ` · ${payment.note}` : ""}`,
      amountCents: fee.cents,
      accountRef: payment.accountRef,
    });
  }
  return rows;
}

/**
 * Income for a period, a month ("2026-09") or a year ("2026"): every record
 * dated in it. One calculation for both, so the year is exactly its months.
 */
function incomeOver(period: string, invoices: IncomeInvoice[], bills: IncomeBill[], payments: IncomePayment[]): IncomeFigures {
  const dated = (day: DateKey) => (period.length === 7 ? inMonth(day, period) : day.startsWith(`${period}-`));
  const sales = figureOf(
    invoices
      .filter((invoice) => invoice.status !== "void" && dated(invoice.invoiceDate))
      .map((invoice) => ({
        kind: "invoice" as const,
        ref: invoice.ref,
        dateKey: invoice.invoiceDate,
        label: `Invoice ${invoice.number} · ${invoice.customerName}`,
        amountCents: invoice.amountCents,
      })),
  );

  const counted = bills.filter((bill) => bill.status !== "void" && dated(bill.billDate));
  const billRow = (bill: IncomeBill): SourceRow => ({
    kind: "bill",
    ref: bill.ref,
    dateKey: bill.billDate,
    label: bill.reference ? `${bill.payee} · ${bill.reference}` : bill.payee,
    amountCents: bill.amountCents,
  });
  const fees = feeRows(payments, dated);
  const costs = figureOf([...counted.map(billRow), ...fees]);

  const byCategory = Object.fromEntries(
    EXPENSE_CATEGORIES.map(({ key }) => [
      key,
      figureOf([...counted.filter((bill) => bill.category === key).map(billRow), ...(key === FEE_CATEGORY ? fees : [])]),
    ]),
  ) as Record<ExpenseCategory, Figure>;

  const netIncomeCents = sales.cents - costs.cents;
  return {
    month: period,
    sales,
    costs,
    byCategory,
    netIncomeCents,
    netMarginPercent: netMarginPercent(netIncomeCents, sales.cents),
  };
}

/**
 * The Annual Income Report's numbers: the year's sales and costs, the nine
 * category totals, and net income month by month from January to December.
 * The twelve months come from the same rows as the year, so they add up to it.
 */
export function annualIncomeFigures(
  year: string,
  invoices: IncomeInvoice[],
  bills: IncomeBill[],
  payments: IncomePayment[] = [],
): AnnualIncomeFigures {
  const income = incomeOver(year, invoices, bills, payments);
  const inThe = (month: MonthKey, figure: Figure) =>
    figure.rows.filter((row) => inMonth(row.dateKey, month)).reduce((sum, row) => sum + row.amountCents, 0);
  return {
    ...income,
    months: Array.from({ length: 12 }, (_, index) => {
      const month = `${year}-${String(index + 1).padStart(2, "0")}`;
      const salesCents = inThe(month, income.sales);
      const costsCents = inThe(month, income.costs);
      return { month, salesCents, costsCents, netIncomeCents: salesCents - costsCents };
    }),
  };
}

// ---- Standing -----------------------------------------------------------------

export type StandingPayment = Pick<
  PaymentDocument,
  | "ref"
  | "accountRef"
  | "direction"
  | "kind"
  | "amountCents"
  | "fee"
  | "paidOn"
  | "invoiceRef"
  | "billRef"
  | "toAccountRef"
  | "nature"
  | "party"
  | "note"
  | "status"
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
 * What a payment moves in the account it is recorded against: money in
 * arrives less its fee, money out (a transfer too) leaves with its fee on top.
 * Signed, positive for in. The other side of a transfer receives the gross.
 */
export function netMovementCents(payment: Pick<StandingPayment, "direction" | "amountCents" | "fee">): number {
  const fee = payment.fee?.cents ?? 0;
  return payment.direction === "in" ? payment.amountCents - fee : -(payment.amountCents + fee);
}

/**
 * An account's balance on a day as the rows behind it: the opening balance,
 * then every recorded payment in or out up to that day, a transfer counting
 * out of one account and into the other. A payment with a fee is one row for
 * what actually moved, the fee spelled out in its label. An account opened
 * later than `asOf` did not exist yet and has no rows.
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
      accountRef: account.ref,
    },
  ];
  for (const payment of payments) {
    if (!counts(payment, asOf)) continue;
    const leaves = payment.accountRef === account.ref;
    const arrives = payment.kind === "transfer" && payment.toAccountRef === account.ref;
    if (!leaves && !arrives) continue;
    const kind =
      payment.kind === "transfer"
        ? arrives
          ? "Transfer in"
          : "Transfer out"
        : payment.nature
          ? [moneyNatureLabel(payment.nature), payment.party].filter(Boolean).join(" · ")
          : KIND_LABEL[payment.kind];
    const fee = !arrives && payment.fee && payment.fee.cents > 0 ? payment.fee.cents : 0;
    const label = [kind, payment.note, fee > 0 && formatFeeLine(payment.amountCents, fee, payment.direction)].filter(Boolean).join(" · ");
    rows.push({
      kind: "payment",
      ref: payment.ref,
      dateKey: payment.paidOn,
      label,
      amountCents: arrives ? payment.amountCents : netMovementCents(payment),
      accountRef: account.ref,
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
  const ewallet = ofType("ewallet");
  const bankOf = (passbook: boolean) =>
    figureOf(
      accounts
        .filter((account) => account.type === "bank" && (account.bankKind === "passbook") === passbook)
        .flatMap((account) => accountRows(account, payments, asOf)),
    );
  const bankAccounts = bankOf(false);
  const passbooks = bankOf(true);
  const bank = figureOf([...bankAccounts.rows, ...passbooks.rows]);
  return {
    asOf,
    cash,
    bank,
    bankAccounts,
    passbooks,
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

/**
 * The exceptions the Financial Standing Report lists, for the same day as its
 * figures: receivables over 90 days, bills overdue and due within seven days,
 * and counts with an unexplained difference. Each is a figure with its rows,
 * so it opens into the records like every other number.
 */
export function standingAttention(
  asOf: DateKey,
  standing: Pick<StandingFigures, "receivable" | "payable">,
  invoices: Pick<StandingInvoice, "ref" | "invoiceDate">[],
  bills: Pick<StandingBill, "ref" | "dueDate">[],
  counts: { ref: string; accountRef: string; asOf: DateKey; differenceCents: number; status: string }[],
): StandingAttention {
  const invoiceDates = new Map(invoices.map((invoice) => [invoice.ref, invoice.invoiceDate]));
  const dueDates = new Map(bills.map((bill) => [bill.ref, bill.dueDate]));
  const due = (row: SourceRow) => daysUntilDue(dueDates.get(row.ref) ?? asOf, asOf);
  return {
    asOf,
    ar90: figureOf(
      standing.receivable.rows.filter((row) => isOver90(invoiceDates.get(row.ref) ?? row.dateKey, asOf)),
    ),
    apOverdue: figureOf(standing.payable.rows.filter((row) => due(row) < 0)),
    apDue7: figureOf(standing.payable.rows.filter((row) => due(row) >= 0 && due(row) <= 7)),
    differences: figureOf(
      counts
        .filter((count) => count.status === "open" && count.asOf <= asOf)
        .map((count) => ({
          kind: "count" as const,
          ref: count.ref,
          dateKey: count.asOf,
          label: "Count differs from the book",
          amountCents: count.differenceCents,
          accountRef: count.accountRef,
        })),
    ),
  };
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

// ---- Money in and out ---------------------------------------------------------

export interface MoneyNatureEntry {
  key: MoneyNature;
  direction: "in" | "out";
  label: string;
  /** What it does to the Income Report. */
  effect: "income" | "expense" | "none";
  hint: string;
  /** What the person or company on the other side is called on the form. */
  partyLabel: string;
}

/**
 * The kinds of Money In and Money Out. A sale is posted as an invoice and an
 * expense as a bill, each settled the same day, so Income counts them exactly
 * as it counts any invoice or bill. The rest move a balance and are never
 * income or expense: owner's money in or out, a loan and its repayment.
 */
export const MONEY_NATURES: MoneyNatureEntry[] = [
  { key: "sale", direction: "in", label: "Sale", effect: "income", hint: "A walk-in or cash sale, paid on the spot. Counts as a sale this month.", partyLabel: "Customer" },
  { key: "owner-capital", direction: "in", label: "Owner's money in", effect: "none", hint: "The owner putting money into the business. Not income.", partyLabel: "From" },
  { key: "loan-received", direction: "in", label: "Loan received", effect: "none", hint: "Money borrowed. Not income; repaying it is not an expense.", partyLabel: "Lender" },
  { key: "other-in", direction: "in", label: "Other money in", effect: "none", hint: "A refund or deposit back that is not a sale. Not income; say what it is.", partyLabel: "From" },
  { key: "expense", direction: "out", label: "Expense", effect: "expense", hint: "A cost paid on the spot: fuel, a repair, supplies. Counts as a cost this month.", partyLabel: "Supplier / payee" },
  { key: "owner-drawing", direction: "out", label: "Owner's drawing", effect: "none", hint: "The owner taking money out of the business. Not an expense.", partyLabel: "To" },
  { key: "loan-repayment", direction: "out", label: "Loan repayment", effect: "none", hint: "Paying back money borrowed. Not an expense; enter interest as an expense.", partyLabel: "Lender" },
  { key: "other-out", direction: "out", label: "Other money out", effect: "none", hint: "A deposit or advance that is not a cost. Not an expense; say what it is.", partyLabel: "To" },
];

export function moneyNatureLabel(nature: MoneyNature): string {
  return MONEY_NATURES.find((entry) => entry.key === nature)?.label ?? nature;
}

/** Why a Money In or Money Out entry cannot be recorded as typed, or null when it can. */
export function moneyEntryProblem(
  input: Pick<MoneyEntryInput, "direction" | "nature" | "accountRef" | "amountCents" | "paidOn" | "party" | "reference" | "description" | "category">,
  today: DateKey,
): string | null {
  const nature = MONEY_NATURES.find((entry) => entry.key === input.nature);
  if (!nature || nature.direction !== input.direction) return "Choose what the money is.";
  if (!input.accountRef) return input.direction === "in" ? "Choose the account it went into." : "Choose the account it came from.";
  if (!isAmount(input.amountCents)) return "Enter the amount, above zero.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidOn)) return "Choose the day.";
  if (input.paidOn > today) return "Money in or out cannot be dated in the future.";
  if ((nature.effect !== "none" || nature.key.startsWith("loan")) && !input.party.trim()) return `Name the ${nature.partyLabel.toLowerCase()}.`;
  if (nature.key === "sale" && !input.reference.trim()) return "Give the official receipt or sales invoice number.";
  if (nature.key === "expense" && !EXPENSE_CATEGORIES.some((entry) => entry.key === input.category)) return "Choose the expense category.";
  if ((nature.key === "other-in" || nature.key === "other-out") && input.description.trim().length < 5) {
    return "Say what this money is, so it is not mistaken for income or an expense.";
  }
  return null;
}

// ---- Fees ---------------------------------------------------------------------

export const FEE_KINDS: { key: FeeKind; label: string; hint: string }[] = [
  { key: "card", label: "Card fee (MDR)", hint: "What the card terminal keeps from a card payment." },
  { key: "bank", label: "Bank charge", hint: "A bank's charge for a transfer, cheque or deposit." },
  { key: "ewallet", label: "E-wallet fee", hint: "GCash or Maya cash-in, cash-out or payment fees." },
];

export function feeKindLabel(kind: FeeKind): string {
  return FEE_KINDS.find((entry) => entry.key === kind)?.label ?? kind;
}

/** A hundred percent, in hundredths of a percent. No rule takes the whole amount. */
export const MAX_FEE_BPS = 10_000;

/** A rule's fee on a gross, rounded to the centavo: 3% of ₱10,000.00 is ₱300.00. */
export function feeFromRule(rule: Pick<FeeRule, "percentBps" | "fixedCents">, grossCents: number): number {
  return Math.round((grossCents * rule.percentBps) / 10_000) + rule.fixedCents;
}

/** "3%", "₱15.00", "2.5% + ₱15.00". */
export function describeFeeRule(rule: Pick<FeeRule, "percentBps" | "fixedCents">): string {
  const parts = [
    rule.percentBps > 0 && `${(rule.percentBps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`,
    rule.fixedCents > 0 && formatMoney(rule.fixedCents),
  ].filter(Boolean);
  return parts.length ? parts.join(" + ") : "No fee";
}

/** What moved, the fee and what is left, for an account's history: Gross / Fee / Net in one line. */
export function formatFeeLine(grossCents: number, feeCents: number, direction: "in" | "out"): string {
  return direction === "in"
    ? `gross ${formatMoney(grossCents)} less fee ${formatMoney(feeCents)} = net ${formatMoney(grossCents - feeCents)}`
    : `${formatMoney(grossCents)} plus fee ${formatMoney(feeCents)} = ${formatMoney(grossCents + feeCents)} out`;
}

/** Why a fee rule cannot be saved as typed, or null when it can. */
export function feeRuleProblem(input: { name: string; kind: FeeKind; percentBps: number; fixedCents: number }): string | null {
  if (!input.name.trim()) return "Name the rule, such as \"BDO card terminal\" or \"GCash cash-out\".";
  if (!FEE_KINDS.some((entry) => entry.key === input.kind)) return "Choose card, bank or e-wallet.";
  if (!Number.isInteger(input.percentBps) || input.percentBps < 0 || input.percentBps >= MAX_FEE_BPS) {
    return "The percentage must be from 0 up to, but not including, 100%.";
  }
  if (!isAmount(input.fixedCents, true)) return "The fixed amount must be zero or more.";
  if (input.percentBps === 0 && input.fixedCents === 0) return "Give a percentage, a fixed amount, or both.";
  return null;
}

/**
 * Why a payment's fee cannot be recorded, or null when it can. Money in must
 * leave something after its fee; a fee on money out is paid on top.
 */
export function feeProblem(fee: PaymentFeeInput | null, grossCents: number, direction: "in" | "out"): string | null {
  if (!fee) return null;
  if (!FEE_KINDS.some((entry) => entry.key === fee.kind)) return "Choose what kind of fee it was.";
  if (!isAmount(fee.cents)) return "Enter the fee, above zero, or choose no fee.";
  if (direction === "in" && fee.cents >= grossCents) return "The fee cannot be the whole amount received or more.";
  return null;
}

// ---- Duplicates ---------------------------------------------------------------

/** "D.R. 4471" and "dr4471" are the same reference; "Davao Auto Parts, Inc." and "davao auto parts inc" the same name. */
export function sameText(a: string, b: string): boolean {
  const plain = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
  const left = plain(a);
  return left.length > 0 && left === plain(b);
}

export interface DuplicateCandidate {
  ref: string;
  /** The supplier on a bill, the customer on an invoice. */
  party: string;
  /** The supplier's reference, or the invoice number. */
  reference: string;
  dateKey: DateKey;
  amountCents: number;
  /** For the warning: "Davao Auto Parts · DR 4471 · ₱12,500.00 · Oct 3, 2026". */
  label: string;
}

/**
 * Records on file that a new one may repeat, checked on the reference number,
 * the supplier or customer, the date and the amount. A shared reference with
 * the same name or the same amount is the same document; so is the same name,
 * day and amount with no reference to tell them apart. Void records are not
 * passed in.
 */
export function findDuplicates(
  input: Omit<DuplicateCandidate, "ref" | "label">,
  existing: DuplicateCandidate[],
): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];
  for (const doc of existing) {
    const sameRef = sameText(input.reference, doc.reference);
    const sameParty = sameText(input.party, doc.party);
    const sameAmount = input.amountCents === doc.amountCents;
    let reason: string | null = null;
    if (sameRef && sameParty) reason = "Same reference number and the same name";
    else if (sameRef && sameAmount) reason = "Same reference number and amount";
    else if (sameParty && sameAmount && input.dateKey === doc.dateKey) reason = "Same name, date and amount";
    if (reason) matches.push({ ref: doc.ref, label: doc.label, reason });
  }
  return matches;
}

// ---- Bills --------------------------------------------------------------------

/**
 * Days of credit in a supplier's terms as typed: "30 days" is 30, "Cash" or
 * "COD" is 0. Null when the terms say nothing that can be read as a number of
 * days, so a person sets the due date rather than AEGIS guessing one.
 */
export function termsDays(terms: string): number | null {
  const text = terms.toLowerCase();
  const days = text.match(/(\d{1,3})\s*(?:-\s*)?(?:days?|d\b)/);
  if (days) return Number(days[1]);
  if (/\b(cash|cod|c\.o\.d|on delivery|upon delivery)\b/.test(text)) return 0;
  return null;
}

export function billPayState(amountCents: number, paidCents: number, status: FinanceDocumentStatus): BillPayState {
  if (status === "void") return "Void";
  if (paidCents <= 0) return "Unpaid";
  return paidCents >= amountCents ? "Paid" : "Part paid";
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Why a bill cannot be saved as typed, or null when it can. */
export function billInputProblem(
  input: Pick<BillInput, "payee" | "billDate" | "dueDate" | "amountCents" | "category">,
  today: DateKey,
): string | null {
  if (!input.payee.trim()) return "Name the supplier or payee.";
  if (!EXPENSE_CATEGORIES.some((entry) => entry.key === input.category)) return "Choose a category.";
  if (!isAmount(input.amountCents)) return "Enter the bill's amount, above zero.";
  if (!DAY.test(input.billDate)) return "Choose the bill's date.";
  if (input.billDate > today) return "A bill cannot be dated in the future. Date it the day it was issued.";
  if (!DAY.test(input.dueDate)) return "Choose the due date.";
  if (input.dueDate < input.billDate) return "The due date cannot be before the bill's date.";
  return null;
}

/** Why a payment against a bill cannot be recorded, or null when it can. */
export function billPaymentProblem(
  payment: { amountCents: number; paidOn: DateKey },
  bill: { billDate: DateKey; outstandingCents: number; status: FinanceDocumentStatus },
  today: DateKey,
): string | null {
  if (bill.status === "void") return "This bill is void.";
  if (bill.outstandingCents <= 0) return "This bill is already paid in full.";
  if (!isAmount(payment.amountCents)) return "Enter the amount paid, above zero.";
  if (payment.amountCents > bill.outstandingCents) return "That is more than is still owed on this bill.";
  if (!DAY.test(payment.paidOn)) return "Choose the day it was paid.";
  if (payment.paidOn > today) return "A payment cannot be dated in the future.";
  if (payment.paidOn < bill.billDate) return "A payment cannot be dated before the bill.";
  return null;
}

// ---- Invoices -----------------------------------------------------------------

/**
 * The number after the highest one issued, keeping its prefix and width:
 * after "SI-0099" comes "SI-0100". "0001" when nothing has been issued. Only
 * a suggestion; the shop's own printed numbers win.
 */
export function nextInvoiceNumber(numbers: string[]): string {
  let best: { prefix: string; digits: string; value: number } | null = null;
  for (const number of numbers) {
    const match = number.trim().match(/^(.*?)(\d+)$/);
    if (!match) continue;
    const value = Number(match[2]);
    if (!best || value > best.value) best = { prefix: match[1], digits: match[2], value };
  }
  if (!best) return "0001";
  return `${best.prefix}${String(best.value + 1).padStart(best.digits.length, "0")}`;
}

/** Why an invoice cannot be saved as typed, or null when it can. */
export function invoiceInputProblem(
  input: Pick<InvoiceInput, "customerName" | "number" | "invoiceDate" | "dueDate" | "amountCents" | "nextFollowUpDate">,
  today: DateKey,
): string | null {
  if (!input.customerName.trim()) return "Name the customer or company.";
  if (!input.number.trim()) return "Give the invoice number.";
  if (!isAmount(input.amountCents)) return "Enter the invoice amount, above zero.";
  if (!DAY.test(input.invoiceDate)) return "Choose the invoice date.";
  if (input.invoiceDate > today) return "An invoice cannot be dated in the future. Date it the day it was issued.";
  if (!DAY.test(input.dueDate)) return "Choose the due date.";
  if (input.dueDate < input.invoiceDate) return "The due date cannot be before the invoice date.";
  if (input.nextFollowUpDate && !DAY.test(input.nextFollowUpDate)) return "Choose a valid follow-up date, or leave it empty.";
  return null;
}

/** Why money cannot be recorded as collected on an invoice, or null when it can. */
export function collectionProblem(
  payment: { amountCents: number; paidOn: DateKey },
  invoice: { invoiceDate: DateKey; outstandingCents: number; status: FinanceDocumentStatus },
  today: DateKey,
): string | null {
  if (invoice.status === "void") return "This invoice is void.";
  if (invoice.outstandingCents <= 0) return "This invoice is already collected in full.";
  if (!isAmount(payment.amountCents)) return "Enter the amount collected, above zero.";
  if (payment.amountCents > invoice.outstandingCents) return "That is more than is still owed on this invoice.";
  if (!DAY.test(payment.paidOn)) return "Choose the day it was collected.";
  if (payment.paidOn > today) return "A collection cannot be dated in the future.";
  if (payment.paidOn < invoice.invoiceDate) return "A collection cannot be dated before the invoice.";
  return null;
}

/** Over 90 days since the invoice date, the line the 90+ day control starts from. */
export function isOver90(invoiceDate: DateKey, today: DateKey): boolean {
  return arAgingBucket(daysOutstanding(invoiceDate, today)) === "90+";
}

/**
 * What a follow-up save is missing. Under 90 days nothing is required; over
 * 90 all six fields of the 90+ day control are, and a vague remark is refused.
 */
export function followUpProblems(followUp: ArFollowUp, invoiceDate: DateKey, today: DateKey): FollowUpProblem[] {
  if (followUp.nextFollowUpDate && !DAY.test(followUp.nextFollowUpDate)) {
    return [{ field: "nextFollowUpDate", message: "Choose a valid follow-up date." }];
  }
  return isOver90(invoiceDate, today) ? ar90Problems(followUp, today) : [];
}

// ---- Reconciliation -----------------------------------------------------------

export function reconcile(bookCents: number, countedCents: number) {
  const differenceCents = countedCents - bookCents;
  return { differenceCents, status: differenceCents === 0 ? ("matched" as const) : ("open" as const) };
}

/** A resolution has to say what the difference was, not just that it was looked at. */
export const MIN_RESOLUTION = 15;

// ---- Month-end close and corrections -----------------------------------------

/**
 * Months that have ended and have no report yet, oldest first: from the first
 * month anything is dated in, up to the month just ended. A server that was
 * down on the 1st catches up on its next run instead of skipping a month.
 */
export function monthsToClose(firstMonth: MonthKey | null, now: Date, closed: Set<MonthKey>): MonthKey[] {
  if (!firstMonth) return [];
  const last = monthToClose(now);
  const months: MonthKey[] = [];
  for (let month = firstMonth; month <= last; month = addMonths(month, 1)) {
    if (!closed.has(month)) months.push(month);
  }
  return months;
}

/**
 * Years whose December has closed and that have no year-end reports yet,
 * oldest first. The annual pair follows the December close: never before
 * December has ended, and caught up like the months after downtime.
 */
export function yearsToClose(firstMonth: MonthKey | null, now: Date, closed: Set<string>): string[] {
  if (!firstMonth) return [];
  const last = monthToClose(now);
  const years: string[] = [];
  for (let year = Number(firstMonth.slice(0, 4)); `${year}-12` <= last; year += 1) {
    if (!closed.has(String(year))) years.push(String(year));
  }
  return years;
}

/**
 * What differs between a figure as a report froze it and as the records give
 * it now, record by record. Empty when nothing changed, which is what keeps a
 * month from being flagged.
 */
export function figureChange(label: string, frozen: Figure, live: Figure): FigureChange | null {
  const key = (row: SourceRow) => `${row.kind}:${row.ref}`;
  const before = new Map(frozen.rows.map((row) => [key(row), row]));
  const after = new Map(live.rows.map((row) => [key(row), row]));
  const rows: RowChange[] = [];
  for (const [id, row] of after) {
    const old = before.get(id);
    if (!old || old.amountCents !== row.amountCents) {
      rows.push({ ref: row.ref, kind: row.kind, label: row.label, dateKey: row.dateKey, fromCents: old ? old.amountCents : null, toCents: row.amountCents });
    }
  }
  for (const [id, row] of before) {
    if (!after.has(id)) rows.push({ ref: row.ref, kind: row.kind, label: row.label, dateKey: row.dateKey, fromCents: row.amountCents, toCents: null });
  }
  if (rows.length === 0 && frozen.cents === live.cents) return null;
  return { label, fromCents: frozen.cents, toCents: live.cents, rows: rows.sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1)) };
}

/** The income report's changes: sales and costs, which every other line follows from. */
export function incomeChanges(frozen: IncomeFigures, live: IncomeFigures): FigureChange[] {
  return [figureChange("Sales / Revenue", frozen.sales, live.sales), figureChange("Costs & Expenses", frozen.costs, live.costs)].filter(
    (change): change is FigureChange => change !== null,
  );
}

/**
 * The standing report's changes: the six money lines. The exceptions are left
 * out on purpose: an old count explained after the close would otherwise flag
 * the month, though no balance moved.
 */
export function standingChanges(frozen: StandingFigures, live: StandingFigures): FigureChange[] {
  return [
    figureChange("Cash on hand", frozen.cash, live.cash),
    figureChange("Bank accounts", frozen.bankAccounts, live.bankAccounts),
    figureChange("Passbook accounts", frozen.passbooks, live.passbooks),
    figureChange("E-wallet balances", frozen.ewallet, live.ewallet),
    figureChange("Accounts receivable", frozen.receivable, live.receivable),
    figureChange("Accounts payable", frozen.payable, live.payable),
  ].filter((change): change is FigureChange => change !== null);
}

/** A correction has to say what was wrong, not just that something was. */
export const MIN_REVISION_REASON = 15;

/**
 * Editing a posted record is a correction and says why, as a void does. The
 * reason and every changed field, old and new, go into the record's history.
 */
export const MIN_CORRECTION_REASON = 5;

/** The fields that differ between two displayed versions of a record, in the order given. */
export function fieldChanges(fields: FieldChange[]): FieldChange[] {
  return fields.filter((entry) => entry.from !== entry.to);
}

/** "Amount: ₱ 4,500.00 to ₱ 5,400.00; Due date: Oct 3, 2026 to Oct 10, 2026", a correction's history line. */
export function changeSummary(changes: FieldChange[]): string {
  return changes.map((change) => `${change.field}: ${change.from || "(empty)"} to ${change.to || "(empty)"}`).join("; ");
}

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
