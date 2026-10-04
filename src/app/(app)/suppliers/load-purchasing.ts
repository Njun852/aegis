import "server-only";

import { redirect } from "next/navigation";
import { getActiveBusiness } from "@/lib/dal/businesses";
import { listInventoryOptions, listSupplierItems, listSupplierSummaries } from "@/lib/dal/suppliers";
import { manilaDateKey } from "@/lib/quotations";

/** What the order editor and the receive form share: suppliers, their price books, Inventory items. */
export async function loadPurchasing() {
  const business = await getActiveBusiness();
  if (!business) redirect("/login");
  if (!business.modules.includes("suppliers")) return { business, data: null };

  const inventoryEnabled = business.modules.includes("inventory");
  const [suppliers, supplierItems, inventory] = await Promise.all([
    listSupplierSummaries(),
    listSupplierItems(),
    inventoryEnabled ? listInventoryOptions() : Promise.resolve([]),
  ]);
  return {
    business,
    data: { suppliers, supplierItems, inventory, inventoryEnabled, todayKey: manilaDateKey(new Date()) },
  };
}
