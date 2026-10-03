import { redirect } from "next/navigation";
import { ModulePage } from "@/components/modules/module-page";
import { SuppliersWorkspace, type SuppliersTab } from "@/components/suppliers/suppliers-workspace";
import { getActiveBusiness } from "@/lib/dal/businesses";
import {
  listCostChanges,
  listImportCandidates,
  listInventoryOptions,
  listSupplierItems,
  listSupplierSummaries,
} from "@/lib/dal/suppliers";

const TABS: SuppliersTab[] = ["suppliers", "prices", "changes"];

export default async function SuppliersPage(props: PageProps<"/suppliers">) {
  const business = await getActiveBusiness();
  if (!business) redirect("/login");

  // Guarded here as well as in the sidebar, so the route stays locked when it
  // is reached by URL.
  if (!business.modules.includes("suppliers")) {
    return <ModulePage moduleKey="suppliers" />;
  }

  const params = await props.searchParams;
  const tab = TABS.find((entry) => entry === params.tab) ?? "suppliers";
  const openRef = typeof params.supplier === "string" ? params.supplier : null;
  const inventoryEnabled = business.modules.includes("inventory");
  const now = new Date();

  const [suppliers, items, changes, inventory, candidates] = await Promise.all([
    listSupplierSummaries(),
    listSupplierItems(now),
    listCostChanges(120, now),
    inventoryEnabled ? listInventoryOptions() : Promise.resolve([]),
    inventoryEnabled ? listImportCandidates() : Promise.resolve([]),
  ]);

  return (
    <SuppliersWorkspace
      suppliers={suppliers}
      items={items}
      changes={changes}
      inventory={inventory}
      candidates={candidates}
      inventoryEnabled={inventoryEnabled}
      tab={tab}
      openRef={openRef}
      businessName={business.name}
      nowIso={now.toISOString()}
    />
  );
}
