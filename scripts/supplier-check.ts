/**
 * Suppliers and stock batches rehearsal.
 *
 *   npm run supplier:check
 *
 * Part one proves the batch arithmetic: stock is drawn oldest batch first, a
 * draw that spans batches costs each part at its own batch's price, stock on
 * hand is valued batch by batch, and a stock in opens its batch at the right
 * cost.
 *
 * Part two makes sure the batch indexes exist on the configured database (a
 * no-op when they do), proves the unique ref makes the opening-stock
 * conversion safe to repeat, and then reads every business's stock and
 * reports any item whose level disagrees with its batches. That last part
 * only reads; an item with no batches yet is converted the first time
 * someone opens Inventory, so it is listed separately rather than as drift.
 *
 * Not reached here: the DAL needs a signed-in session, so recording movements
 * through the screens is checked in the browser.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { STOCK_BATCH_INDEXES } from "@/lib/data/inventory";
import { SUPPLIER_INDEXES } from "@/lib/data/suppliers";
import { changePercent, compareParts, describeAge, planningCost, supplierNameKey } from "@/lib/suppliers";
import type { SupplierItem } from "@/types";
import {
  batchSourceFor,
  batchValue,
  drawCost,
  fifoOrder,
  incomingUnitCost,
  planDraw,
} from "@/lib/inventory-batches";

// ---- Part one: batch arithmetic ------------------------------------------------

const day = (n: number) => new Date(2026, 8, n, 9);
const batches = [
  { ref: "BT-1003", remaining: 10, unitCostCents: 54_000, receivedAt: day(20) },
  { ref: "BT-1001", remaining: 4, unitCostCents: 50_000, receivedAt: day(2) },
  { ref: "BT-1002", remaining: 0, unitCostCents: 47_000, receivedAt: day(10) },
];

assert.deepEqual(
  fifoOrder(batches).map((batch) => batch.ref),
  ["BT-1001", "BT-1003"],
  "oldest first, and an empty batch is skipped",
);

const draw = planDraw(batches, 6);
assert.deepEqual(draw.draws, [
  { batchRef: "BT-1001", quantity: 4, unitCostCents: 50_000 },
  { batchRef: "BT-1003", quantity: 2, unitCostCents: 54_000 },
]);
assert.equal(draw.short, 0);
assert.equal(drawCost(draw.draws), 4 * 50_000 + 2 * 54_000, "a draw across batches costs each part at its own price");

assert.equal(planDraw(batches, 3).draws.length, 1, "a small draw stays in the oldest batch");
assert.equal(planDraw(batches, 20).short, 6, "what the batches cannot cover is reported, not invented");

const sameDay = [
  { ref: "BT-1010", remaining: 1, unitCostCents: 1, receivedAt: day(5) },
  { ref: "BT-999", remaining: 1, unitCostCents: 1, receivedAt: day(5) },
];
assert.equal(fifoOrder(sameDay)[0].ref, "BT-999", "a tie on time falls back to ref order, numerically");

const value = batchValue(batches);
assert.equal(value.onHand, 14);
assert.equal(value.valueCents, 4 * 50_000 + 10 * 54_000, "valued batch by batch");
assert.equal(value.averageCents, Math.round((4 * 50_000 + 10 * 54_000) / 14));
assert.equal(batchValue([]).averageCents, null, "no stock, no average");

assert.equal(incomingUnitCost("Goods received", 60_000, 50_000), 60_000, "goods received carries the cost paid");
assert.equal(incomingUnitCost("Customer return", 90_000, 50_000), 50_000, "a return's amount is a credit, so it comes back at the average");
assert.equal(incomingUnitCost("Transfer in", 0, 50_000), 50_000, "an internal move comes in at the average");
assert.equal(batchSourceFor("Goods received"), "goods-received");
assert.equal(batchSourceFor("Cycle count correction"), "count-correction");

console.log("✓ oldest batch first; costs per batch; value batch by batch; incoming cost by reason");

// ---- Part one, continued: supplier costs ------------------------------------------

assert.equal(supplierNameKey("Davao Auto Parts, Inc."), supplierNameKey("davao  auto parts inc"), "one supplier however it is typed");

const entry = (ref: string, supplierName: string, costCents: number, extra: Partial<SupplierItem> = {}): SupplierItem => ({
  ref,
  supplierRef: `SP-${ref}`,
  supplierName,
  description: "Injector washer",
  sku: "SKU-1001",
  itemName: "Injector washer",
  unit: "pc",
  costCents,
  costSource: "typed",
  costDay: "",
  costUpdatedAt: "2026-09-01T00:00:00.000Z",
  costAgeDays: 30,
  preferred: false,
  ...extra,
});

const parts = compareParts([
  entry("1", "Supplier A", 50_000, { costUpdatedAt: "2026-09-20T00:00:00.000Z" }),
  entry("2", "Supplier B", 46_000, { costUpdatedAt: "2025-09-01T00:00:00.000Z", costAgeDays: 400 }),
  entry("3", "Supplier C", 52_000, { sku: null, description: "Turbo gasket" }),
  entry("4", "Supplier D", 51_000, { sku: null, description: "TURBO  GASKET!" }),
]);
assert.equal(parts.length, 2, "linked entries group by item, unlinked ones by wording");
const washer = parts.find((part) => part.sku === "SKU-1001")!;
assert.deepEqual(washer.entries.map((item) => item.supplierName), ["Supplier B", "Supplier A"], "cheapest first");
assert.equal(planningCost(washer)?.supplierName, "Supplier A", "with none preferred, the most recently confirmed cost is planned with, not a year-old cheap one");
const preferredWasher = compareParts([entry("1", "Supplier A", 50_000), entry("2", "Supplier B", 46_000, { preferred: true })])[0];
assert.equal(planningCost(preferredWasher)?.supplierName, "Supplier B", "a preferred supplier wins");

assert.equal(changePercent(50_000, 54_000), 8);
assert.equal(changePercent(50_000, 45_000), -10);
assert.equal(changePercent(null, 45_000), null, "a first cost is not a change");
assert.equal(describeAge(0), "today");
assert.equal(describeAge(21), "3 weeks old");
assert.equal(describeAge(95), "3 months old");

console.log("✓ supplier names match however typed; comparison groups; planning cost; change and age wording");

// ---- Part two: the database -----------------------------------------------------

const mongo = await new MongoClient(process.env.MONGODB_URI!).connect();
const db = mongo.db(process.env.MONGODB_DB_NAME!);
const businessId = `SUPPLIER-CHECK-${randomUUID().slice(0, 8)}`;

try {
  for (const index of STOCK_BATCH_INDEXES) {
    await db.collection("stockBatches").createIndex(index.keys, index.options ?? {});
  }
  console.log(`✓ ${STOCK_BATCH_INDEXES.length} batch indexes present on ${process.env.MONGODB_DB_NAME}`);
  for (const index of SUPPLIER_INDEXES) {
    await db.collection(index.collection).createIndex(index.keys, index.options ?? {});
  }
  console.log(`✓ ${SUPPLIER_INDEXES.length} supplier indexes present`);

  const supplierCollection = db.collection("suppliers");
  await supplierCollection.insertOne({ businessId, ref: "SP-1001", nameKey: supplierNameKey("Davao Auto Parts") });
  await assert.rejects(
    supplierCollection.insertOne({ businessId, ref: "SP-1002", nameKey: supplierNameKey("DAVAO AUTO PARTS.") }),
    (error: { code?: number }) => error.code === 11000,
    "one supplier record per name",
  );
  const itemCollection = db.collection("supplierItems");
  await itemCollection.insertOne({ businessId, ref: "SI-1001", supplierRef: "SP-1001", key: "injector washer" });
  await assert.rejects(
    itemCollection.insertOne({ businessId, ref: "SI-1002", supplierRef: "SP-1001", key: "injector washer" }),
    (error: { code?: number }) => error.code === 11000,
    "one price-book entry per wording per supplier",
  );
  await itemCollection.insertOne({ businessId, ref: "SI-1003", supplierRef: "SP-2001", key: "injector washer" });
  console.log("✓ one supplier per name; one entry per wording per supplier, and other suppliers may sell the same part");

  // The conversion's own write, run twice at once: one opening batch results.
  const collection = db.collection("stockBatches");
  const opening = () =>
    collection.updateOne(
      { businessId, ref: "OPEN-SKU-1" },
      { $setOnInsert: { sku: "SKU-1", source: "opening", remaining: 5, quantityReceived: 5, unitCostCents: 100 } },
      { upsert: true },
    );
  const outcomes = await Promise.allSettled([opening(), opening()]);
  // A simultaneous pair may lose the race with a duplicate-key error; either way only one batch exists.
  for (const outcome of outcomes) {
    if (outcome.status === "rejected") assert.equal((outcome.reason as { code?: number }).code, 11000);
  }
  await opening();
  assert.equal(await collection.countDocuments({ businessId }), 1, "converting twice leaves one opening batch");

  // The guarded decrement the stock out uses: the second taker of the last unit is refused.
  const take = () => collection.updateOne({ businessId, ref: "OPEN-SKU-1", remaining: { $gte: 5 } }, { $inc: { remaining: -5 } });
  const [first, second] = await Promise.all([take(), take()]);
  assert.equal(first.modifiedCount + second.modifiedCount, 1, "two takers cannot both empty a batch");
  console.log("✓ opening stock converts once; a batch cannot be over-drawn");

  // Read-only: every business's levels against their batches.
  const items = await db
    .collection("inventoryItems")
    .find({ businessId: { $not: /CHECK/ } }, { projection: { businessId: 1, sku: 1, name: 1, onHand: 1 } })
    .toArray();
  const sums = await db
    .collection("stockBatches")
    .aggregate([
      { $match: { businessId: { $not: /CHECK/ } } },
      { $group: { _id: { businessId: "$businessId", sku: "$sku" }, remaining: { $sum: "$remaining" } } },
    ])
    .toArray();
  const remaining = new Map(sums.map((row) => [`${row._id.businessId}:${row._id.sku}`, row.remaining as number]));

  const drift: string[] = [];
  let unconverted = 0;
  let matched = 0;
  for (const item of items) {
    const key = `${item.businessId}:${item.sku}`;
    if (!remaining.has(key)) {
      if (item.onHand > 0) unconverted += 1;
      continue;
    }
    if (remaining.get(key) === item.onHand) {
      matched += 1;
    } else {
      drift.push(`${item.businessId} ${item.sku} ${item.name}: level ${item.onHand}, batches ${remaining.get(key)}`);
    }
  }
  if (drift.length > 0) {
    console.log(`! ${drift.length} items disagree with their batches:`);
    for (const line of drift) console.log(`  ${line}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${matched} ${matched === 1 ? "item matches its" : "items match their"} batches`);
  }
  if (unconverted > 0) {
    console.log(`  ${unconverted} stocked items have no batches yet; they convert when Inventory is next opened`);
  }
} finally {
  for (const name of ["stockBatches", "suppliers", "supplierItems", "supplierCosts"]) {
    await db.collection(name).deleteMany({ businessId });
  }
  await mongo.close();
}

console.log("✓ test records removed");
