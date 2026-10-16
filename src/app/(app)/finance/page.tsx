import { redirect } from "next/navigation";
import { FinanceWorkspace } from "@/components/finance/finance-workspace";
import { ModulePage } from "@/components/modules/module-page";
import { manilaDateKey } from "@/lib/booking-slots";
import { getActiveBusiness } from "@/lib/dal/businesses";
import { listAccountSummaries, listCounts } from "@/lib/dal/finance-accounts";
import { verifySession } from "@/lib/dal/session";

export default async function FinancePage(props: PageProps<"/finance">) {
  const business = await getActiveBusiness();
  if (!business) redirect("/login");

  // Guarded here as well as in the sidebar, so the route stays locked when it
  // is reached by URL.
  if (!business.modules.includes("finance")) {
    return <ModulePage moduleKey="finance" />;
  }

  const params = await props.searchParams;
  const openRef = typeof params.account === "string" ? params.account : null;
  const { role } = await verifySession();
  const today = manilaDateKey(new Date());

  const [accounts, counts] = await Promise.all([listAccountSummaries(today), listCounts()]);

  return (
    <FinanceWorkspace
      accounts={accounts}
      counts={counts}
      openRef={openRef}
      isAdmin={role === "aegis_admin"}
      businessName={business.name}
      today={today}
    />
  );
}
