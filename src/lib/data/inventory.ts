import type {
  InventoryPeriod,
  InventoryStatus,
  InventoryStatusStyle,
  StockMoveKind,
  StockMoveReason,
  StockMoveReasonMeta,
} from "@/types";

export const INVENTORY_STATUSES: InventoryStatus[] = [
  "In stock",
  "Low stock",
  "Out of stock",
];

export const INVENTORY_STATUS_STYLES: Record<
  InventoryStatus,
  InventoryStatusStyle
> = {
  "In stock": {
    tone: "positive",
    dot: "var(--status-positive)",
    bar: "var(--status-positive)",
  },
  "Low stock": {
    tone: "warning",
    dot: "var(--status-warning)",
    bar: "var(--amber-400)",
  },
  "Out of stock": {
    tone: "negative",
    dot: "var(--status-negative)",
    bar: "var(--status-negative)",
  },
};

export const INVENTORY_PERIODS: InventoryPeriod[] = [
  "Last 7 days",
  "This month",
  "Last 90 days",
];

export const DEFAULT_INVENTORY_PERIOD: InventoryPeriod = "Last 7 days";

/**
 * Every reason a stock level can change, and what each one means for the books.
 * The screens read their labels from here rather than hard-coding them, so a
 * reason's wording and its accounting stay in one place.
 */
export const MOVE_REASONS: Record<StockMoveReason, StockMoveReasonMeta> = {
  "Goods received": {
    kind: "in",
    transaction: true,
    side: "cost",
    ledger: "Purchase",
    moneyTitle: "Purchase value",
    priceLabel: "Unit cost paid",
    totalLabel: "Total cost",
    note: "Recorded against this supplier as a purchase at cost.",
  },
  "Customer return": {
    kind: "in",
    transaction: true,
    side: "cost",
    ledger: "Credit",
    moneyTitle: "Return value",
    priceLabel: "Unit credit",
    totalLabel: "Total credit",
    note: "Recorded as a credit back to the customer account.",
  },
  "Transfer in": {
    kind: "in",
    transaction: false,
    note: "Internal move between locations — stock only, nothing is posted.",
  },
  "Cycle count correction": {
    kind: "in",
    transaction: false,
    note: "Count adjustment — stock only, nothing is posted.",
  },
  "Picked for booking": {
    kind: "out",
    transaction: true,
    side: "price",
    ledger: "Revenue",
    moneyTitle: "Billed to customer",
    priceLabel: "Unit price charged",
    totalLabel: "Total billed",
    note: "Posts to the revenue ledger against the booking reference.",
  },
  "Returned to supplier": {
    kind: "out",
    transaction: true,
    side: "cost",
    ledger: "Credit",
    moneyTitle: "Supplier credit",
    priceLabel: "Unit cost credited",
    totalLabel: "Total credit",
    note: "Recorded as a credit against the supplier invoice.",
  },
  "Damaged / write-off": {
    kind: "out",
    transaction: true,
    side: "cost",
    ledger: "Write-off",
    moneyTitle: "Loss value",
    priceLabel: "Unit cost written off",
    totalLabel: "Total loss",
    note: "Recorded as shrinkage at cost.",
  },
  "Transfer out": {
    kind: "out",
    transaction: false,
    note: "Internal move between locations — stock only, nothing is posted.",
  },
};

export interface MoveReasonChip {
  reason: StockMoveReason;
  /** The chip names the kind of move rather than repeating the reason. */
  label: string;
  icon: string;
}

/**
 * The two choices the move dialog offers per direction: is money involved, or
 * is this stock shuffling between locations? The remaining reasons in
 * MOVE_REASONS are history-only until the dialog grows a fuller picker.
 */
export const MOVE_REASON_CHIPS: Record<StockMoveKind, MoveReasonChip[]> = {
  in: [
    { reason: "Goods received", label: "Business transaction", icon: "wallet" },
    { reason: "Transfer in", label: "Internal move", icon: "arrow-left-right" },
  ],
  out: [
    {
      reason: "Picked for booking",
      label: "Business transaction",
      icon: "wallet",
    },
    { reason: "Transfer out", label: "Internal move", icon: "arrow-left-right" },
  ],
};

export const DEFAULT_MOVE_REASON: Record<StockMoveKind, StockMoveReason> = {
  in: "Goods received",
  out: "Picked for booking",
};

/**
 * SEED FIXTURE ONLY — `scripts/seed.ts` turns these into documents on a fresh
 * database. `onHand` is the level as it stands today, not an opening balance:
 * the movements seeded below are history that has already been applied. No
 * screen imports this.
 */
export interface InventorySeed {
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
}

export const INVENTORY_SEEDS: InventorySeed[] = [
  {
    sku: "SKU-4401",
    name: "Brake pad set — front axle",
    category: "Brake parts",
    icon: "truck",
    onHand: 124,
    target: 160,
    reorder: 40,
    unit: "sets",
    location: "Workshop · W3",
    supplier: "Alpine Parts",
    unitCostCents: 11800,
  },
  {
    sku: "SKU-4418",
    name: "Engine oil 15W-40 — 20L",
    category: "Fluids",
    icon: "package",
    onHand: 148,
    target: 200,
    reorder: 50,
    unit: "drums",
    location: "Store · S1",
    supplier: "Nordic Lubricants",
    unitCostCents: 6400,
  },
  {
    sku: "SKU-4502",
    name: "Oil filter — spin-on",
    category: "Filters",
    icon: "layers",
    onHand: 38,
    target: 240,
    reorder: 60,
    unit: "units",
    location: "Store · S2",
    supplier: "Meridian Supply",
    unitCostCents: 890,
  },
  {
    sku: "SKU-4530",
    name: "Cabin air filter",
    category: "Filters",
    icon: "layers",
    onHand: 0,
    target: 120,
    reorder: 30,
    unit: "units",
    location: "Store · S2",
    supplier: "Meridian Supply",
    unitCostCents: 1240,
  },
  {
    sku: "SKU-4610",
    name: "Wiper blade — 24in",
    category: "Consumables",
    icon: "package",
    onHand: 62,
    target: 150,
    reorder: 40,
    unit: "pairs",
    location: "Store · S4",
    supplier: "Coastline Motor Factors",
    unitCostCents: 960,
  },
  {
    sku: "SKU-4622",
    name: "Coolant — OAT premix 5L",
    category: "Fluids",
    icon: "package",
    onHand: 26,
    target: 90,
    reorder: 30,
    unit: "bottles",
    location: "Store · S1",
    supplier: "Nordic Lubricants",
    unitCostCents: 1875,
  },
  {
    sku: "SKU-4705",
    name: "Tyre — 225/45 R17",
    category: "Tyres",
    icon: "truck",
    onHand: 44,
    target: 80,
    reorder: 20,
    unit: "units",
    location: "Tyre Bay · T1",
    supplier: "Delta Tyre Group",
    unitCostCents: 9600,
  },
  {
    sku: "SKU-4711",
    name: "Diagnostic tablet — ECU reader",
    category: "Equipment",
    icon: "sparkles",
    onHand: 6,
    target: 8,
    reorder: 2,
    unit: "units",
    location: "Workshop · W1",
    supplier: "Vantage Tech",
    unitCostCents: 48000,
  },
  {
    sku: "SKU-4802",
    name: "Battery — 12V 74Ah AGM",
    category: "Electrical",
    icon: "sparkles",
    onHand: 18,
    target: 40,
    reorder: 12,
    unit: "units",
    location: "Store · S3",
    supplier: "Alpine Parts",
    unitCostCents: 14250,
  },
  {
    sku: "SKU-4815",
    name: "Nitrile glove — box of 100",
    category: "Consumables",
    icon: "shield-check",
    onHand: 9,
    target: 60,
    reorder: 15,
    unit: "boxes",
    location: "Store · S4",
    supplier: "Coastline Motor Factors",
    unitCostCents: 1130,
  },
];

/** `dayOffset` is days back from the day the seed runs; times are wall-clock. */
export interface StockMoveSeed {
  sku: string;
  kind: StockMoveKind;
  quantity: number;
  reason: StockMoveReason;
  documentRef: string;
  party: string;
  unitAmountCents: number;
  dayOffset: number;
  hour: number;
  minute: number;
}

export const STOCK_MOVE_SEEDS: StockMoveSeed[] = [
  {
    sku: "SKU-4401",
    kind: "out",
    quantity: 8,
    reason: "Picked for booking",
    documentRef: "BK-8242",
    party: "Calder & Sons",
    unitAmountCents: 17110,
    dayOffset: -1,
    hour: 11,
    minute: 20,
  },
  {
    sku: "SKU-4610",
    kind: "out",
    quantity: 10,
    reason: "Picked for booking",
    documentRef: "BK-8250",
    party: "Salas Produce",
    unitAmountCents: 1392,
    dayOffset: -1,
    hour: 15,
    minute: 25,
  },
  {
    sku: "SKU-4502",
    kind: "out",
    quantity: 24,
    reason: "Picked for booking",
    documentRef: "BK-8241",
    party: "Kestrel Haulage",
    unitAmountCents: 1290,
    dayOffset: -2,
    hour: 9,
    minute: 40,
  },
  {
    sku: "SKU-4815",
    kind: "out",
    quantity: 6,
    reason: "Transfer out",
    documentRef: "",
    party: "",
    unitAmountCents: 0,
    dayOffset: -2,
    hour: 16,
    minute: 40,
  },
  {
    sku: "SKU-4530",
    kind: "out",
    quantity: 12,
    reason: "Picked for booking",
    documentRef: "BK-8244",
    party: "Salvo Industries",
    unitAmountCents: 1798,
    dayOffset: -3,
    hour: 10,
    minute: 5,
  },
  {
    sku: "SKU-4705",
    kind: "in",
    quantity: 8,
    reason: "Customer return",
    documentRef: "CR-2041",
    party: "Meridian Retail",
    unitAmountCents: 13920,
    dayOffset: -3,
    hour: 11,
    minute: 45,
  },
  {
    sku: "SKU-4401",
    kind: "in",
    quantity: 40,
    reason: "Goods received",
    documentRef: "DN-20418",
    party: "Alpine Parts",
    unitAmountCents: 11800,
    dayOffset: -4,
    hour: 8,
    minute: 15,
  },
  {
    sku: "SKU-4815",
    kind: "out",
    quantity: 3,
    reason: "Damaged / write-off",
    documentRef: "",
    party: "Coastline Motor Factors",
    unitAmountCents: 1130,
    dayOffset: -4,
    hour: 17,
    minute: 10,
  },
  {
    sku: "SKU-4502",
    kind: "in",
    quantity: 30,
    reason: "Transfer in",
    documentRef: "",
    party: "",
    unitAmountCents: 0,
    dayOffset: -5,
    hour: 8,
    minute: 30,
  },
  {
    sku: "SKU-4705",
    kind: "out",
    quantity: 4,
    reason: "Picked for booking",
    documentRef: "BK-8249",
    party: "Delta Freight",
    unitAmountCents: 13920,
    dayOffset: -5,
    hour: 14,
    minute: 10,
  },
  {
    sku: "SKU-4622",
    kind: "in",
    quantity: 20,
    reason: "Goods received",
    documentRef: "DN-20402",
    party: "Nordic Lubricants",
    unitAmountCents: 1875,
    dayOffset: -6,
    hour: 7,
    minute: 50,
  },
  {
    sku: "SKU-4401",
    kind: "out",
    quantity: 4,
    reason: "Returned to supplier",
    documentRef: "RT-9012",
    party: "Alpine Parts",
    unitAmountCents: 11800,
    dayOffset: -6,
    hour: 16,
    minute: 0,
  },
  {
    sku: "SKU-4802",
    kind: "in",
    quantity: 12,
    reason: "Goods received",
    documentRef: "DN-20431",
    party: "Alpine Parts",
    unitAmountCents: 14250,
    dayOffset: -7,
    hour: 9,
    minute: 5,
  },
  {
    sku: "SKU-4711",
    kind: "in",
    quantity: 1,
    reason: "Cycle count correction",
    documentRef: "",
    party: "",
    unitAmountCents: 0,
    dayOffset: -8,
    hour: 13,
    minute: 30,
  },
];
