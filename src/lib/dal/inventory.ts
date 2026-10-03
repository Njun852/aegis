import "server-only";

import { formatStamp } from "@/lib/format";
import { formatDate } from "@/lib/fleet";
import { MOVE_REASONS } from "@/lib/data/inventory";
import { statusFor } from "@/lib/inventory";
import {
  batchSourceFor,
  drawCost,
  incomingUnitCost,
  planDraw,
} from "@/lib/inventory-batches";
import { postEntry } from "./ledger";
import { insertWithRef } from "./refs";
import { tenantScope } from "./tenant";
import type {
  BatchDraw,
  InventoryItem,
  InventoryItemDocument,
  StockBatch,
  StockBatchDocument,
  StockMove,
  StockMoveDocument,
  StockMoveInput,
} from "@/types";

const ITEMS = "inventoryItems";
const MOVES = "stockMoves";
const BATCHES = "stockBatches";

/**
 * Stock is tenant-owned, so every call here goes through `tenantScope` — the
 * wrapper merges the active business into the filter and stamps it onto
 * inserts, which is what keeps one business out of another's stock room.
 *
 * Two layers: the item holds the level (`onHand`), which is what the
 * concurrency guard protects; its batches hold where that stock came from and
 * what each unit cost. Every movement changes both, and the two always agree
 * in total; `scripts/supplier-check.ts` proves it on a real database.
 */
async function items() {
  return tenantScope<InventoryItemDocument>(ITEMS);
}

async function moves() {
  return tenantScope<StockMoveDocument>(MOVES);
}

async function batches() {
  return tenantScope<StockBatchDocument>(BATCHES);
}

interface BatchStats {
  onHand: number;
  valueCents: number;
  open: number;
  /** Unit cost of the oldest open batch. */
  nextCostCents: number;
}

/** Totals over the open batches, per SKU, in one aggregation. */
async function batchStats(sku?: string): Promise<Map<string, BatchStats>> {
  const collection = await batches();
  const rows = await collection
    .aggregate([
      { $match: { remaining: { $gt: 0 }, ...(sku ? { sku } : {}) } },
      { $sort: { receivedAt: 1, createdAt: 1 } },
      {
        $group: {
          _id: "$sku",
          onHand: { $sum: "$remaining" },
          valueCents: { $sum: { $multiply: ["$remaining", "$unitCostCents"] } },
          open: { $sum: 1 },
          nextCostCents: { $first: "$unitCostCents" },
        },
      },
    ])
    .toArray();
  return new Map(
    rows.map((row) => [
      String(row._id),
      {
        onHand: row.onHand as number,
        valueCents: row.valueCents as number,
        open: row.open as number,
        nextCostCents: row.nextCostCents as number,
      },
    ]),
  );
}

/**
 * Stock that was on the shelf before batches existed becomes one opening
 * batch per item, at the cost and supplier on file. Run before every read and
 * write, so a business's stock is converted the first time anyone opens
 * Inventory, with nothing to schedule. The ref is fixed per SKU and the write
 * only inserts, so running it twice, or twice at once, changes nothing.
 */
async function ensureOpeningBatches(): Promise<void> {
  const [itemCollection, batchCollection] = await Promise.all([items(), batches()]);
  const stocked = await itemCollection.find({ onHand: { $gt: 0 } }).toArray();
  if (stocked.length === 0) return;

  const withBatches = await batchCollection.aggregate([{ $group: { _id: "$sku" } }]).toArray();
  const known = new Set(withBatches.map((row) => String(row._id)));
  const missing = stocked.filter((item) => !known.has(item.sku));

  await Promise.all(
    missing.map((item) =>
      batchCollection.updateOne(
        { ref: `OPEN-${item.sku}` },
        {
          $setOnInsert: {
            sku: item.sku,
            source: "opening",
            receivedAt: item.createdAt,
            quantityReceived: item.onHand,
            remaining: item.onHand,
            unitCostCents: item.unitCostCents,
            supplier: item.supplier,
            documentRef: "",
            moveRef: null,
            createdAt: new Date(),
          },
        },
        { upsert: true },
      ),
    ),
  );
}

/**
 * Status and value are derived here rather than stored, and the display stamp
 * is formatted here rather than in the client — formatting in the client would
 * use the visitor's timezone and mismatch the server-rendered HTML.
 */
function toItem(doc: InventoryItemDocument, stats: BatchStats | undefined): InventoryItem {
  const average = stats && stats.onHand > 0 ? Math.round(stats.valueCents / stats.onHand) : null;
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
    unitCostCents: average ?? doc.unitCostCents,
    valueCents: stats?.valueCents ?? 0,
    openBatches: stats?.open ?? 0,
    nextCostCents: stats?.nextCostCents ?? null,
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
    batches: doc.batches ?? [],
    costCents: doc.costCents ?? 0,
    occurredAt: doc.occurredAt.toISOString(),
    when: formatStamp(doc.occurredAt),
  };
}

function toBatch(doc: StockBatchDocument): StockBatch {
  return {
    ref: doc.ref,
    sku: doc.sku,
    source: doc.source,
    receivedDay: formatDate(doc.receivedAt),
    receivedAt: doc.receivedAt.toISOString(),
    quantityReceived: doc.quantityReceived,
    remaining: doc.remaining,
    unitCostCents: doc.unitCostCents,
    supplier: doc.supplier,
    documentRef: doc.documentRef,
  };
}

/**
 * The whole stock list for the active business. Filtering by status and search
 * happens in the client so typing does not round-trip; the tenant boundary is
 * enforced here, which is the part that must not be client side.
 */
export async function listInventory(): Promise<InventoryItem[]> {
  await ensureOpeningBatches();
  const collection = await items();
  const [docs, stats] = await Promise.all([collection.find().sort({ sku: 1 }).toArray(), batchStats()]);
  return docs.map((doc) => toItem(doc, stats.get(doc.sku)));
}

export async function getItem(sku: string): Promise<InventoryItem | null> {
  await ensureOpeningBatches();
  const collection = await items();
  const doc = await collection.findOne({ sku });
  if (!doc) return null;
  const stats = await batchStats(sku);
  return toItem(doc, stats.get(sku));
}

/**
 * Every batch, newest first, for the item drawer: the open ones show where
 * the stock on hand came from, the used-up ones are its history.
 */
export async function listBatches(limit = 2000): Promise<StockBatch[]> {
  await ensureOpeningBatches();
  const collection = await batches();
  const docs = await collection.find().sort({ receivedAt: -1, createdAt: -1 }).limit(limit).toArray();
  return docs.map(toBatch);
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

/** Writes the movement, retrying only a lost race for its ref. */
async function insertMove(doc: Omit<StockMoveDocument, "businessId" | "ref">): Promise<string> {
  const collection = await moves();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const ref = await nextMoveRef();
    try {
      await collection.insertOne({ ...doc, ref });
      return ref;
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
  }
  throw new Error("Could not allocate a movement reference; please retry.");
}

/** The item's stored average, refreshed from its open batches after a movement. */
async function refreshAverage(sku: string, at: Date): Promise<void> {
  const stats = (await batchStats(sku)).get(sku);
  if (!stats || stats.onHand === 0) return;
  const collection = await items();
  await collection.updateOne(
    { sku },
    { $set: { unitCostCents: Math.round(stats.valueCents / stats.onHand), updatedAt: at } },
  );
}

/**
 * Takes `quantity` units out of the item's batches, oldest first. Each batch
 * is decremented with a guard, so two pickers can never both take its last
 * unit; a lost race re-plans from what is left. Returns what was taken and
 * how much the batches could not cover.
 */
async function drawFromBatches(sku: string, quantity: number): Promise<{ draws: BatchDraw[]; short: number }> {
  const collection = await batches();
  const taken: BatchDraw[] = [];
  let left = quantity;

  for (let attempt = 0; attempt < 6 && left > 0; attempt += 1) {
    const open = await collection.find({ sku, remaining: { $gt: 0 } }).toArray();
    const plan = planDraw(open, left);
    if (plan.draws.length === 0) break;

    for (const draw of plan.draws) {
      const result = await collection.updateOne(
        { ref: draw.batchRef, remaining: { $gte: draw.quantity } },
        { $inc: { remaining: -draw.quantity } },
      );
      if (result.matchedCount === 0) break; // Someone took from it first; plan again.
      taken.push(draw);
      left -= draw.quantity;
    }
  }
  return { draws: taken, short: left };
}

/** Puts drawn units back, for a stock out that could not be completed. */
async function returnToBatches(draws: BatchDraw[]): Promise<void> {
  const collection = await batches();
  await Promise.all(
    draws.map((draw) => collection.updateOne({ ref: draw.batchRef }, { $inc: { remaining: draw.quantity } })),
  );
}

/**
 * Applies one stock movement: the level changes, its batches change, the move
 * is written to the audit trail, and a sale reaches the ledger.
 *
 * The local Mongo is a standalone, so there are no multi-document transactions
 * and these writes cannot be atomic. The order below is chosen so a failure
 * never silently loses or doubles stock:
 *  - a stock out reserves the units on the item first (the guarded level is
 *    what stops two picks taking the last unit), then draws them from the
 *    batches, then writes the move; a failure undoes the earlier steps;
 *  - a stock in writes the move, then opens its batch, then raises the level;
 *    a failure before the level changes removes what was written.
 */
export async function recordStockMove(
  input: StockMoveInput,
): Promise<StockMove> {
  await ensureOpeningBatches();
  const itemsCollection = await items();
  const movesCollection = await moves();
  const batchCollection = await batches();

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
  const stats = (await batchStats(item.sku)).get(item.sku);
  const averageCents = stats && stats.onHand > 0 ? Math.round(stats.valueCents / stats.onHand) : item.unitCostCents;
  const base = {
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
  };

  let ref: string;

  if (input.kind === "out") {
    // The `$gte` guard is what makes the level safe under concurrency: two
    // picks for the last unit cannot both succeed, because the second one
    // stops matching.
    const reserved = await itemsCollection.updateOne(
      { sku: item.sku, onHand: { $gte: input.quantity } },
      { $inc: { onHand: -input.quantity }, $set: { updatedAt: now } },
    );
    if (reserved.matchedCount === 0) {
      throw new Error(
        `${item.name} no longer has ${input.quantity} ${item.unit} on hand. Reload and try again.`,
      );
    }

    const { draws, short } = await drawFromBatches(item.sku, input.quantity);
    // Units the batches could not cover (they had drifted from the level) are
    // costed at the average rather than refused: the goods did leave.
    const costCents = drawCost(draws) + short * averageCents;
    try {
      ref = await insertMove({ ...base, batches: draws, costCents });
    } catch (error) {
      await returnToBatches(draws);
      await itemsCollection.updateOne({ sku: item.sku }, { $inc: { onHand: input.quantity } });
      throw error;
    }
  } else {
    const unitCostCents = incomingUnitCost(input.reason, input.unitAmountCents, averageCents);
    ref = await insertMove({ ...base, batches: [], costCents: unitCostCents * input.quantity });

    let batchRef: string;
    try {
      batchRef = await insertWithRef(batchCollection, "BT-", 1001, (next) =>
        batchCollection.insertOne({
          ref: next,
          sku: item.sku,
          source: batchSourceFor(input.reason),
          receivedAt: now,
          quantityReceived: input.quantity,
          remaining: input.quantity,
          unitCostCents,
          supplier: input.reason === "Goods received" ? input.party.trim() || item.supplier : item.supplier,
          documentRef: input.documentRef.trim(),
          moveRef: ref,
          createdAt: now,
        }),
      );
    } catch (error) {
      await movesCollection.deleteOne({ ref });
      throw error;
    }

    await movesCollection.updateOne(
      { ref },
      { $set: { batches: [{ batchRef, quantity: input.quantity, unitCostCents }] } },
    );
    await itemsCollection.updateOne(
      { sku: item.sku },
      { $inc: { onHand: input.quantity }, $set: { updatedAt: now } },
    );
  }

  await refreshAverage(item.sku, now);

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
