import "server-only";

import { descriptionKey } from "@/lib/quotations";
import { compareParts, planningCost } from "@/lib/suppliers";
import { listInventory } from "./inventory";
import { listSupplierItems } from "./suppliers";
import type { Business, QuoteCostSource } from "@/types";

/**
 * What every known part costs right now, for the quotation editor and photo
 * drafts. Built from the modules the business has:
 *
 *  - **Inventory**: a part with stock on hand costs what its oldest batch
 *    cost, because stock is used oldest first and that is what the job takes.
 *  - **Suppliers**: otherwise, the supplier planning cost (the preferred
 *    supplier's, else the most recently confirmed), never simply the cheapest.
 *
 * Each source carries every wording the part is known by (the Inventory name
 * and each supplier's), so "Inj. washer" on one receipt and "Injector washer"
 * in Inventory find the same cost. Read once per editor load; nothing here
 * is sent to the browser beyond the costs themselves.
 */
export async function listCostSources(business: Business): Promise<QuoteCostSource[]> {
  const inventoryOn = business.modules.includes("inventory");
  const suppliersOn = business.modules.includes("suppliers");
  if (!inventoryOn && !suppliersOn) return [];

  const [stock, supplierItems] = await Promise.all([
    inventoryOn ? listInventory() : Promise.resolve([]),
    suppliersOn ? listSupplierItems() : Promise.resolve([]),
  ]);
  const groups = compareParts(supplierItems);
  const sources: QuoteCostSource[] = [];
  const stockSkus = new Set<string>();

  for (const item of stock) {
    if (item.onHand <= 0 || item.nextCostCents === null) continue;
    stockSkus.add(item.sku);
    const supplierWordings = groups
      .filter((group) => group.sku === item.sku)
      .flatMap((group) => group.entries.map((entry) => descriptionKey(entry.description)));
    sources.push({
      keys: unique([descriptionKey(item.name), ...supplierWordings]),
      label: item.name,
      sku: item.sku,
      unit: item.unit,
      costCents: item.nextCostCents,
      kind: "stock",
      note: `Oldest batch in stock (${item.onHand} on hand)`,
    });
  }

  for (const group of groups) {
    if (group.sku && stockSkus.has(group.sku)) continue; // Stock on hand wins.
    const planning = planningCost(group);
    if (!planning) continue;
    sources.push({
      keys: unique([
        ...group.entries.map((entry) => descriptionKey(entry.description)),
        ...(planning.itemName ? [descriptionKey(planning.itemName)] : []),
      ]),
      label: group.label,
      sku: group.sku,
      unit: planning.unit,
      costCents: planning.costCents,
      kind: "supplier",
      note: `${planning.supplierName} · ${planning.costDay}`,
    });
  }
  return sources;
}

function unique(keys: string[]): string[] {
  return [...new Set(keys.filter(Boolean))];
}
