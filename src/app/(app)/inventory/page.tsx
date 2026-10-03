import { redirect } from "next/navigation";
import { InventoryWorkspace } from "@/components/inventory/inventory-workspace";
import { ModulePage } from "@/components/modules/module-page";
import { getActiveBusiness } from "@/lib/dal/businesses";
import { listBatches, listInventory, listMoves } from "@/lib/dal/inventory";

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
  const [moves, batches] = await Promise.all([listMoves(), listBatches()]);

  return (
    <InventoryWorkspace
      items={items}
      moves={moves}
      batches={batches}
      businessName={business.name}
      todayIso={new Date().toISOString()}
    />
  );
}
