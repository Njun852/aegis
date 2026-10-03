import { descriptionKey } from "@/lib/quotations";
import type { SupplierItem, SupplierSummary } from "@/types";

/**
 * Pure supplier rules: how names and wordings are matched, how the price book
 * is grouped for comparison, how a cost's age and change read. Nothing here
 * touches the database, so the screens and the check script agree.
 */

/** "Davao Auto Parts, Inc." and "davao auto parts inc" are one supplier. */
export function supplierNameKey(name: string): string {
  return descriptionKey(name);
}

/** Inventory's placeholders for "nobody wrote it down", never offered as suppliers. */
export const UNRECORDED_SUPPLIERS = new Set(["", "not recorded", "unknown", "n a", "none"]);

/** A cost older than this is flagged as worth re-confirming before quoting from it. */
export const STALE_COST_DAYS = 90;

export function changePercent(previousCents: number | null, costCents: number): number | null {
  if (previousCents === null || previousCents === 0) return null;
  return Math.round(((costCents - previousCents) / previousCents) * 100);
}

/** "today", "3 days old", "2 weeks old", "5 months old". */
export function describeAge(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "1 day old";
  if (days < 14) return `${days} days old`;
  if (days < 60) return `${Math.round(days / 7)} weeks old`;
  if (days < 730) return `${Math.round(days / 30)} months old`;
  return `${Math.round(days / 365)} years old`;
}

export function wholeDaysBetween(earlier: Date, later: Date): number {
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / 86_400_000));
}

/**
 * What one part costs across suppliers. Entries linked to the same Inventory
 * item compare with each other; an unlinked entry compares with others of the
 * same wording, since nobody has said which item it is.
 */
export interface PartComparison {
  /** `sku:SKU-1001` or `key:turbo cleaning`. */
  id: string;
  label: string;
  sku: string | null;
  /** Cheapest first. */
  entries: SupplierItem[];
  cheapestCents: number;
  /** The preferred supplier's entry, or null when none is marked. */
  preferred: SupplierItem | null;
}

export function comparisonId(item: Pick<SupplierItem, "sku" | "description">): string {
  return item.sku ? `sku:${item.sku}` : `key:${descriptionKey(item.description)}`;
}

export function compareParts(items: SupplierItem[]): PartComparison[] {
  const groups = new Map<string, SupplierItem[]>();
  for (const item of items) {
    const id = comparisonId(item);
    groups.set(id, [...(groups.get(id) ?? []), item]);
  }
  return [...groups.entries()]
    .map(([id, entries]) => {
      const sorted = [...entries].sort((a, b) => a.costCents - b.costCents || a.supplierName.localeCompare(b.supplierName));
      return {
        id,
        label: sorted[0].itemName ?? sorted[0].description,
        sku: sorted[0].sku,
        entries: sorted,
        cheapestCents: sorted[0].costCents,
        preferred: sorted.find((entry) => entry.preferred) ?? null,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * The cost to plan with: the preferred supplier's when one is marked,
 * otherwise the most recently confirmed. Not simply the cheapest, which may be
 * a year old or from a supplier the shop has stopped using.
 */
export function planningCost(comparison: Pick<PartComparison, "entries" | "preferred">): SupplierItem | null {
  if (comparison.preferred) return comparison.preferred;
  return (
    [...comparison.entries].sort((a, b) => b.costUpdatedAt.localeCompare(a.costUpdatedAt))[0] ?? null
  );
}

export function filterSuppliers(suppliers: SupplierSummary[], search: string): SupplierSummary[] {
  const term = search.trim().toLowerCase();
  if (!term) return suppliers;
  return suppliers.filter((supplier) =>
    [supplier.name, supplier.contactPerson, supplier.phone, supplier.email]
      .some((value) => value.toLowerCase().includes(term)),
  );
}

export function filterComparisons(groups: PartComparison[], search: string): PartComparison[] {
  const term = search.trim().toLowerCase();
  if (!term) return groups;
  return groups.filter(
    (group) =>
      group.label.toLowerCase().includes(term) ||
      (group.sku ?? "").toLowerCase().includes(term) ||
      group.entries.some(
        (entry) =>
          entry.description.toLowerCase().includes(term) || entry.supplierName.toLowerCase().includes(term),
      ),
  );
}
