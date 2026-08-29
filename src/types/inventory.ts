/**
 * Stock is either healthy, running down, or gone. The three states are derived
 * from `onHand` against the item's reorder point rather than stored, so a stock
 * movement can never leave the badge disagreeing with the number beside it.
 */
export type InventoryStatus = "In stock" | "Low stock" | "Out of stock";

export type InventoryStatusFilter = "All" | InventoryStatus;

/** The movement window the toolbar's period picker offers, in display order. */
export type InventoryPeriod = "Last 7 days" | "This month" | "Last 90 days";

/** Which way stock moved. Everything else about a move follows from this. */
export type StockMoveKind = "in" | "out";

export type StockMoveReason =
  | "Goods received"
  | "Customer return"
  | "Transfer in"
  | "Cycle count correction"
  | "Picked for booking"
  | "Returned to supplier"
  | "Damaged / write-off"
  | "Transfer out";

/**
 * What a reason means for the books. `transaction: false` is an internal move —
 * stock changes, no money changes hands, nothing is posted.
 *
 * `side` says which price the money is: `price` is what a customer was charged
 * (revenue), `cost` is what the stock was worth to us (a purchase, a credit or
 * a write-off). Only the revenue side reaches the ledger — see
 * `src/lib/dal/inventory.ts`.
 */
export interface StockMoveReasonMeta {
  kind: StockMoveKind;
  transaction: boolean;
  side?: "price" | "cost";
  /** Short tag shown against the money block, e.g. "Revenue". */
  ledger?: string;
  moneyTitle?: string;
  priceLabel?: string;
  totalLabel?: string;
  note: string;
}

export interface InventoryStatusStyle {
  tone: "positive" | "warning" | "negative";
  dot: string;
  /** The stock-level bar's fill, which reads lighter than the dot. */
  bar: string;
}

/**
 * An item as the screens receive it. `status`, `valueCents` and the display
 * stamp are derived on the server so every surface agrees on them.
 */
export interface InventoryItem {
  sku: string;
  businessId: string;
  name: string;
  category: string;
  icon: string;
  onHand: number;
  /** The level the item is stocked back up to. Drives the progress bar. */
  target: number;
  /** At or below this, the item counts as low. */
  reorder: number;
  /** "units", "rolls", "sets" — plural, shown beside the count. */
  unit: string;
  location: string;
  supplier: string;
  unitCostCents: number;
  /** `onHand × unitCostCents`. */
  valueCents: number;
  status: InventoryStatus;
  /** "Aug 28 · 07:15" */
  updated: string;
  /** ISO 8601, so the client can re-derive without re-formatting. */
  updatedAt: string;
}

/** Stored shape. `businessId` is stamped on by `tenantScope`. */
export interface InventoryItemDocument {
  businessId: string;
  sku: string;
  name: string;
  category: string;
  icon: string;
  onHand: number;
  target: number;
  reorder: number;
  unit: string;
  location: string;
  supplier: string;
  unitCostCents: number;
  createdAt: Date;
  updatedAt: Date;
}

/** One line of an item's movement history, as the screens receive it. */
export interface StockMove {
  ref: string;
  sku: string;
  kind: StockMoveKind;
  quantity: number;
  reason: StockMoveReason;
  /** Delivery note or booking reference, as typed. May be empty. */
  documentRef: string;
  /** Supplier or customer. Empty on internal moves. */
  party: string;
  unitAmountCents: number;
  amountCents: number;
  /** True when this move is what brought the item into existence. */
  createdItem: boolean;
  occurredAt: string;
  /** "Aug 28 · 16:40" */
  when: string;
}

export interface StockMoveDocument {
  businessId: string;
  ref: string;
  sku: string;
  kind: StockMoveKind;
  quantity: number;
  reason: StockMoveReason;
  documentRef: string;
  party: string;
  unitAmountCents: number;
  amountCents: number;
  createdItem: boolean;
  occurredAt: Date;
  createdAt: Date;
}

/** What the stock-move form submits. The ref and the SKU are server-assigned. */
export interface StockMoveInput {
  /** An item name or SKU as typed. A stock in may name an item that is new. */
  name: string;
  kind: StockMoveKind;
  quantity: number;
  reason: StockMoveReason;
  documentRef: string;
  party: string;
  unitAmountCents: number;
}
