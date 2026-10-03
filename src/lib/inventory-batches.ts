import type { BatchDraw, BatchSource, StockMoveReason } from "@/types";

/**
 * Pure batch rules: which batches a stock out draws from, what the stock on
 * hand is worth, what kind of batch a stock in opens. Nothing here touches the
 * database, so `scripts/supplier-check.ts` proves the arithmetic directly.
 */

export interface OpenBatch {
  ref: string;
  remaining: number;
  unitCostCents: number;
  receivedAt: Date;
}

/** Oldest first; batches received at the same instant fall back to ref order, so the plan is stable. */
export function fifoOrder<T extends OpenBatch>(batches: T[]): T[] {
  return [...batches]
    .filter((batch) => batch.remaining > 0)
    .sort(
      (a, b) =>
        a.receivedAt.getTime() - b.receivedAt.getTime() ||
        a.ref.localeCompare(b.ref, undefined, { numeric: true }),
    );
}

/**
 * Which batches `quantity` units come out of, oldest first. `short` is what
 * the batches could not cover, which only happens when they have drifted from
 * the item's level; the caller costs that part at the average and the
 * reconcile check reports it.
 */
export function planDraw(batches: OpenBatch[], quantity: number): { draws: BatchDraw[]; short: number } {
  const draws: BatchDraw[] = [];
  let left = quantity;
  for (const batch of fifoOrder(batches)) {
    if (left === 0) break;
    const take = Math.min(batch.remaining, left);
    draws.push({ batchRef: batch.ref, quantity: take, unitCostCents: batch.unitCostCents });
    left -= take;
  }
  return { draws, short: left };
}

export function drawCost(draws: BatchDraw[]): number {
  return draws.reduce((sum, draw) => sum + draw.quantity * draw.unitCostCents, 0);
}

/** What the stock on hand is worth and its average unit cost, over the open batches. */
export function batchValue(batches: Pick<OpenBatch, "remaining" | "unitCostCents">[]): {
  onHand: number;
  valueCents: number;
  averageCents: number | null;
} {
  let onHand = 0;
  let valueCents = 0;
  for (const batch of batches) {
    if (batch.remaining <= 0) continue;
    onHand += batch.remaining;
    valueCents += batch.remaining * batch.unitCostCents;
  }
  return { onHand, valueCents, averageCents: onHand > 0 ? Math.round(valueCents / onHand) : null };
}

const SOURCES: Partial<Record<StockMoveReason, BatchSource>> = {
  "Goods received": "goods-received",
  "Customer return": "customer-return",
  "Transfer in": "transfer-in",
  "Cycle count correction": "count-correction",
};

export function batchSourceFor(reason: StockMoveReason): BatchSource {
  return SOURCES[reason] ?? "count-correction";
}

/**
 * The unit cost a new batch carries. Only goods received states what the
 * stock cost; a customer return's amount is the credit given (a price), and an
 * internal move has none, so those come in at the item's current average.
 */
export function incomingUnitCost(
  reason: StockMoveReason,
  unitAmountCents: number,
  currentAverageCents: number,
): number {
  return reason === "Goods received" && unitAmountCents > 0 ? unitAmountCents : currentAverageCents;
}

export const BATCH_SOURCE_LABELS: Record<BatchSource, string> = {
  opening: "Opening stock",
  "goods-received": "Goods received",
  "customer-return": "Customer return",
  "transfer-in": "Transfer in",
  "count-correction": "Count correction",
};
