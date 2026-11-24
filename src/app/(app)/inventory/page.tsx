import { redirect } from "next/navigation";
import { InventoryWorkspace } from "@/components/inventory/inventory-workspace";
import { ModulePage } from "@/components/modules/module-page";
import { getActiveBusiness } from "@/lib/dal/businesses";
import { listBatches, listInventory, listMoves } from "@/lib/dal/inventory";
import { listPartsUsedOnJobs } from "@/lib/dal/job-orders";

export default async function InventoryPage() {
  const business = await getActiveBusiness();
  if (!business) redirect("/login");

  // A business without the module gets the locked explainer, so the route is
  // guarded even when it is reached by URL rather than the sidebar.
  if (!business.modules.includes("inventory")) {
    return <ModulePage moduleKey="inventory" />;
  }

  // Inventory first: it converts any stock still without batches, which the
  // batch list then includes.
  const items = await listInventory();
  // Parts used on jobs come from the job orders, which name the customer and car.
  const [moves, batches, jobUses] = await Promise.all([
    listMoves(),
    listBatches(),
    business.modules.includes("quotes") ? listPartsUsedOnJobs() : Promise.resolve([]),
  ]);

  return (
    <InventoryWorkspace
      items={items}
      moves={moves}
      batches={batches}
      jobUses={jobUses}
      todayIso={new Date().toISOString()}
    />
  );
}
