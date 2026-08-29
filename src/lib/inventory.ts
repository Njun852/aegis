import {
  INVENTORY_STATUS_STYLES,
  MOVE_REASONS,
} from "@/lib/data/inventory";
import type {
  InventoryItem,
  InventoryPeriod,
  InventoryStatus,
  InventoryStatusFilter,
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
      item.location.toLowerCase().includes(term)
    );
  });
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
  if (period === "This month") {
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
