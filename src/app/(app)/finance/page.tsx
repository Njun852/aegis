import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AccountsPanel } from "@/components/finance/accounts-panel";
import { FinanceWorkspace } from "@/components/finance/finance-workspace";
import { FINANCE_TABS, defaultFinanceTab, type FinanceTab } from "@/lib/finance-tabs";
import { IncomePanel } from "@/components/finance/income-panel";
import { IntakePanel } from "@/components/finance/intake-panel";
import { OverviewPanel } from "@/components/finance/overview-panel";
import { PayablesPanel } from "@/components/finance/payables-panel";
import { ReceivablesPanel } from "@/components/finance/receivables-panel";
import { ReportsPanel } from "@/components/finance/reports-panel";
import { StandingPanel } from "@/components/finance/standing-panel";
import { isAiConfigured } from "@/lib/ai/client";
import { cachedFinanceSummary } from "@/lib/ai/finance-summary";
import { manilaDateKey } from "@/lib/booking-slots";
import { getActiveBusiness } from "@/lib/dal/businesses";
import { financeActor, listEventsFor } from "@/lib/dal/finance";
import { listAccountSummaries, listCounts } from "@/lib/dal/finance-accounts";
import { listAttachmentsFor } from "@/lib/dal/finance-attachments";
import { listFeeRules } from "@/lib/dal/finance-fees";
import { countIntakeWaiting, intakeAllowance, listIntake } from "@/lib/dal/finance-intake";
import { findPaymentDetail } from "@/lib/dal/finance-money";
import { listBills, listPayees, listUnbilledReceipts } from "@/lib/dal/finance-bills";
import {
  listCustomerOptions,
  listInvoiceNumbers,
  listInvoices,
  listUninvoicedJobs,
} from "@/lib/dal/finance-invoices";
import { loadArchive, loadIncome, loadOverview, loadReport, loadStanding } from "@/lib/dal/finance-reports";
import { isDateKey, isMonthKey, isYearKey, monthKeyOf } from "@/lib/finance-periods";
import type { FinanceReportKind, RecordTrail } from "@/types";
import { nextInvoiceNumber } from "@/lib/finance";

/**
 * The history and attachments of an open bill or invoice, its payments'
 * included: a bill payment is logged under its own ref, and a deposit slip
 * may be attached to the payment rather than the record it settles.
 */
async function loadTrail(record: { ref: string; payments: { ref: string }[] } | null): Promise<RecordTrail> {
  if (!record) return { history: [], attachments: [] };
  const refs = [record.ref, ...record.payments.map((payment) => payment.ref)];
  const [history, attachments] = await Promise.all([listEventsFor(refs), listAttachmentsFor(refs)]);
  return { history, attachments };
}

export default async function FinancePage(props: PageProps<"/finance">) {
  const business = await getActiveBusiness();
  if (!business) redirect("/login");

  const params = await props.searchParams;
  const actor = await financeActor();
  const isAdmin = actor.role === "aegis_admin";
  // The owner's tabs are for administrators; a member asking for one gets
  // their own default rather than an error.
  const allowed = FINANCE_TABS.filter((entry) => isAdmin || !entry.adminOnly).map((entry) => entry.id);
  const tab: FinanceTab = allowed.find((entry) => entry === params.tab) ?? defaultFinanceTab(isAdmin);
  const now = new Date();
  const today = manilaDateKey(now);
  const currentMonth = monthKeyOf(now);
  const has = (key: "suppliers" | "quotes" | "crm") => business.modules.includes(key);
  const openInvoice = tab === "receivables" && typeof params.invoice === "string" ? params.invoice : null;
  const openBill = tab === "payables" && typeof params.bill === "string" ? params.bill : null;

  // Every tab shows the attention counts, which need the accounts, bills,
  // invoices and the records not yet entered.
  const [accounts, counts, bills, invoices, receipts, jobs, waiting] = await Promise.all([
    listAccountSummaries(today),
    listCounts(),
    listBills(today),
    listInvoices(today),
    has("suppliers") ? listUnbilledReceipts() : Promise.resolve([]),
    has("quotes") ? listUninvoicedJobs() : Promise.resolve([]),
    countIntakeWaiting(),
  ]);

  const alerts = {
    intake: waiting,
    accounts: counts.filter((count) => count.status === "open").length,
    receivables: invoices.filter((invoice) => invoice.problems.length > 0).length + jobs.length,
    payables: bills.filter((bill) => bill.group === "overdue" || bill.group === "critical-overdue").length + receipts.length,
  };

  let panel: ReactNode;
  if (tab === "overview") {
    const { accountNames, ...overview } = await loadOverview(business);
    panel = <OverviewPanel overview={overview} accountNames={accountNames} />;
  } else if (tab === "income") {
    const month = typeof params.month === "string" && isMonthKey(params.month) && params.month <= currentMonth ? params.month : currentMonth;
    const { income, firstMonth, accountNames, official } = await loadIncome(month);
    panel = <IncomePanel income={income} currentMonth={currentMonth} firstMonth={firstMonth} accountNames={accountNames} official={official} />;
  } else if (tab === "standing") {
    const asOf = typeof params.asOf === "string" && isDateKey(params.asOf) && params.asOf <= today ? params.asOf : today;
    const [{ standing, attention, accountNames, official }, ownerItems] = await Promise.all([
      loadStanding(asOf),
      asOf === today
        ? loadOverview(business).then((overview) =>
            overview.alerts.filter((alert) => ["follow-up", "uninvoiced", "unbilled", "corrections"].includes(alert.key)),
          )
        : Promise.resolve([]),
    ]);
    panel = (
      <StandingPanel standing={standing} attention={attention} ownerItems={ownerItems} today={today} accountNames={accountNames} official={official} />
    );
  } else if (tab === "reports") {
    // ?report=income:2026-09:2 opens that revision as it was frozen.
    const [kind, period = "", rev] = typeof params.report === "string" ? params.report.split(":") : [];
    const revision = Number.parseInt(rev ?? "", 10);
    const valid =
      Number.isInteger(revision) &&
      (((kind === "income" || kind === "standing") && isMonthKey(period)) ||
        ((kind === "annual-income" || kind === "year-end-standing") && isYearKey(period)));
    const [archive, openReport] = await Promise.all([
      loadArchive(),
      valid ? loadReport(kind as FinanceReportKind, period, revision) : Promise.resolve(null),
    ]);
    // A cache read only: opening a report never pays for a summary.
    const openSummary = openReport ? await cachedFinanceSummary(openReport) : null;
    panel = <ReportsPanel archive={archive} openReport={openReport} openSummary={openSummary} aiReady={isAiConfigured()} />;
  } else if (tab === "accounts") {
    const paymentRef = typeof params.payment === "string" ? params.payment : null;
    const [feeRules, payment] = await Promise.all([listFeeRules(), paymentRef ? findPaymentDetail(paymentRef) : Promise.resolve(null)]);
    const openPayment = payment ? { payment, trail: await loadTrail({ ref: payment.ref, payments: [] }) } : null;
    panel = (
      <AccountsPanel
        accounts={accounts}
        counts={counts}
        feeRules={feeRules}
        openPayment={openPayment}
        openRef={typeof params.account === "string" ? params.account : null}
        isAdmin={isAdmin}
        today={today}
      />
    );
  } else if (tab === "intake") {
    const [items, feeRules, allowance] = await Promise.all([listIntake(business.name), listFeeRules(), intakeAllowance()]);
    panel = (
      <IntakePanel
        items={items}
        openRef={typeof params.item === "string" ? params.item : null}
        accounts={accounts.filter((account) => account.active)}
        feeRules={feeRules}
        allowance={allowance}
        isAdmin={isAdmin}
        today={today}
      />
    );
  } else if (tab === "receivables") {
    const [customers, numbers, trail, feeRules] = await Promise.all([
      has("crm") ? listCustomerOptions() : Promise.resolve([]),
      listInvoiceNumbers(),
      loadTrail(invoices.find((invoice) => invoice.ref === openInvoice) ?? null),
      listFeeRules(),
    ]);
    panel = (
      <ReceivablesPanel
        invoices={invoices}
        accounts={accounts}
        customers={customers}
        jobs={jobs}
        suggestedNumber={nextInvoiceNumber(numbers)}
        openRef={openInvoice}
        trail={trail}
        feeRules={feeRules}
        isAdmin={isAdmin}
        today={today}
        userName={actor.name}
      />
    );
  } else {
    const [payees, trail, feeRules] = await Promise.all([
      has("suppliers") ? listPayees() : Promise.resolve([]),
      loadTrail(bills.find((bill) => bill.ref === openBill) ?? null),
      listFeeRules(),
    ]);
    panel = (
      <PayablesPanel
        bills={bills}
        accounts={accounts}
        payees={payees}
        receipts={receipts}
        openRef={openBill}
        trail={trail}
        feeRules={feeRules}
        isAdmin={isAdmin}
        today={today}
        userName={actor.name}
      />
    );
  }

  return (
    <FinanceWorkspace tab={tab} isAdmin={isAdmin} alerts={alerts}>
      {panel}
    </FinanceWorkspace>
  );
}
