import "server-only";

import { formatDate } from "@/lib/fleet";
import {
  OPEN_STATUSES,
  expectedTotal,
  outstanding,
  planRestock,
  receiptVariance,
  receivedStatus,
} from "@/lib/purchasing";
import { formatQuoteDay, newLineId } from "@/lib/quotations";
import { compareParts, planningCost } from "@/lib/suppliers";
import { listInventory, recordStockMove } from "./inventory";
import { InputError, insertWithRef } from "./refs";
import { verifySession } from "./session";
import { findSupplier, listSupplierItems, recordCost } from "./suppliers";
import { tenantScope } from "./tenant";
import type {
  OrderChannel,
  PurchaseOrder,
  PurchaseOrderDocument,
  PurchaseOrderInput,
  Receipt,
  ReceiptDocument,
  ReceiptInput,
  RestockSuggestion,
  SupplierDocument,
} from "@/types";

/**
 * Purchase orders and goods receipts. Orders are records only; receipts are
 * where stock and costs change. Posting a receipt drives Inventory
 * (`recordStockMove`, which opens the batch) and the price book
 * (`recordCost`, which writes the history), so neither can be updated around
 * the other.
 */
const orders = () => tenantScope<PurchaseOrderDocument>("purchaseOrders");
const receipts = () => tenantScope<ReceiptDocument>("receipts");
const suppliers = () => tenantScope<SupplierDocument>("suppliers");

async function supplierNames(): Promise<Map<string, string>> {
  const collection = await suppliers();
  const docs = await collection.find({}).project<{ ref: string; name: string }>({ ref: 1, name: 1 }).toArray();
  return new Map(docs.map((doc) => [doc.ref, doc.name]));
}

function toOrder(
  doc: PurchaseOrderDocument,
  names: Map<string, string>,
  linked: { ref: string; receivedDate: string; receiptNo: string }[],
): PurchaseOrder {
  return {
    ref: doc.ref,
    supplierRef: doc.supplierRef,
    supplierName: names.get(doc.supplierRef) ?? doc.supplierRef,
    status: doc.status,
    lines: doc.lines,
    notes: doc.notes,
    orderedDay: doc.orderedAt ? formatDate(doc.orderedAt) : null,
    orderedVia: doc.orderedVia ?? null,
    expectedDate: doc.expectedDate ?? null,
    expectedDay: doc.expectedDate ? formatQuoteDay(doc.expectedDate) : null,
    closedShort: doc.closedShort ?? false,
    origin: doc.origin,
    expectedTotalCents: expectedTotal(doc.lines),
    openLines: doc.lines.filter((line) => outstanding(line) > 0).length,
    receipts: linked.map((receipt) => ({
      ref: receipt.ref,
      day: formatQuoteDay(receipt.receivedDate),
      receiptNo: receipt.receiptNo,
    })),
    createdDay: formatDate(doc.createdAt),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function toReceipt(doc: ReceiptDocument, names: Map<string, string>): Receipt {
  return {
    ref: doc.ref,
    supplierRef: doc.supplierRef,
    supplierName: names.get(doc.supplierRef) ?? doc.supplierRef,
    purchaseOrderRef: doc.purchaseOrderRef,
    receiptNo: doc.receiptNo,
    receivedDate: doc.receivedDate,
    receivedDay: formatQuoteDay(doc.receivedDate),
    lines: doc.lines,
    status: doc.status,
    stocked: doc.stocked,
    notes: doc.notes,
    totalCents: doc.lines.reduce((sum, line) => sum + line.qty * line.unitCostCents, 0),
    varianceCents: receiptVariance(doc.lines),
  };
}

// ---- Orders ---------------------------------------------------------------------

export async function listOrders(): Promise<PurchaseOrder[]> {
  const [orderCollection, receiptCollection, names] = await Promise.all([orders(), receipts(), supplierNames()]);
  const [docs, linked] = await Promise.all([
    orderCollection.find().sort({ updatedAt: -1 }).limit(500).toArray(),
    receiptCollection
      .find({ purchaseOrderRef: { $ne: null } })
      .project<{ ref: string; purchaseOrderRef: string; receivedDate: string; receiptNo: string }>({
        ref: 1,
        purchaseOrderRef: 1,
        receivedDate: 1,
        receiptNo: 1,
      })
      .toArray(),
  ]);
  return docs.map((doc) => toOrder(doc, names, linked.filter((receipt) => receipt.purchaseOrderRef === doc.ref)));
}

export async function findOrder(ref: string): Promise<PurchaseOrder | null> {
  const [orderCollection, receiptCollection, names] = await Promise.all([orders(), receipts(), supplierNames()]);
  const doc = await orderCollection.findOne({ ref });
  if (!doc) return null;
  const linked = await receiptCollection
    .find({ purchaseOrderRef: ref })
    .sort({ createdAt: 1 })
    .project<{ ref: string; receivedDate: string; receiptNo: string }>({ ref: 1, receivedDate: 1, receiptNo: 1 })
    .toArray();
  return toOrder(doc, names, linked);
}

async function assertSupplierInUse(ref: string) {
  const supplier = await findSupplier(ref);
  if (!supplier) throw new InputError("That supplier is no longer on file.");
  if (!supplier.active) throw new InputError(`${supplier.name} is marked as no longer used.`);
  return supplier;
}

export async function createOrder(input: PurchaseOrderInput, origin: "typed" | "low-stock" = "typed"): Promise<string> {
  await assertSupplierInUse(input.supplierRef);
  const { userId } = await verifySession();
  const collection = await orders();
  const now = new Date();
  return insertWithRef(collection, "PO-", 1001, (ref) =>
    collection.insertOne({
      ref,
      supplierRef: input.supplierRef,
      status: "Draft",
      lines: input.lines.map((line) => ({ ...line, qtyReceived: 0 })),
      notes: input.notes,
      ...(input.expectedDate ? { expectedDate: input.expectedDate } : {}),
      origin,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    }),
  );
}

/**
 * Lines can change until the first delivery against them. After that the
 * order is the record of what arrived against what was asked for, and only
 * its notes and expected date move.
 */
export async function updateOrder(ref: string, input: PurchaseOrderInput): Promise<void> {
  const collection = await orders();
  const doc = await collection.findOne({ ref });
  if (!doc) throw new InputError(`${ref} is no longer on file.`);
  if (doc.status === "Cancelled" || doc.status === "Received") {
    throw new InputError(`${ref} is ${doc.status.toLowerCase()} and can no longer be changed.`);
  }
  const anyReceived = doc.lines.some((line) => line.qtyReceived > 0);
  if (anyReceived) {
    await collection.updateOne(
      { ref },
      { $set: { notes: input.notes, expectedDate: input.expectedDate || null, updatedAt: new Date() } },
    );
    return;
  }
  if (input.supplierRef !== doc.supplierRef) await assertSupplierInUse(input.supplierRef);
  await collection.updateOne(
    { ref },
    {
      $set: {
        supplierRef: input.supplierRef,
        lines: input.lines.map((line) => ({ ...line, qtyReceived: 0 })),
        notes: input.notes,
        expectedDate: input.expectedDate || null,
        updatedAt: new Date(),
      },
    },
  );
}

export async function markOrdered(
  ref: string,
  details: { via: OrderChannel; orderedDate: string; expectedDate: string },
): Promise<void> {
  const collection = await orders();
  const doc = await collection.findOne({ ref });
  if (!doc) throw new InputError(`${ref} is no longer on file.`);
  if (doc.status !== "Draft") throw new InputError(`${ref} is already ${doc.status.toLowerCase()}.`);
  if (doc.lines.length === 0) throw new InputError("Add at least one line before marking it ordered.");
  await collection.updateOne(
    { ref, status: "Draft" },
    {
      $set: {
        status: "Ordered",
        orderedVia: details.via,
        orderedAt: new Date(`${details.orderedDate}T12:00:00+08:00`),
        expectedDate: details.expectedDate || null,
        updatedAt: new Date(),
      },
    },
  );
}

/** Only an order nothing has arrived against can be cancelled; after a delivery it is closed short instead. */
export async function cancelOrder(ref: string): Promise<void> {
  const collection = await orders();
  const doc = await collection.findOne({ ref });
  if (!doc) throw new InputError(`${ref} is no longer on file.`);
  if (doc.lines.some((line) => line.qtyReceived > 0)) {
    throw new InputError("Goods have already arrived against this order. Close the rest instead.");
  }
  if (doc.status === "Cancelled") return;
  await collection.updateOne({ ref }, { $set: { status: "Cancelled", updatedAt: new Date() } });
}

/** Gives up on what has not arrived. The order keeps its short quantities as the record. */
export async function closeOrderShort(ref: string): Promise<void> {
  const collection = await orders();
  const doc = await collection.findOne({ ref });
  if (!doc) throw new InputError(`${ref} is no longer on file.`);
  if (doc.status !== "Partly received") throw new InputError("Only a partly received order can be closed short.");
  await collection.updateOne({ ref }, { $set: { status: "Received", closedShort: true, updatedAt: new Date() } });
}

// ---- Receipts ---------------------------------------------------------------------

export async function listReceipts(): Promise<Receipt[]> {
  const [collection, names] = await Promise.all([receipts(), supplierNames()]);
  const docs = await collection.find().sort({ createdAt: -1 }).limit(500).toArray();
  return docs.map((doc) => toReceipt(doc, names));
}

export async function findReceipt(ref: string): Promise<Receipt | null> {
  const [collection, names] = await Promise.all([receipts(), supplierNames()]);
  const doc = await collection.findOne({ ref });
  return doc ? toReceipt(doc, names) : null;
}

/** An earlier receipt with the same supplier receipt number, so a receipt is not entered twice. */
export async function findDuplicateReceipt(supplierRef: string, receiptNo: string): Promise<string | null> {
  if (!receiptNo.trim()) return null;
  const collection = await receipts();
  const doc = await collection.findOne({ supplierRef, receiptNo: receiptNo.trim() });
  return doc?.ref ?? null;
}

/**
 * Records goods received and posts them. Validation against the order (the
 * supplier matches, nothing arrives beyond what is outstanding) happens before
 * anything is written; the receipt is then stored as Posting and each line
 * posted in turn by `postReceipt`.
 */
export async function receiveGoods(input: ReceiptInput, stocked: boolean): Promise<string> {
  const supplier = await findSupplier(input.supplierRef);
  if (!supplier) throw new InputError("That supplier is no longer on file.");

  if (input.purchaseOrderRef) {
    const orderCollection = await orders();
    const order = await orderCollection.findOne({ ref: input.purchaseOrderRef });
    if (!order) throw new InputError(`${input.purchaseOrderRef} is no longer on file.`);
    if (order.supplierRef !== input.supplierRef) throw new InputError(`${order.ref} is with a different supplier.`);
    if (order.status === "Draft") throw new InputError(`Mark ${order.ref} as ordered before receiving against it.`);
    if (order.status === "Cancelled" || order.status === "Received") {
      throw new InputError(`${order.ref} is ${order.status.toLowerCase()}; receive without an order instead.`);
    }
    for (const line of input.lines) {
      if (!line.orderLineId) continue;
      const ordered = order.lines.find((entry) => entry.id === line.orderLineId);
      if (!ordered) throw new InputError(`A line no longer matches ${order.ref}. Reload and try again.`);
      if (line.qty > outstanding(ordered)) {
        throw new InputError(`${ordered.description}: only ${outstanding(ordered)} still to come on ${order.ref}.`);
      }
    }
  }

  const { userId } = await verifySession();
  const collection = await receipts();
  const ref = await insertWithRef(collection, "GR-", 1001, (next) =>
    collection.insertOne({
      ref: next,
      supplierRef: input.supplierRef,
      purchaseOrderRef: input.purchaseOrderRef,
      receiptNo: input.receiptNo,
      receivedDate: input.receivedDate,
      lines: input.lines.map((line) => ({ ...line, moveRef: null, batchRef: null })),
      status: "Posting",
      stocked,
      notes: input.notes,
      createdBy: userId,
      createdAt: new Date(),
    }),
  );
  await postReceipt(ref);
  return ref;
}

/**
 * Posts each line not yet posted: stock in (opening its batch), the order
 * line's received quantity, the supplier's cost. A line records its movement
 * the moment it is in stock, so running this again after an interruption
 * picks up where it stopped and never adds stock twice.
 */
export async function postReceipt(ref: string): Promise<void> {
  const [collection, orderCollection] = await Promise.all([receipts(), orders()]);
  const doc = await collection.findOne({ ref });
  if (!doc) throw new InputError(`${ref} is no longer on file.`);
  if (doc.status === "Posted") return;
  const supplier = await findSupplier(doc.supplierRef);
  if (!supplier) throw new InputError("That supplier is no longer on file.");

  // One poster at a time: a double click, or two people pressing Finish
  // posting at once, must not put the same goods in twice. The lock lapses
  // on its own, so a crashed request does not hold the receipt for ever.
  const now = new Date();
  const claimed = await collection.updateOne(
    { ref, status: "Posting", $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: { $lte: now } }] },
    { $set: { lockedUntil: new Date(now.getTime() + 120_000) } },
  );
  if (claimed.matchedCount === 0) {
    throw new InputError(`${ref} is being posted already. Reload in a moment.`);
  }

  try {
    const documentRef = [doc.ref, doc.receiptNo && `No. ${doc.receiptNo}`, doc.purchaseOrderRef]
      .filter(Boolean)
      .join(" · ");

    for (const line of doc.lines) {
      if (line.moveRef) continue;
      let sku = line.sku;

      if (doc.stocked) {
        // By SKU when linked, which always finds the item; by name for a new
        // one, which creates it on first receipt.
        const move = await recordStockMove({
          name: sku ?? line.description,
          kind: "in",
          quantity: line.qty,
          reason: "Goods received",
          documentRef,
          party: supplier.name,
          unitAmountCents: line.unitCostCents,
        });
        sku = move.sku;
        await collection.updateOne(
          { ref },
          {
            $set: {
              "lines.$[l].moveRef": move.ref,
              "lines.$[l].batchRef": move.batches[0]?.batchRef ?? null,
              "lines.$[l].sku": move.sku,
            },
          },
          { arrayFilters: [{ "l.id": line.id }] },
        );
      } else {
        // No Inventory: the line is posted when its cost is recorded.
        await collection.updateOne(
          { ref },
          { $set: { "lines.$[l].moveRef": "cost-only" } },
          { arrayFilters: [{ "l.id": line.id }] },
        );
      }

      if (doc.purchaseOrderRef && line.orderLineId) {
        await orderCollection.updateOne(
          { ref: doc.purchaseOrderRef },
          { $inc: { "lines.$[l].qtyReceived": line.qty }, $set: { updatedAt: new Date() } },
          { arrayFilters: [{ "l.id": line.orderLineId }] },
        );
      }

      await recordCost({
        supplierRef: doc.supplierRef,
        description: line.description,
        sku,
        unit: line.unit,
        costCents: line.unitCostCents,
        source: "purchase",
        documentRef,
      });
    }

    if (doc.purchaseOrderRef) {
      const order = await orderCollection.findOne({ ref: doc.purchaseOrderRef });
      if (order && order.status !== "Cancelled" && !order.closedShort) {
        await orderCollection.updateOne(
          { ref: order.ref },
          { $set: { status: receivedStatus(order.lines), updatedAt: new Date() } },
        );
      }
    }

    await collection.updateOne({ ref }, { $set: { status: "Posted", postedAt: new Date() }, $unset: { lockedUntil: "" } });
  } catch (error) {
    // Let a retry in at once rather than after the lock lapses.
    await collection.updateOne({ ref }, { $unset: { lockedUntil: "" } });
    throw error;
  }
}

// ---- Restocking ---------------------------------------------------------------------

/** Low-stock items, how many to order and from whom. */
export async function listRestockSuggestions(): Promise<RestockSuggestion[]> {
  const [stock, supplierItems, orderCollection, supplierCollection] = await Promise.all([
    listInventory(),
    listSupplierItems(),
    orders(),
    suppliers(),
  ]);
  const [open, supplierDocs] = await Promise.all([
    orderCollection.find({ status: { $in: OPEN_STATUSES } }).toArray(),
    supplierCollection.find({}).project<{ ref: string; active: boolean }>({ ref: 1, active: 1 }).toArray(),
  ]);
  const active = new Map(supplierDocs.map((doc) => [doc.ref, doc.active]));

  const onOrder = new Map<string, number>();
  for (const order of open) {
    for (const line of order.lines) {
      if (line.sku) onOrder.set(line.sku, (onOrder.get(line.sku) ?? 0) + outstanding(line));
    }
  }

  const sources = new Map<string, { supplierRef: string; supplierName: string; description: string; costCents: number; active: boolean }>();
  for (const group of compareParts(supplierItems)) {
    if (!group.sku) continue;
    // A supplier the shop stopped using is passed over when another sells the part.
    const usable = { ...group, entries: group.entries.filter((entry) => active.get(entry.supplierRef) !== false) };
    const pick = planningCost(usable.entries.length > 0 ? usable : group);
    if (!pick) continue;
    sources.set(group.sku, {
      supplierRef: pick.supplierRef,
      supplierName: pick.supplierName,
      description: pick.description,
      costCents: pick.costCents,
      active: active.get(pick.supplierRef) !== false,
    });
  }
  return planRestock({ items: stock, onOrder, sources });
}

/**
 * Drafts one order per supplier for the chosen low-stock items. Drafts only:
 * a person reviews each and marks it ordered once it has actually been placed.
 */
export async function draftRestockOrders(skus: string[]): Promise<string[]> {
  const suggestions = (await listRestockSuggestions()).filter(
    (entry) => skus.includes(entry.sku) && !entry.skipped && entry.supplierRef,
  );
  const bySupplier = new Map<string, RestockSuggestion[]>();
  for (const entry of suggestions) {
    bySupplier.set(entry.supplierRef!, [...(bySupplier.get(entry.supplierRef!) ?? []), entry]);
  }
  const created: string[] = [];
  for (const [supplierRef, entries] of bySupplier) {
    created.push(
      await createOrder(
        {
          supplierRef,
          notes: "Drafted from low stock.",
          expectedDate: "",
          lines: entries.map((entry) => ({
            id: newLineId(),
            description: entry.description,
            sku: entry.sku,
            unit: entry.unit,
            qtyOrdered: entry.qty,
            expectedCostCents: entry.costCents ?? 0,
          })),
        },
        "low-stock",
      ),
    );
  }
  return created;
}
