import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AccountsPanel } from "@/components/finance/accounts-panel";
import { FinanceWorkspace } from "@/components/finance/finance-workspace";
import { FINANCE_TABS, defaultFinanceTab, type FinanceTab } from "@/lib/finance-tabs";
import { IncomePanel } from "@/components/finance/income-panel";
import { OverviewPanel } from "@/components/finance/overview-panel";
import { PayablesPanel } from "@/components/finance/payables-panel";
import { ReceivablesPanel } from "@/components/finance/receivables-panel";
import { StandingPanel } from "@/components/finance/standing-panel";
import { ModulePage } from "@/components/modules/module-page";
import { manilaDateKey } from "@/lib/booking-slots";
import { getActiveBusiness } from "@/lib/dal/businesses";
import { financeActor, listEventsFor } from "@/lib/dal/finance";
import { listAccountSummaries, listCounts } from "@/lib/dal/finance-accounts";
import { listBills, listPayees, listUnbilledReceipts } from "@/lib/dal/finance-bills";
import {
  listCustomerOptions,
  listInvoiceNumbers,
  listInvoices,
  listUninvoicedJobs,
} from "@/lib/dal/finance-invoices";
import { loadIncome, loadOverview, loadStanding } from "@/lib/dal/finance-reports";
import { isDateKey, isMonthKey, monthKeyOf } from "@/lib/finance-periods";
import { nextInvoiceNumber } from "@/lib/finance";

export default async function FinancePage(props: PageProps<"/finance">) {
  const business = await getActiveBusiness();
  if (!business) redirect("/login");

  // Guarded here as well as in the sidebar, so the route stays locked when it
  // is reached by URL.
  if (!business.modules.includes("finance")) {
    return <ModulePage moduleKey="finance" />;
  }

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

  // Every tab shows the attention counts, which need the accounts, bills,
  // invoices and the records not yet entered.
  const [accounts, counts, bills, invoices, receipts, jobs] = await Promise.all([
    listAccountSummaries(today),
    listCounts(),
    listBills(today),
    listInvoices(today),
    has("suppliers") ? listUnbilledReceipts() : Promise.resolve([]),
    has("quotes") ? listUninvoicedJobs() : Promise.resolve([]),
  ]);

  const alerts = {
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
    const { income, firstMonth, accountNames } = await loadIncome(month);
    panel = <IncomePanel income={income} currentMonth={currentMonth} firstMonth={firstMonth} accountNames={accountNames} />;
  } else if (tab === "standing") {
    const asOf = typeof params.asOf === "string" && isDateKey(params.asOf) && params.asOf <= today ? params.asOf : today;
    const [{ standing, attention, accountNames }, ownerItems] = await Promise.all([
      loadStanding(asOf),
      asOf === today
        ? loadOverview(business).then((overview) =>
            overview.alerts.filter((alert) => alert.key === "follow-up" || alert.key === "uninvoiced" || alert.key === "unbilled"),
          )
        : Promise.resolve([]),
    ]);
    panel = <StandingPanel standing={standing} attention={attention} ownerItems={ownerItems} today={today} accountNames={accountNames} />;
  } else if (tab === "accounts") {
    panel = (
      <AccountsPanel
        accounts={accounts}
        counts={counts}
        openRef={typeof params.account === "string" ? params.account : null}
        isAdmin={isAdmin}
        today={today}
      />
    );
  } else if (tab === "receivables") {
    const [customers, numbers, history] = await Promise.all([
      has("crm") ? listCustomerOptions() : Promise.resolve([]),
      listInvoiceNumbers(),
      openInvoice ? listEventsFor(openInvoice) : Promise.resolve([]),
    ]);
    panel = (
      <ReceivablesPanel
        invoices={invoices}
        accounts={accounts}
        customers={customers}
        jobs={jobs}
        suggestedNumber={nextInvoiceNumber(numbers)}
        openRef={openInvoice}
        history={history}
        isAdmin={isAdmin}
        today={today}
        userName={actor.name}
      />
    );
  } else {
    const payees = has("suppliers") ? await listPayees() : [];
    panel = (
      <PayablesPanel
        bills={bills}
        accounts={accounts}
        payees={payees}
        receipts={receipts}
        openRef={typeof params.bill === "string" ? params.bill : null}
        isAdmin={isAdmin}
        today={today}
        userName={actor.name}
      />
    );
  }

  return (
    <FinanceWorkspace tab={tab} isAdmin={isAdmin} businessName={business.name} alerts={alerts}>
      {panel}
    </FinanceWorkspace>
  );
}
