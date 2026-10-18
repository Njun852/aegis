import "server-only";

import { manilaDateKey } from "@/lib/booking-slots";
import { ar90Problems, incomeFigures, isOver90, standingAttention, standingFigures } from "@/lib/finance";
import { monthKeyOf } from "@/lib/finance-periods";
import { formatMoney } from "@/lib/format";
import { toAccount } from "./finance-accounts";
import { listUnbilledReceipts } from "./finance-bills";
import { listUninvoicedJobs } from "./finance-invoices";
import { bills, invoices, moneyAccounts, payments, reconciliations } from "./finance";
import { requireAdmin } from "./session";
import type {
  Business,
  DateKey,
  FinanceAlert,
  FinanceOverview,
  IncomeFigures,
  MonthKey,
  StandingAttention,
  StandingFigures,
} from "@/types";

/**
 * The owner's reports, worked out live from the records. Income and Standing
 * are computed by separate pure functions in `src/lib/finance.ts` and never
 * from each other. Administrators only: these are the owner's figures.
 */

async function readBooks() {
  const [accountCollection, paymentCollection, invoiceCollection, billCollection, countCollection] = await Promise.all([
    moneyAccounts(),
    payments(),
    invoices(),
    bills(),
    reconciliations(),
  ]);
  const [accountDocs, paymentDocs, invoiceDocs, billDocs, countDocs] = await Promise.all([
    accountCollection.find().toArray(),
    paymentCollection.find({ status: "recorded" }).toArray(),
    invoiceCollection.find().toArray(),
    billCollection.find().toArray(),
    countCollection.find().toArray(),
  ]);
  return { accounts: accountDocs.map(toAccount), payments: paymentDocs, invoices: invoiceDocs, bills: billDocs, counts: countDocs };
}

type Books = Awaited<ReturnType<typeof readBooks>>;

function standingFrom(books: Books, asOf: DateKey): { standing: StandingFigures; attention: StandingAttention } {
  const standing = standingFigures(asOf, books.accounts, books.payments, books.invoices, books.bills);
  const attention = standingAttention(asOf, standing, books.invoices, books.bills, books.counts);
  return { standing, attention };
}

/** The first month anything is dated in, so the month picker does not go back further. */
function firstMonthOf(books: Books, fallback: MonthKey): MonthKey {
  const days = [
    ...books.invoices.map((doc) => doc.invoiceDate),
    ...books.bills.map((doc) => doc.billDate),
  ].sort();
  return days[0] ? days[0].slice(0, 7) : fallback;
}

export async function loadIncome(month: MonthKey): Promise<{ income: IncomeFigures; firstMonth: MonthKey; accountNames: Record<string, string> }> {
  await requireAdmin();
  const books = await readBooks();
  return {
    income: incomeFigures(month, books.invoices, books.bills),
    firstMonth: firstMonthOf(books, month),
    accountNames: Object.fromEntries(books.accounts.map((account) => [account.ref, account.name])),
  };
}

export async function loadStanding(asOf: DateKey): Promise<{
  standing: StandingFigures;
  attention: StandingAttention;
  accountNames: Record<string, string>;
}> {
  await requireAdmin();
  const books = await readBooks();
  return {
    ...standingFrom(books, asOf),
    accountNames: Object.fromEntries(books.accounts.map((account) => [account.ref, account.name])),
  };
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * The owner's Finance screen: this month's net income, where the business
 * stands today, and only the items that need someone. Anything normal stays
 * on the other tabs.
 */
export async function loadOverview(business: Business): Promise<FinanceOverview & { accountNames: Record<string, string> }> {
  await requireAdmin();
  const now = new Date();
  const today = manilaDateKey(now);
  const month = monthKeyOf(now);
  const has = (key: "quotes" | "suppliers") => business.modules.includes(key);
  const [books, jobs, receipts] = await Promise.all([
    readBooks(),
    has("quotes") ? listUninvoicedJobs() : Promise.resolve([]),
    has("suppliers") ? listUnbilledReceipts() : Promise.resolve([]),
  ]);
  const income = incomeFigures(month, books.invoices, books.bills);
  const { standing, attention } = standingFrom(books, today);

  // The 90+ day control is judged on the follow-up as it stands now.
  const owedRefs = new Set(standing.receivable.rows.map((row) => row.ref));
  const missingFollowUp = books.invoices.filter(
    (doc) => owedRefs.has(doc.ref) && isOver90(doc.invoiceDate, today) && ar90Problems(doc.followUp, today).length > 0,
  );

  const alerts: FinanceAlert[] = [];
  if (attention.ar90.rows.length > 0) {
    alerts.push({
      key: "ar90",
      title: `${plural(attention.ar90.rows.length, "receivable", "receivables")} over 90 days`,
      detail: attention.ar90.rows.slice(0, 2).map((row) => row.label).join(", "),
      amount: formatMoney(attention.ar90.cents),
      href: "/finance?tab=receivables",
      tone: "negative",
    });
  }
  if (missingFollowUp.length > 0) {
    alerts.push({
      key: "follow-up",
      title: `${plural(missingFollowUp.length, "receivable", "receivables")} over 90 days without the required follow-up`,
      detail: missingFollowUp.slice(0, 2).map((doc) => `Invoice ${doc.number} · ${doc.customerName}`).join(", "),
      amount: "",
      href: "/finance?tab=receivables",
      tone: "negative",
    });
  }
  if (attention.apOverdue.rows.length > 0) {
    alerts.push({
      key: "ap-overdue",
      title: `${plural(attention.apOverdue.rows.length, "bill", "bills")} overdue`,
      detail: attention.apOverdue.rows.slice(0, 2).map((row) => row.label).join(", "),
      amount: formatMoney(attention.apOverdue.cents),
      href: "/finance?tab=payables",
      tone: "negative",
    });
  }
  if (attention.apDue7.rows.length > 0) {
    alerts.push({
      key: "ap-due7",
      title: `${plural(attention.apDue7.rows.length, "bill", "bills")} due within 7 days`,
      detail: attention.apDue7.rows.slice(0, 2).map((row) => row.label).join(", "),
      amount: formatMoney(attention.apDue7.cents),
      href: "/finance?tab=payables",
      tone: "warning",
    });
  }
  if (attention.differences.rows.length > 0) {
    const names = new Map(books.accounts.map((account) => [account.ref, account.name]));
    alerts.push({
      key: "differences",
      title: `${plural(attention.differences.rows.length, "cash or bank count differs", "cash or bank counts differ")} from the book`,
      detail: attention.differences.rows.slice(0, 2).map((row) => names.get(row.accountRef ?? "") ?? row.ref).join(", "),
      amount: "",
      href: "/finance?tab=accounts",
      tone: "negative",
    });
  }
  // Records missing from AR and AP make every figure above incomplete, so the
  // owner hears about them here rather than only on the tabs.
  if (jobs.length > 0) {
    alerts.push({
      key: "uninvoiced",
      title: `${plural(jobs.length, "completed job order has", "completed job orders have")} no invoice`,
      detail: "Finished work is not counted as a sale or a receivable until it is invoiced.",
      amount: formatMoney(jobs.reduce((sum, job) => sum + job.approvedTotalCents, 0)),
      href: "/finance?tab=receivables",
      tone: "warning",
    });
  }
  if (receipts.length > 0) {
    alerts.push({
      key: "unbilled",
      title: `${plural(receipts.length, "supplier receipt has", "supplier receipts have")} no bill`,
      detail: "Goods received on credit are not counted as a cost or a payable until billed.",
      amount: formatMoney(receipts.reduce((sum, receipt) => sum + receipt.totalCents, 0)),
      href: "/finance?tab=payables",
      tone: "warning",
    });
  }

  return {
    today,
    month,
    income,
    standing,
    alerts,
    accountNames: Object.fromEntries(books.accounts.map((account) => [account.ref, account.name])),
  };
}
