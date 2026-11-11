import {
  INVENTORY_STATUS_STYLES,
  MOVE_REASONS,
} from "@/lib/data/inventory";
import type {
  InventoryItem,
  InventoryPeriod,
  InventoryStatus,
  InventoryStatusFilter,
  PoStock,
  StockBatch,
  StockMove,
  StockMoveReason,
} from "@/types";

/**
 * Pure helpers over inventory the server already loaded and tenant-scoped.
 * Database access lives in `src/lib/dal/inventory.ts` — nothing here touches
 * Mongo, so these are safe in client components.
 */

/**
 * Status is always derived, never stored. Deriving it means a stock movement
 * cannot leave the badge saying "In stock" next to a count of zero.
 */
export function statusFor(level: {
  onHand: number;
  reorder: number;
}): InventoryStatus {
  if (level.onHand <= 0) return "Out of stock";
  if (level.onHand <= level.reorder) return "Low stock";
  return "In stock";
}

export function getStatusStyle(status: InventoryStatus) {
  return INVENTORY_STATUS_STYLES[status];
}

/** Longest PO No. accepted. Booklet numbers are short ("37345", "37339-40"). */
export const PO_NUMBER_MAX = 30;

/**
 * Goods bought from a supplier must name the PO they were bought on, so every
 * batch in stock can be traced back to the PO booklet. Returns, transfers and
 * count corrections were never bought, so they carry none.
 */
export function requiresPoNumber(reason: StockMoveReason): boolean {
  return reason === "Goods received";
}

/** The PO No. as stored: trimmed, inner spaces folded. */
export function cleanPoNumber(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/** Why a PO No. cannot be accepted, or null when it can. */
export function poNumberProblem(text: string): string | null {
  const value = cleanPoNumber(text);
  if (!value) return "Enter the PO No. these goods were bought on.";
  if (value.length > PO_NUMBER_MAX) return `The PO No. can be at most ${PO_NUMBER_MAX} characters.`;
  return null;
}

/**
 * Folds open batches, oldest first, into units left per PO No. Two deliveries
 * on the same PO become one entry, kept where the older one stood, so the
 * first entry is always the PO the next unit used comes from.
 */
export function groupPoStock(lots: PoStock[]): PoStock[] {
  const grouped: PoStock[] = [];
  for (const lot of lots) {
    if (lot.remaining <= 0) continue;
    const poNumber = cleanPoNumber(lot.poNumber ?? "");
    const entry = grouped.find((existing) => existing.poNumber === poNumber);
    if (entry) entry.remaining += lot.remaining;
    else grouped.push({ poNumber, remaining: lot.remaining });
  }
  return grouped;
}

/**
 * What the PO No. column says. `label` is the PO used next; `more` counts
 * the other POs (and stock with none) still on the shelf; `detail` lists them
 * all with what is left of each, for the tooltip.
 */
export function poColumn(item: Pick<InventoryItem, "poStock" | "unit">): {
  label: string;
  more: number;
  missing: boolean;
  detail: string;
} {
  const [first, ...rest] = item.poStock;
  if (!first) return { label: "—", more: 0, missing: false, detail: "Nothing on hand" };
  const name = (entry: PoStock) => (entry.poNumber ? `PO ${entry.poNumber}` : "No PO");
  return {
    label: first.poNumber || "No PO",
    more: rest.length,
    missing: !first.poNumber,
    detail: item.poStock.map((entry) => `${name(entry)} · ${entry.remaining} ${item.unit} left`).join("\n"),
  };
}

export function moveReasonMeta(reason: StockMoveReason) {
  return MOVE_REASONS[reason];
}

export interface InventoryFilter {
  status?: InventoryStatusFilter;
  search?: string;
}

/**
 * Location and supplier are searchable but not shown in the table — someone
 * looking for "everything from Alpine Parts" should find it without a column
 * for it.
 */
export function filterInventory(
  items: InventoryItem[],
  { status = "All", search = "" }: InventoryFilter,
) {
  const term = search.trim().toLowerCase();

  return items.filter((item) => {
    if (status !== "All" && item.status !== status) return false;
    if (!term) return true;
    return (
      item.name.toLowerCase().includes(term) ||
      item.sku.toLowerCase().includes(term) ||
      item.supplier.toLowerCase().includes(term) ||
      item.category.toLowerCase().includes(term) ||
      item.location.toLowerCase().includes(term) ||
      // "37345" finds every item still holding stock bought on that PO.
      item.poStock.some((entry) => entry.poNumber.toLowerCase().includes(term))
    );
  });
}

/**
 * One row of the list by PO: what is left of one delivery of one item, or,
 * for an item with nothing on hand, the item alone so it stays in sight for
 * reordering.
 */
export interface PoLine {
  key: string;
  /** A lot bought on a PO, a lot with no PO (opening or older stock), or an item with nothing on hand. */
  kind: "po" | "no-po" | "empty";
  poNumber: string;
  item: InventoryItem;
  batchRef: string | null;
  /** "Oct 15, 2026"; empty for an item with nothing on hand. */
  receivedDay: string;
  receivedAt: string;
  supplier: string;
  /** The supplier's invoice or delivery No., as typed. */
  documentRef: string;
  quantityReceived: number;
  remaining: number;
  unitCostCents: number;
  valueCents: number;
}

/** PO numbers in booklet order, newest first: "37479" before "37415", "37339-40" beside "37339". */
function comparePoDescending(a: string, b: string): number {
  return b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" });
}

const KIND_ORDER: Record<PoLine["kind"], number> = { po: 0, "no-po": 1, empty: 2 };

/**
 * The stock on hand split by PO: one row per delivery still on the shelf,
 * grouped by PO No. (newest PO first, items A to Z within it), then stock with
 * no PO, then items with nothing on hand.
 */
export function poLines(items: InventoryItem[], batches: StockBatch[]): PoLine[] {
  const open = new Map<string, StockBatch[]>();
  for (const batch of batches) {
    if (batch.remaining <= 0) continue;
    const list = open.get(batch.sku) ?? [];
    list.push(batch);
    open.set(batch.sku, list);
  }

  const lines: PoLine[] = [];
  for (const item of items) {
    const lots = open.get(item.sku) ?? [];
    if (lots.length === 0) {
      lines.push({
        key: `empty-${item.sku}`, kind: "empty", poNumber: "", item, batchRef: null, receivedDay: "", receivedAt: "",
        supplier: item.supplier, documentRef: "", quantityReceived: 0, remaining: 0,
        unitCostCents: item.unitCostCents, valueCents: 0,
      });
      continue;
    }
    for (const batch of lots) {
      const poNumber = cleanPoNumber(batch.poNumber ?? "");
      lines.push({
        key: batch.ref, kind: poNumber ? "po" : "no-po", poNumber, item, batchRef: batch.ref,
        receivedDay: batch.receivedDay, receivedAt: batch.receivedAt, supplier: batch.supplier,
        documentRef: batch.documentRef, quantityReceived: batch.quantityReceived, remaining: batch.remaining,
        unitCostCents: batch.unitCostCents, valueCents: batch.remaining * batch.unitCostCents,
      });
    }
  }

  return lines.sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      comparePoDescending(a.poNumber, b.poNumber) ||
      a.item.name.localeCompare(b.item.name) ||
      a.receivedAt.localeCompare(b.receivedAt),
  );
}

/** The by-PO rows a status chip and the search box leave. A PO No., invoice or supplier finds its own rows only. */
export function filterPoLines(lines: PoLine[], { status = "All", search = "" }: InventoryFilter): PoLine[] {
  const term = search.trim().toLowerCase();
  return lines.filter((line) => {
    if (status !== "All" && line.item.status !== status) return false;
    if (!term) return true;
    return [
      line.poNumber,
      line.documentRef,
      line.supplier,
      line.item.name,
      line.item.sku,
      line.item.category,
      line.item.location,
    ].some((value) => value.toLowerCase().includes(term));
  });
}

/** How many rows of the list by PO each status chip covers. */
export function countPoLinesByStatus(lines: PoLine[], status: InventoryStatusFilter): number {
  return status === "All" ? lines.length : lines.filter((line) => line.item.status === status).length;
}

export function countByStatus(
  items: InventoryItem[],
  status: InventoryStatusFilter,
) {
  if (status === "All") return items.length;
  return items.filter((item) => item.status === status).length;
}

/** Everything at or under its reorder point — the buyer's to-do list. */
export function belowReorder(items: InventoryItem[]) {
  return items.filter((item) => item.onHand <= item.reorder);
}

export function totalValueCents(items: InventoryItem[]) {
  return items.reduce((total, item) => total + item.valueCents, 0);
}

/** How full the item is against its target, clamped for the progress bar. */
export function fillPercent(item: { onHand: number; target: number }) {
  if (item.target <= 0) return 0;
  return Math.min(100, Math.round((item.onHand / item.target) * 100));
}

/** An exact hit on a name or a SKU. What the move dialog treats as "matched". */
export function findItem(items: InventoryItem[], text: string) {
  const term = text.trim().toLowerCase();
  if (!term) return null;
  return (
    items.find(
      (item) =>
        item.name.toLowerCase() === term || item.sku.toLowerCase() === term,
    ) ?? null
  );
}

/**
 * "Did you mean" candidates for a name that did not match exactly. Only offered
 * once there is more than one character to go on, so the list does not thrash
 * on the first keystroke.
 */
export function nearMatches(
  items: InventoryItem[],
  text: string,
  limit = 3,
): InventoryItem[] {
  const term = text.trim().toLowerCase();
  if (term.length < 2) return [];
  if (findItem(items, text)) return [];

  return items
    .filter((item) =>
      `${item.name} ${item.sku} ${item.category}`.toLowerCase().includes(term),
    )
    .slice(0, limit);
}

/**
 * What to pre-fill the money field with. A sale is marked up over cost; every
 * other transaction moves stock at what it cost us. Both are a starting point
 * the person recording the move can overwrite.
 */
const SALE_MARKUP = 1.45;

export function suggestedUnitAmountCents(
  item: { unitCostCents: number } | null,
  reason: StockMoveReason,
): number {
  const meta = MOVE_REASONS[reason];
  if (!item || !meta.transaction) return 0;
  return meta.side === "price"
    ? Math.round(item.unitCostCents * SALE_MARKUP)
    : item.unitCostCents;
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Half-open bounds `[from, to)` for the toolbar's movement window. */
export function periodBounds(period: InventoryPeriod, today: Date) {
  const start = startOfDay(today);
  const to = new Date(start);
  to.setDate(to.getDate() + 1);

  const from = new Date(start);
  if (period === "Today") {
    // From midnight: `from` is already the start of today.
  } else if (period === "This month") {
    from.setDate(1);
  } else if (period === "Last 90 days") {
    from.setDate(from.getDate() - 89);
  } else {
    from.setDate(from.getDate() - 6);
  }

  return { from, to };
}

export function movesInPeriod(
  moves: StockMove[],
  period: InventoryPeriod,
  today: Date,
) {
  const { from, to } = periodBounds(period, today);
  return moves.filter((move) => {
    const at = new Date(move.occurredAt);
    return at >= from && at < to;
  });
}

/** Whether an ISO time falls on the same day as `today`. */
export function isSameDay(iso: string, today: Date): boolean {
  if (!iso) return false;
  const { from, to } = periodBounds("Today", today);
  const at = new Date(iso);
  return at >= from && at < to;
}

/**
 * The list's Today filter. By PO keeps the deliveries received today; by
 * item keeps the items that moved in or out today.
 */
export function receivedToday(lines: PoLine[], today: Date): PoLine[] {
  return lines.filter((line) => line.kind !== "empty" && isSameDay(line.receivedAt, today));
}

export function movedToday(items: InventoryItem[], moves: StockMove[], today: Date): InventoryItem[] {
  const moved = new Set(moves.filter((move) => isSameDay(move.occurredAt, today)).map((move) => move.sku));
  return items.filter((item) => moved.has(item.sku));
}

/** The parties this business has actually dealt with, most recent first. */
export function recentParties(
  moves: StockMove[],
  kind: StockMove["kind"],
  limit = 3,
) {
  const seen: string[] = [];
  for (const move of moves) {
    if (move.kind !== kind || !move.party) continue;
    if (!seen.includes(move.party)) seen.push(move.party);
    if (seen.length >= limit) break;
  }
  return seen;
}
