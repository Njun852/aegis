"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/dal/businesses";
import {
  cancelOrder,
  closeOrderShort,
  createOrder,
  draftRestockOrders,
  findDuplicateReceipt,
  markOrdered,
  postReceipt,
  receiveGoods,
  updateOrder,
} from "@/lib/dal/purchasing";
import { InputError } from "@/lib/dal/refs";
import { MAX_ORDER_LINES, MAX_UNITS, ORDER_CHANNELS } from "@/lib/purchasing";
import { MAX_AMOUNT_CENTS, isDateKey, manilaDateKey, newLineId } from "@/lib/quotations";
import type { OrderChannel, PurchaseOrderInput, ReceiptInput } from "@/types";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function refresh() {
  revalidatePath("/suppliers");
  // Receiving changes stock, costs and so quotation costing.
  revalidatePath("/inventory");
  revalidatePath("/quotations");
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function wholeUnits(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > MAX_UNITS) {
    throw new InputError(`${label}: the quantity must be a whole number of units, at least 1.`);
  }
  return value;
}

function cents(value: unknown, label: string, allowZero: boolean): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < (allowZero ? 0 : 1) || value > MAX_AMOUNT_CENTS) {
    throw new InputError(`${label}: the cost is not a valid amount${allowZero ? "" : " above zero"}.`);
  }
  return value;
}

async function guard<T>(work: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof InputError) return { ok: false, error: error.message };
    throw error;
  }
}

function readOrder(raw: PurchaseOrderInput, inventory: boolean): PurchaseOrderInput {
  const supplierRef = text(raw.supplierRef, 20);
  if (!supplierRef) throw new InputError("Pick the supplier this order is with.");
  const expectedDate = text(raw.expectedDate, 10);
  if (expectedDate && !isDateKey(expectedDate)) throw new InputError("The expected date is not a date.");
  if (!Array.isArray(raw.lines)) throw new InputError("The order lines could not be read.");

  const lines = raw.lines
    .map((line) => ({
      id: text(line?.id, 40) || newLineId(),
      description: text(line?.description, 160),
      sku: inventory ? text(line?.sku, 40) || null : null,
      unit: text(line?.unit, 20),
      qtyOrdered: line?.qtyOrdered as number,
      expectedCostCents: line?.expectedCostCents as number,
    }))
    .filter((line) => line.description || line.sku);
  if (lines.length === 0) throw new InputError("Add at least one part to the order.");
  if (lines.length > MAX_ORDER_LINES) throw new InputError(`An order holds ${MAX_ORDER_LINES} lines at most.`);
  for (const line of lines) {
    if (!line.description) throw new InputError("Every line needs a description.");
    line.qtyOrdered = wholeUnits(line.qtyOrdered, line.description);
    line.expectedCostCents = cents(line.expectedCostCents, line.description, true);
  }
  return { supplierRef, notes: text(raw.notes, 600), expectedDate, lines };
}

/** Creates the order when `ref` is null, otherwise saves over it. */
export async function saveOrderAction(ref: string | null, raw: PurchaseOrderInput): Promise<Result<{ ref: string }>> {
  const business = await requireModule("suppliers");
  return guard(async () => {
    const input = readOrder(raw, business.modules.includes("inventory"));
    const saved = ref ? (await updateOrder(ref, input), ref) : await createOrder(input);
    refresh();
    return { ok: true, ref: saved };
  });
}

export async function markOrderedAction(
  ref: string,
  raw: { via: OrderChannel; orderedDate: string; expectedDate: string },
): Promise<Result> {
  await requireModule("suppliers");
  return guard(async () => {
    const via = ORDER_CHANNELS.find((channel) => channel === raw.via);
    if (!via) throw new InputError("Say how the order was placed.");
    const orderedDate = text(raw.orderedDate, 10);
    if (!isDateKey(orderedDate)) throw new InputError("The order date is not a date.");
    if (orderedDate > manilaDateKey(new Date())) throw new InputError("The order date cannot be in the future.");
    const expectedDate = text(raw.expectedDate, 10);
    if (expectedDate && !isDateKey(expectedDate)) throw new InputError("The expected date is not a date.");
    await markOrdered(ref, { via, orderedDate, expectedDate });
    refresh();
    return { ok: true };
  });
}

export async function cancelOrderAction(ref: string): Promise<Result> {
  await requireModule("suppliers");
  return guard(async () => {
    await cancelOrder(ref);
    refresh();
    return { ok: true };
  });
}

export async function closeOrderShortAction(ref: string): Promise<Result> {
  await requireModule("suppliers");
  return guard(async () => {
    await closeOrderShort(ref);
    refresh();
    return { ok: true };
  });
}

/**
 * Receives goods. A receipt number already recorded for this supplier comes
 * back as `duplicateOf` for the person to confirm, rather than as a refusal:
 * some suppliers reuse numbers.
 */
export async function receiveGoodsAction(
  raw: ReceiptInput,
): Promise<Result<{ ref: string }> | { ok: false; error: string; duplicateOf: string }> {
  const business = await requireModule("suppliers");
  const inventory = business.modules.includes("inventory");
  try {
    const supplierRef = text(raw.supplierRef, 20);
    if (!supplierRef) throw new InputError("Pick the supplier the goods came from.");
    const receivedDate = text(raw.receivedDate, 10);
    if (!isDateKey(receivedDate)) throw new InputError("The date received is not a date.");
    if (receivedDate > manilaDateKey(new Date())) throw new InputError("Goods cannot be received in the future.");
    if (!Array.isArray(raw.lines)) throw new InputError("The receipt lines could not be read.");

    const lines = raw.lines
      .map((line) => ({
        id: text(line?.id, 40) || newLineId(),
        orderLineId: text(line?.orderLineId, 40) || null,
        description: text(line?.description, 160),
        sku: inventory ? text(line?.sku, 40) || null : null,
        unit: text(line?.unit, 20),
        qty: line?.qty as number,
        unitCostCents: line?.unitCostCents as number,
        expectedCostCents:
          typeof line?.expectedCostCents === "number" && Number.isInteger(line.expectedCostCents)
            ? line.expectedCostCents
            : null,
      }))
      // An order line left at zero simply did not arrive this time.
      .filter((line) => line.qty !== 0);
    if (lines.length === 0) throw new InputError("Nothing has been entered as received.");
    if (lines.length > MAX_ORDER_LINES) throw new InputError(`A receipt holds ${MAX_ORDER_LINES} lines at most.`);
    for (const line of lines) {
      if (!line.description) throw new InputError("Every line needs a description.");
      line.qty = wholeUnits(line.qty, line.description);
      line.unitCostCents = cents(line.unitCostCents, line.description, false);
    }

    const receiptNo = text(raw.receiptNo, 40);
    if (!raw.confirmDuplicate) {
      const duplicate = await findDuplicateReceipt(supplierRef, receiptNo);
      if (duplicate) {
        return {
          ok: false,
          error: `Receipt No. ${receiptNo} from this supplier is already recorded as ${duplicate}.`,
          duplicateOf: duplicate,
        };
      }
    }

    const ref = await receiveGoods(
      {
        supplierRef,
        purchaseOrderRef: text(raw.purchaseOrderRef, 20) || null,
        receiptNo,
        receivedDate,
        notes: text(raw.notes, 600),
        lines,
      },
      inventory,
    );
    refresh();
    return { ok: true, ref };
  } catch (error) {
    if (error instanceof InputError) return { ok: false, error: error.message };
    throw error;
  }
}

/** Finishes posting a receipt that was interrupted. Lines already in stock are skipped. */
export async function postReceiptAction(ref: string): Promise<Result> {
  await requireModule("suppliers");
  return guard(async () => {
    await postReceipt(ref);
    refresh();
    return { ok: true };
  });
}

export async function draftRestockOrdersAction(skus: string[]): Promise<Result<{ refs: string[] }>> {
  const business = await requireModule("suppliers");
  return guard(async () => {
    if (!business.modules.includes("inventory")) throw new InputError("Restocking needs the Inventory module.");
    if (!Array.isArray(skus) || skus.length === 0) throw new InputError("Pick at least one item to reorder.");
    const refs = await draftRestockOrders(skus.filter((sku): sku is string => typeof sku === "string").slice(0, 300));
    if (refs.length === 0) throw new InputError("None of those items can be ordered yet. Add a supplier for them first.");
    refresh();
    return { ok: true, refs };
  });
}
