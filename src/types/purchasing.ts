/**
 * A purchase order is record-only: AEGIS keeps track of what was ordered, from
 * whom and when, but the order itself goes out by phone, Messenger or in
 * person. Nothing here sends anything to a supplier.
 */
export type PurchaseOrderStatus = "Draft" | "Ordered" | "Partly received" | "Received" | "Cancelled";

export type PurchaseOrderStatusFilter = "All" | "Open" | PurchaseOrderStatus;

export type OrderChannel = "Phone" | "Messenger" | "In person" | "Email" | "Other";

export interface PurchaseOrderLine {
  /** Stable within the order, so receipts can point at it. */
  id: string;
  description: string;
  /** The Inventory item it restocks. Null for a new item, created on receipt. */
  sku: string | null;
  unit: string;
  /** Whole units: Inventory counts in whole units. */
  qtyOrdered: number;
  qtyReceived: number;
  /** What the supplier was expected to charge per unit, from the price book or as typed. */
  expectedCostCents: number;
}

export interface PurchaseOrderDocument {
  businessId: string;
  ref: string;
  supplierRef: string;
  status: PurchaseOrderStatus;
  lines: PurchaseOrderLine[];
  notes: string;
  orderedAt?: Date;
  orderedVia?: OrderChannel;
  /** "2026-10-08", when the supplier said it would arrive. */
  expectedDate?: string;
  /** True when the rest was given up on after a partial delivery. */
  closedShort?: boolean;
  /** How the order was started, for the audit trail. */
  origin: "typed" | "low-stock";
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PurchaseOrder {
  ref: string;
  supplierRef: string;
  supplierName: string;
  status: PurchaseOrderStatus;
  lines: PurchaseOrderLine[];
  notes: string;
  /** "Oct 04, 2026" */
  orderedDay: string | null;
  orderedVia: OrderChannel | null;
  expectedDate: string | null;
  expectedDay: string | null;
  closedShort: boolean;
  origin: "typed" | "low-stock";
  /** Ordered quantity × expected cost, all lines. */
  expectedTotalCents: number;
  /** Lines still waiting on at least one unit. */
  openLines: number;
  receipts: { ref: string; day: string; receiptNo: string }[];
  /** "Oct 04, 2026" */
  createdDay: string;
  updatedAt: string;
}

export interface PurchaseOrderInput {
  supplierRef: string;
  notes: string;
  expectedDate: string;
  lines: Omit<PurchaseOrderLine, "qtyReceived">[];
}

/**
 * Goods received from a supplier, with or without a purchase order. Posting a
 * receipt puts each line into Inventory as a batch and updates the supplier's
 * price book; each line records its stock movement once posted, so posting
 * again after an interruption never adds stock twice.
 */
export type ReceiptStatus = "Posting" | "Posted";

export interface ReceiptLine {
  id: string;
  /** The order line this delivers against. */
  orderLineId: string | null;
  description: string;
  sku: string | null;
  unit: string;
  qty: number;
  unitCostCents: number;
  /** From the order line, to show what the supplier was expected to charge. */
  expectedCostCents: number | null;
  /** Set once the line is in stock. */
  moveRef: string | null;
  batchRef: string | null;
}

export interface ReceiptDocument {
  businessId: string;
  ref: string;
  supplierRef: string;
  purchaseOrderRef: string | null;
  /** The supplier's own invoice or delivery receipt number. */
  receiptNo: string;
  /** "2026-10-04" */
  receivedDate: string;
  lines: ReceiptLine[];
  status: ReceiptStatus;
  /** False when the business has no Inventory: the receipt then records costs only. */
  stocked: boolean;
  notes: string;
  photoRef?: string;
  createdBy: string;
  createdAt: Date;
  postedAt?: Date;
  /** Held while one request posts the receipt, so a second cannot post it at the same time. */
  lockedUntil?: Date;
}

export interface Receipt {
  ref: string;
  supplierRef: string;
  supplierName: string;
  purchaseOrderRef: string | null;
  receiptNo: string;
  receivedDate: string;
  receivedDay: string;
  lines: ReceiptLine[];
  status: ReceiptStatus;
  stocked: boolean;
  notes: string;
  totalCents: number;
  /** Actual minus expected, over lines that had an expected cost. */
  varianceCents: number;
}

export interface ReceiptInput {
  supplierRef: string;
  purchaseOrderRef: string | null;
  receiptNo: string;
  receivedDate: string;
  notes: string;
  lines: Omit<ReceiptLine, "moveRef" | "batchRef">[];
  /** The person saw the warning that this receipt number was already recorded, and went ahead. */
  confirmDuplicate?: boolean;
}

/** A low-stock item and where it would be ordered from, for drafting orders. */
export interface RestockSuggestion {
  sku: string;
  name: string;
  unit: string;
  onHand: number;
  target: number;
  reorder: number;
  /** Up to the target, less what is already on open orders. */
  qty: number;
  supplierRef: string | null;
  supplierName: string | null;
  description: string;
  costCents: number | null;
  /** Why it is not offered, when it is not. */
  skipped: string | null;
}
