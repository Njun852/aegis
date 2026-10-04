import type {
  PurchaseOrderLine,
  PurchaseOrderStatus,
  PurchaseOrderStatusFilter,
  PurchaseOrder,
  RestockSuggestion,
} from "@/types";

/**
 * Pure purchasing rules: an order's status from its lines, what is still to
 * come, cost variance on a receipt, and the low-stock order planner. Nothing
 * here touches the database, so `scripts/supplier-check.ts` proves it.
 */

export const ORDER_CHANNELS = ["Phone", "Messenger", "In person", "Email", "Other"] as const;

export const ORDER_STATUSES: PurchaseOrderStatus[] = ["Draft", "Ordered", "Partly received", "Received", "Cancelled"];

/** Orders still expecting goods. */
export const OPEN_STATUSES: PurchaseOrderStatus[] = ["Draft", "Ordered", "Partly received"];

export const MAX_ORDER_LINES = 80;
export const MAX_UNITS = 99_999;

export function outstanding(line: Pick<PurchaseOrderLine, "qtyOrdered" | "qtyReceived">): number {
  return Math.max(0, line.qtyOrdered - line.qtyReceived);
}

/**
 * Where an ordered order stands once goods arrive: nothing in yet, some, or
 * all. Draft and Cancelled are set by a person, never derived.
 */
export function receivedStatus(lines: Pick<PurchaseOrderLine, "qtyOrdered" | "qtyReceived">[]): PurchaseOrderStatus {
  const received = lines.reduce((sum, line) => sum + Math.min(line.qtyReceived, line.qtyOrdered), 0);
  const ordered = lines.reduce((sum, line) => sum + line.qtyOrdered, 0);
  if (received === 0) return "Ordered";
  return received >= ordered ? "Received" : "Partly received";
}

export function expectedTotal(lines: Pick<PurchaseOrderLine, "qtyOrdered" | "expectedCostCents">[]): number {
  return lines.reduce((sum, line) => sum + line.qtyOrdered * line.expectedCostCents, 0);
}

/** Actual minus expected for the lines that had an expected cost. Positive means it cost more. */
export function receiptVariance(
  lines: { qty: number; unitCostCents: number; expectedCostCents: number | null }[],
): number {
  return lines.reduce(
    (sum, line) => (line.expectedCostCents === null ? sum : sum + line.qty * (line.unitCostCents - line.expectedCostCents)),
    0,
  );
}

export function variancePercent(unitCostCents: number, expectedCostCents: number | null): number | null {
  if (expectedCostCents === null || expectedCostCents === 0) return null;
  return Math.round(((unitCostCents - expectedCostCents) / expectedCostCents) * 100);
}

export function filterOrders(
  orders: PurchaseOrder[],
  options: { status: PurchaseOrderStatusFilter; search: string },
): PurchaseOrder[] {
  const term = options.search.trim().toLowerCase();
  return orders.filter((order) => {
    if (options.status === "Open" && !OPEN_STATUSES.includes(order.status)) return false;
    if (options.status !== "All" && options.status !== "Open" && order.status !== options.status) return false;
    if (!term) return true;
    return (
      order.ref.toLowerCase().includes(term) ||
      order.supplierName.toLowerCase().includes(term) ||
      order.lines.some((line) => line.description.toLowerCase().includes(term) || (line.sku ?? "").toLowerCase().includes(term))
    );
  });
}

/** "2026-10-04" plus whole days, read as a calendar day so no timezone can shift it. */
export function addDaysToKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export interface RestockInput {
  items: { sku: string; name: string; unit: string; onHand: number; target: number; reorder: number }[];
  /** Units of each SKU already on open orders and not yet received. */
  onOrder: Map<string, number>;
  /** Where each SKU is bought, from the price book: preferred, else most recently costed. */
  sources: Map<string, { supplierRef: string; supplierName: string; description: string; costCents: number; active: boolean }>;
}

/**
 * Items at or below their reorder point, with the quantity to bring them back
 * to target less what is already coming, and the supplier to order from.
 * An item with no supplier in the price book is listed with the reason, so a
 * person can add one rather than have it silently left out.
 */
export function planRestock({ items, onOrder, sources }: RestockInput): RestockSuggestion[] {
  return items
    .filter((item) => item.onHand <= item.reorder)
    .map((item) => {
      const coming = onOrder.get(item.sku) ?? 0;
      const qty = Math.max(0, item.target - item.onHand - coming);
      const source = sources.get(item.sku) ?? null;
      let skipped: string | null = null;
      if (qty === 0) skipped = coming > 0 ? `${coming} already on order` : "Already at target";
      else if (!source) skipped = "No supplier in the price book";
      else if (!source.active) skipped = `${source.supplierName} is no longer used`;
      return {
        sku: item.sku,
        name: item.name,
        unit: item.unit,
        onHand: item.onHand,
        target: item.target,
        reorder: item.reorder,
        qty,
        supplierRef: source?.supplierRef ?? null,
        supplierName: source?.supplierName ?? null,
        description: source?.description ?? item.name,
        costCents: source?.costCents ?? null,
        skipped,
      };
    })
    .sort((a, b) => (a.skipped ? 1 : 0) - (b.skipped ? 1 : 0) || a.name.localeCompare(b.name));
}
