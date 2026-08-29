import "server-only";

import { formatStamp } from "@/lib/format";
import { MOVE_REASONS } from "@/lib/data/inventory";
import { statusFor } from "@/lib/inventory";
import { postEntry } from "./ledger";
import { tenantScope } from "./tenant";
import type {
  InventoryItem,
  InventoryItemDocument,
  StockMove,
  StockMoveDocument,
  StockMoveInput,
} from "@/types";

const ITEMS = "inventoryItems";
const MOVES = "stockMoves";

/**
 * Stock is tenant-owned, so every call here goes through `tenantScope` — the
 * wrapper merges the active business into the filter and stamps it onto
 * inserts, which is what keeps one business out of another's stock room.
 */
async function items() {
  return tenantScope<InventoryItemDocument>(ITEMS);
}

async function moves() {
  return tenantScope<StockMoveDocument>(MOVES);
}

/**
 * Status and value are derived here rather than stored, and the display stamp
 * is formatted here rather than in the client — formatting in the client would
 * use the visitor's timezone and mismatch the server-rendered HTML.
 */
function toItem(doc: InventoryItemDocument): InventoryItem {
  return {
    sku: doc.sku,
    businessId: doc.businessId,
    name: doc.name,
    category: doc.category,
    icon: doc.icon,
    onHand: doc.onHand,
    target: doc.target,
    reorder: doc.reorder,
    unit: doc.unit,
    location: doc.location,
    supplier: doc.supplier,
    unitCostCents: doc.unitCostCents,
    valueCents: doc.onHand * doc.unitCostCents,
    status: statusFor(doc),
    updated: formatStamp(doc.updatedAt),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function toMove(doc: StockMoveDocument): StockMove {
  return {
    ref: doc.ref,
    sku: doc.sku,
    kind: doc.kind,
    quantity: doc.quantity,
    reason: doc.reason,
    documentRef: doc.documentRef,
    party: doc.party,
    unitAmountCents: doc.unitAmountCents,
    amountCents: doc.amountCents,
    createdItem: doc.createdItem,
    occurredAt: doc.occurredAt.toISOString(),
    when: formatStamp(doc.occurredAt),
  };
}

/**
 * The whole stock list for the active business. Filtering by status and search
 * happens in the client so typing does not round-trip; the tenant boundary is
 * enforced here, which is the part that must not be client side.
 */
export async function listInventory(): Promise<InventoryItem[]> {
  const collection = await items();
  const docs = await collection.find().sort({ sku: 1 }).toArray();
  return docs.map(toItem);
}

export async function getItem(sku: string): Promise<InventoryItem | null> {
  const collection = await items();
  const doc = await collection.findOne({ sku });
  return doc ? toItem(doc) : null;
}

/**
 * Movement history, newest first. The drawer shows one item's trail and the
 * toolbar counts the whole window, so both read the same list.
 */
export async function listMoves(limit = 300): Promise<StockMove[]> {
  const collection = await moves();
  const docs = await collection
    .find()
    .sort({ occurredAt: -1 })
    .limit(limit)
    .toArray();
  return docs.map(toMove);
}

/** An exact name or SKU hit, matched case-insensitively as the dialog does. */
async function findItemDocument(
  text: string,
): Promise<InventoryItemDocument | null> {
  const collection = await items();
  const term = text.trim();
  if (!term) return null;

  // Anchored and escaped, so a name containing regex punctuation ("225/45 R17")
  // matches literally rather than being compiled as a pattern.
  const literal = new RegExp(
    `^${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
    "i",
  );
  return collection.findOne({ $or: [{ name: literal }, { sku: literal }] });
}

/**
 * Items created from a stock in take a SKU in the 9000 block, so a code the
 * business coined at the counter is distinguishable from the catalogue it
 * started with.
 */
async function nextSku(): Promise<string> {
  const collection = await items();
  const [latest] = await collection
    .find({ sku: { $gte: "SKU-9" } })
    .sort({ sku: -1 })
    .limit(1)
    .toArray();

  const current = latest ? Number(latest.sku.replace(/\D/g, "")) : 9100;
  return `SKU-${current + 1}`;
}

async function nextMoveRef(): Promise<string> {
  const collection = await moves();
  const [latest] = await collection.find().sort({ ref: -1 }).limit(1).toArray();

  const current = latest ? Number(latest.ref.replace(/\D/g, "")) : 1000;
  return `MV-${current + 1}`;
}

function isDuplicateKey(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: number }).code === 11000
  );
}

/**
 * Recording a stock in for a name nobody has stocked before creates the item
 * rather than rejecting the move — the person at the counter has the goods in
 * hand, so the system should catch up to them. It opens at zero and the move
 * itself puts the first units on the shelf.
 */
async function createItem(
  name: string,
  input: StockMoveInput,
): Promise<InventoryItemDocument> {
  const collection = await items();
  const now = new Date();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const sku = await nextSku();

    try {
      // No `businessId` here — tenantScope stamps the active one on.
      await collection.insertOne({
        sku,
        name,
        category: "Newly recorded",
        icon: "package",
        onHand: 0,
        // Nothing is known about this item yet, so both levels are inferred
        // from the quantity that arrived. They are meant to be corrected later.
        target: input.quantity * 2,
        reorder: Math.max(1, Math.round(input.quantity * 0.25)),
        unit: "units",
        location: "Unassigned",
        supplier: input.party.trim() || "Not recorded",
        unitCostCents: input.unitAmountCents,
        createdAt: now,
        updatedAt: now,
      });
      const created = await collection.findOne({ sku });
      if (!created) {
        throw new Error(`${sku} was written but could not be read back.`);
      }
      return created;
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      // Someone else took this SKU — loop and take the next one.
    }
  }

  throw new Error("Could not allocate a SKU; please retry.");
}

/**
 * Applies one stock movement: the level changes, the move is written to the
 * audit trail, and a sale reaches the ledger.
 *
 * The local Mongo is a standalone, so there are no multi-document transactions
 * and these three writes cannot be atomic. The order below is chosen so a
 * failure never silently loses stock: the move is written first, and if the
 * guarded level update then finds the stock gone (someone else picked it in
 * between) the move is rolled back and the caller is told to reload.
 */
export async function recordStockMove(
  input: StockMoveInput,
): Promise<StockMove> {
  const itemsCollection = await items();
  const movesCollection = await moves();

  const typed = input.name.trim();
  if (!typed) throw new Error("Name the item this move applies to.");
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw new Error("Quantity must be a whole number of units, at least 1.");
  }

  const meta = MOVE_REASONS[input.reason];
  if (meta.kind !== input.kind) {
    throw new Error(`"${input.reason}" is not a stock ${input.kind} reason.`);
  }

  let item = await findItemDocument(typed);
  let createdItem = false;

  if (!item) {
    if (input.kind === "out") {
      throw new Error(
        `"${typed}" is not in inventory. Pick an existing item to stock out.`,
      );
    }
    item = await createItem(typed, input);
    createdItem = true;
  }

  if (input.kind === "out" && input.quantity > item.onHand) {
    throw new Error(
      `Only ${item.onHand} ${item.unit} of ${item.name} on hand.`,
    );
  }

  const now = new Date();
  const amountCents = meta.transaction
    ? input.quantity * input.unitAmountCents
    : 0;

  let ref = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    ref = await nextMoveRef();
    try {
      await movesCollection.insertOne({
        ref,
        sku: item.sku,
        kind: input.kind,
        quantity: input.quantity,
        reason: input.reason,
        documentRef: input.documentRef.trim(),
        party: meta.transaction ? input.party.trim() : "",
        unitAmountCents: meta.transaction ? input.unitAmountCents : 0,
        amountCents,
        createdItem,
        occurredAt: now,
        createdAt: now,
      });
      break;
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      ref = "";
      // Someone else took this ref — loop and take the next one.
    }
  }

  if (!ref) throw new Error("Could not allocate a movement reference; please retry.");

  const delta = input.kind === "in" ? input.quantity : -input.quantity;

  // The `$gte` guard is what makes the level safe under concurrency: two picks
  // for the last unit cannot both succeed, because the second one stops
  // matching.
  const guard =
    input.kind === "out"
      ? { sku: item.sku, onHand: { $gte: input.quantity } }
      : { sku: item.sku };

  const result = await itemsCollection.updateOne(guard, {
    $inc: { onHand: delta },
    $set: { updatedAt: now },
  });

  if (result.matchedCount === 0) {
    await movesCollection.deleteOne({ ref });
    throw new Error(
      `${item.name} no longer has ${input.quantity} ${item.unit} on hand. Reload and try again.`,
    );
  }

  /**
   * `transactions` is the revenue ledger the dashboard aggregates over, so only
   * the money a customer was charged belongs in it. Purchases, supplier credits
   * and write-offs are costs: they are recorded on the movement itself and wait
   * for a cost ledger that does not exist yet. Posting them here would inflate
   * revenue.
   */
  if (meta.side === "price" && amountCents > 0) {
    await postEntry({
      source: "inventory",
      sourceRef: ref,
      occurredAt: now,
      amountCents,
      description: `${item.name} × ${input.quantity} · ${input.party.trim() || input.reason}`,
    });
  }

  const written = await movesCollection.findOne({ ref });
  if (!written) {
    throw new Error(`Movement ${ref} was written but could not be read back.`);
  }
  return toMove(written);
}
