import { redirect } from "next/navigation";
import { InventoryWorkspace } from "@/components/inventory/inventory-workspace";
import { ModulePage } from "@/components/modules/module-page";
import { getActiveBusiness } from "@/lib/dal/businesses";
import { listInventory, listMoves } from "@/lib/dal/inventory";

export default async function InventoryPage() {
  const business = await getActiveBusiness();
  if (!business) redirect("/login");

  // A business without the module gets the locked explainer, so the route is
  // guarded even when it is reached by URL rather than the sidebar.
  if (!business.modules.includes("inventory")) {
    return <ModulePage moduleKey="inventory" />;
  }

  const [items, moves] = await Promise.all([listInventory(), listMoves()]);

  return (
    <InventoryWorkspace
      items={items}
      moves={moves}
      businessName={business.name}
      todayIso={new Date().toISOString()}
    />
  );
}
