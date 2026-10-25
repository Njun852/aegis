import "server-only";

import { manilaDateKey } from "@/lib/booking-slots";
import { ar90Problems, isOver90, reportTitle } from "@/lib/finance";
import { monthDays, monthKeyOf, periodLabel } from "@/lib/finance-periods";
import { formatMoney } from "@/lib/format";
import { listUnbilledReceipts } from "./finance-bills";
import { accountNamesOf, firstMonthOf, incomeOf, readBooksFor, standingOf, type Books } from "./finance-books";
import { findReport, listArchive } from "./finance-close";
import { listUninvoicedJobs } from "./finance-invoices";
import { requireAdmin } from "./session";
import type {
  ArchiveMonth,
  Business,
  DateKey,
  FinanceAlert,
  FinanceOverview,
  FinanceReportKind,
  FinanceReportView,
  IncomeFigures,
  MonthKey,
  MonthlyReportKind,
  OfficialReport,
  StandingAttention,
  StandingFigures,
} from "@/types";

/**
 * The owner's reports, worked out live from the records. Income and Standing
 * are computed by separate pure functions in `src/lib/finance.ts` and never
 * from each other. Administrators only: these are the owner's figures.
 */

/** The signed-in administrator's business, and its records. */
async function readBooks(): Promise<{ businessId: string; books: Books }> {
  const { activeBusinessId } = await requireAdmin();
  return { businessId: activeBusinessId, books: await readBooksFor(activeBusinessId) };
}

function officialOf(archive: ArchiveMonth[], kind: MonthlyReportKind, month: MonthKey): OfficialReport | null {
  const entry = archive.find((item) => item.period === month);
  const latest = entry?.[kind].at(-1);
  if (!entry || !latest) return null;
  const changes = kind === "income" ? entry.incomeChanges : entry.standingChanges;
  return { kind, period: month, title: reportTitle(kind, month, latest.revision), revision: latest.revision, generatedAt: latest.generatedAt, changed: changes.length > 0 };
}

export async function loadIncome(month: MonthKey): Promise<{
  income: IncomeFigures;
  firstMonth: MonthKey;
  accountNames: Record<string, string>;
  official: OfficialReport | null;
}> {
  const { businessId, books } = await readBooks();
  const archive = await listArchive(businessId);
  return {
    income: incomeOf(books, month),
    firstMonth: firstMonthOf(books) ?? month,
    accountNames: accountNamesOf(books),
    official: officialOf(archive, "income", month),
  };
}

export async function loadStanding(asOf: DateKey): Promise<{
  standing: StandingFigures;
  attention: StandingAttention;
  accountNames: Record<string, string>;
  official: OfficialReport | null;
}> {
  const { businessId, books } = await readBooks();
  // Only a month's last day has a frozen standing report to point at.
  const month = asOf.slice(0, 7);
  const archive = asOf === monthDays(month).last ? await listArchive(businessId) : [];
  return { ...standingOf(books, asOf), accountNames: accountNamesOf(books), official: officialOf(archive, "standing", month) };
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * The owner's Finance screen: this month's net income, where the business
 * stands today, and only the items that need someone. Anything normal stays
 * on the other tabs.
 */
export async function loadOverview(business: Business): Promise<FinanceOverview & { accountNames: Record<string, string> }> {
  const now = new Date();
  const today = manilaDateKey(now);
  const month = monthKeyOf(now);
  const has = (key: "quotes" | "suppliers") => business.modules.includes(key);
  const [{ businessId, books }, jobs, receipts] = await Promise.all([
    readBooks(),
    has("quotes") ? listUninvoicedJobs() : Promise.resolve([]),
    has("suppliers") ? listUnbilledReceipts() : Promise.resolve([]),
  ]);
  const archive = await listArchive(businessId);
  const income = incomeOf(books, month);
  const { standing, attention } = standingOf(books, today);

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
  // A closed month whose records no longer match its report: an entry, edit
  // or void dated in it since the close. Only an administrator can decide
  // whether that is a correction and issue the next revision.
  const changed = archive.filter((entry) => entry.incomeChanges.length > 0 || entry.standingChanges.length > 0);
  if (changed.length > 0) {
    alerts.push({
      key: "corrections",
      title: `${plural(changed.length, "closed report period has", "closed report periods have")} changes waiting for review`,
      detail: `${changed.map((entry) => periodLabel(entry.period)).join(", ")}: records dated in ${changed.length === 1 ? "it" : "them"} changed after the report was made.`,
      amount: "",
      href: "/finance?tab=reports",
      tone: "negative",
    });
  }

  return {
    today,
    month,
    income,
    standing,
    alerts,
    accountNames: accountNamesOf(books),
  };
}

/** The signed-in business's month-end archive, for the Reports tab. */
export async function loadArchive(): Promise<ArchiveMonth[]> {
  const { activeBusinessId } = await requireAdmin();
  return listArchive(activeBusinessId);
}

/** One frozen revision, to view on screen with its own drill-down. */
export async function loadReport(kind: FinanceReportKind, period: string, revision: number): Promise<FinanceReportView | null> {
  const { activeBusinessId } = await requireAdmin();
  const doc = await findReport(activeBusinessId, kind, period, revision);
  if (!doc) return null;
  const { businessId, generatedAt, ...rest } = doc;
  void businessId;
  return { ...rest, generatedAt: generatedAt.toISOString() };
}
