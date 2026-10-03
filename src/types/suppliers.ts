/** A business the shop buys parts from. */
export interface Supplier {
  ref: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  /** Payment terms as agreed: "Cash", "30 days". */
  terms: string;
  /** Usual days from order to delivery. Null when nobody has said. */
  leadTimeDays: number | null;
  notes: string;
  active: boolean;
}

/** Stored shape. `businessId` is stamped on by `tenantScope`. */
export interface SupplierDocument {
  businessId: string;
  ref: string;
  name: string;
  /** Lower case, punctuation folded. One supplier per name per business. */
  nameKey: string;
  contactPerson: string;
  phone: string;
  email: string;
  terms: string;
  leadTimeDays: number | null;
  notes: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type SupplierInput = Omit<Supplier, "ref" | "active">;

/** One row of the suppliers list. */
export interface SupplierSummary extends Supplier {
  itemCount: number;
  /** "Sep 02, 2026", the most recent cost confirmed for any of their items. */
  lastCostDay: string | null;
}

/** Where a cost came from, shown beside it so staff know how much to trust it. */
export type CostSource = "typed" | "inventory" | "purchase" | "photo";

/**
 * One part as one supplier sells it, at their latest cost. The wording is the
 * supplier's own; the link to an Inventory item is made once, after which the
 * same wording on a receipt maps to that item.
 */
export interface SupplierItem {
  ref: string;
  supplierRef: string;
  supplierName: string;
  description: string;
  /** The Inventory item it is, or null until someone links it. */
  sku: string | null;
  /** The linked item's name, for display. */
  itemName: string | null;
  unit: string;
  costCents: number;
  costSource: CostSource;
  /** "Sep 02, 2026" */
  costDay: string;
  /** ISO 8601. */
  costUpdatedAt: string;
  /** Whole days since the cost was last confirmed. */
  costAgeDays: number;
  /** The supplier to buy this part from when there is a choice. */
  preferred: boolean;
}

export interface SupplierItemDocument {
  businessId: string;
  ref: string;
  supplierRef: string;
  description: string;
  /** Lower case, punctuation folded: one entry per wording per supplier. */
  key: string;
  sku: string | null;
  unit: string;
  costCents: number;
  costSource: CostSource;
  costUpdatedAt: Date;
  preferred: boolean;
  createdAt: Date;
}

export interface SupplierItemInput {
  description: string;
  sku: string | null;
  unit: string;
  costCents: number;
}

/** One cost change, kept for good: the history behind every price-book entry. */
export interface SupplierCostDocument {
  businessId: string;
  itemRef: string;
  supplierRef: string;
  sku: string | null;
  description: string;
  costCents: number;
  /** Null for an entry's first cost. */
  previousCents: number | null;
  source: CostSource;
  /** A receipt or purchase order number, when there is one. */
  documentRef: string;
  at: Date;
}

export interface SupplierCostChange {
  itemRef: string;
  supplierRef: string;
  supplierName: string;
  description: string;
  sku: string | null;
  costCents: number;
  previousCents: number | null;
  /** Rounded percentage, positive when the cost went up. Null for a first cost. */
  changePercent: number | null;
  source: CostSource;
  documentRef: string;
  /** "Sep 02, 2026" */
  day: string;
  at: string;
}

/** An Inventory supplier name with no supplier record yet, offered for import. */
export interface SupplierImportCandidate {
  name: string;
  /** Inventory items naming this supplier. */
  itemCount: number;
}

/** What the price-book pickers need from Inventory. */
export interface InventoryOption {
  sku: string;
  name: string;
  unit: string;
}
