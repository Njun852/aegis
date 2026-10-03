/**
 * Indexes the Suppliers module relies on, kept in one place so
 * `scripts/seed.ts` (a fresh database) and `scripts/supplier-check.ts` (an
 * existing one) create the same set.
 */
export interface SupplierIndex {
  collection: "suppliers" | "supplierItems" | "supplierCosts";
  keys: Record<string, 1 | -1>;
  options?: { unique?: boolean };
}

export const SUPPLIER_INDEXES: SupplierIndex[] = [
  { collection: "suppliers", keys: { businessId: 1, ref: 1 }, options: { unique: true } },
  // Two records for one supplier would split its price history in half.
  { collection: "suppliers", keys: { businessId: 1, nameKey: 1 }, options: { unique: true } },
  { collection: "supplierItems", keys: { businessId: 1, ref: 1 }, options: { unique: true } },
  // One entry per wording per supplier, so a receipt updates it rather than adding another.
  { collection: "supplierItems", keys: { businessId: 1, supplierRef: 1, key: 1 }, options: { unique: true } },
  { collection: "supplierItems", keys: { businessId: 1, sku: 1 } },
  { collection: "supplierCosts", keys: { businessId: 1, at: -1 } },
  { collection: "supplierCosts", keys: { businessId: 1, itemRef: 1, at: -1 } },
];
