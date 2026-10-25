import "server-only";

import { annualIncomeFigures, incomeFigures, standingAttention, standingFigures } from "@/lib/finance";
import { monthDays } from "@/lib/finance-periods";
import { getDb } from "./db";
import type {
  AnnualIncomeFigures,
  BillDocument,
  DateKey,
  IncomeFigures,
  InvoiceDocument,
  MoneyAccount,
  MoneyAccountDocument,
  MonthKey,
  PaymentDocument,
  ReconciliationDocument,
  StandingAttention,
  StandingFigures,
} from "@/types";

/**
 * A stored account as the rest of Finance reads it. Here rather than beside
 * the account screens because the month-end close, run from the command line,
 * must not load anything that needs a session.
 */
export function toAccount(doc: MoneyAccountDocument): MoneyAccount {
  return {
    ref: doc.ref,
    type: doc.type,
    bankKind: doc.bankKind,
    name: doc.name,
    institution: doc.institution,
    numberLast4: doc.numberLast4,
    openingBalanceCents: doc.openingBalanceCents,
    openingDate: doc.openingDate,
    active: doc.active,
  };
}

/**
 * Every finance record of one business, read by its id. The month-end close
 * runs from a timer with no session, so it cannot use `tenantScope`; it names
 * the business explicitly, the way the Text Blast sweep does. Screens call
 * this only with the id their verified session gives them.
 */
export async function readBooksFor(businessId: string) {
  const db = await getDb();
  const [accountDocs, paymentDocs, invoiceDocs, billDocs, countDocs] = await Promise.all([
    db.collection<MoneyAccountDocument>("moneyAccounts").find({ businessId }).toArray(),
    db.collection<PaymentDocument>("payments").find({ businessId, status: "recorded" }).toArray(),
    db.collection<InvoiceDocument>("invoices").find({ businessId }).toArray(),
    db.collection<BillDocument>("bills").find({ businessId }).toArray(),
    db.collection<ReconciliationDocument>("reconciliations").find({ businessId }).toArray(),
  ]);
  return { accounts: accountDocs.map(toAccount), payments: paymentDocs, invoices: invoiceDocs, bills: billDocs, counts: countDocs };
}

export type Books = Awaited<ReturnType<typeof readBooksFor>>;

export function incomeOf(books: Books, month: MonthKey): IncomeFigures {
  return incomeFigures(month, books.invoices, books.bills, books.payments);
}

export function standingOf(books: Books, asOf: DateKey): { standing: StandingFigures; attention: StandingAttention } {
  const standing = standingFigures(asOf, books.accounts, books.payments, books.invoices, books.bills);
  return { standing, attention: standingAttention(asOf, standing, books.invoices, books.bills, books.counts) };
}

/** The year's income with its twelve months: what the Annual Income Report freezes. */
export function annualIncomeOf(books: Books, year: string): AnnualIncomeFigures {
  return annualIncomeFigures(year, books.invoices, books.bills, books.payments);
}

/** Standing at the end of a month's last day: what the month-end report freezes. */
export function monthEndStandingOf(books: Books, month: MonthKey) {
  return standingOf(books, monthDays(month).last);
}

export function accountNamesOf(books: Books): Record<string, string> {
  return Object.fromEntries(books.accounts.map((account) => [account.ref, account.name]));
}

/**
 * The first month anything is dated in: an account's opening, an invoice, a
 * bill or a payment. Null when the business has no finance records, so a
 * business that switched Finance on and entered nothing gets no empty reports.
 */
export function firstMonthOf(books: Books): MonthKey | null {
  const days = [
    ...books.accounts.map((account) => account.openingDate),
    ...books.invoices.filter((doc) => doc.status !== "void").map((doc) => doc.invoiceDate),
    ...books.bills.filter((doc) => doc.status !== "void").map((doc) => doc.billDate),
    ...books.payments.map((doc) => doc.paidOn),
  ].sort();
  return days[0] ? days[0].slice(0, 7) : null;
}
