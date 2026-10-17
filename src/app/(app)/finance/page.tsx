import { redirect } from "next/navigation";
import { AccountsPanel } from "@/components/finance/accounts-panel";
import { FinanceWorkspace, type FinanceTab } from "@/components/finance/finance-workspace";
import { PayablesPanel } from "@/components/finance/payables-panel";
import { ModulePage } from "@/components/modules/module-page";
import { manilaDateKey } from "@/lib/booking-slots";
import { getActiveBusiness } from "@/lib/dal/businesses";
import { financeActor } from "@/lib/dal/finance";
import { listAccountSummaries, listCounts } from "@/lib/dal/finance-accounts";
import { listBills, listPayees, listUnbilledReceipts } from "@/lib/dal/finance-bills";

const TABS: FinanceTab[] = ["accounts", "payables"];

export default async function FinancePage(props: PageProps<"/finance">) {
  const business = await getActiveBusiness();
  if (!business) redirect("/login");

  // Guarded here as well as in the sidebar, so the route stays locked when it
  // is reached by URL.
  if (!business.modules.includes("finance")) {
    return <ModulePage moduleKey="finance" />;
  }

  const params = await props.searchParams;
  const tab = TABS.find((entry) => entry === params.tab) ?? "accounts";
  const actor = await financeActor();
  const isAdmin = actor.role === "aegis_admin";
  const today = manilaDateKey(new Date());
  const suppliers = business.modules.includes("suppliers");

  // Both tabs need the accounts (Payables pays from them) and the badge counts.
  const [accounts, counts, bills, payees, receipts] = await Promise.all([
    listAccountSummaries(today),
    listCounts(),
    listBills(today),
    tab === "payables" && suppliers ? listPayees() : Promise.resolve([]),
    suppliers ? listUnbilledReceipts() : Promise.resolve([]),
  ]);

  const alerts = {
    accounts: counts.filter((count) => count.status === "open").length,
    payables:
      bills.filter((bill) => bill.group === "overdue" || bill.group === "critical-overdue").length + receipts.length,
  };

  return (
    <FinanceWorkspace tab={tab} businessName={business.name} alerts={alerts}>
      {tab === "accounts" ? (
        <AccountsPanel
          accounts={accounts}
          counts={counts}
          openRef={typeof params.account === "string" ? params.account : null}
          isAdmin={isAdmin}
          today={today}
        />
      ) : (
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
      )}
    </FinanceWorkspace>
  );
}
