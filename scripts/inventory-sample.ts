/**
 * Clears one business's Inventory and purchasing records and loads sample
 * stock taken from the owner's COSTING RECORDS sheet (October 2026): real
 * parts, suppliers, PO booklet numbers and supplier invoice numbers, with
 * jobs drawing stock oldest batch first.
 *
 *   npm run inventory:sample -- --confirm --backup=<file.json> [--business=BIZ-1001]
 *
 * Development only: it refuses any database that is not on this machine, and
 * does nothing without --confirm. Everything it deletes is written to the
 * backup file first.
 *
 * Deleted for the business: inventoryItems, stockMoves, stockBatches, the
 * inventory entries in transactions, receipts, purchaseOrders, supplierItems
 * and supplierCosts. Supplier records and finance bills are kept; a bill made
 * from a deleted receipt keeps its receiptRef.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { MongoClient } from "mongodb";
import { descriptionKey } from "@/lib/quotations";
import { supplierNameKey } from "@/lib/suppliers";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME;
if (!uri || !dbName) {
  console.error("Missing MONGODB_URI or MONGODB_DB_NAME.");
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3).trim() || null;
const host = uri.replace(/^mongodb(\+srv)?:\/\/([^@]*@)?/, "").split(/[/?,]/)[0];

if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) {
  console.error(`Refusing: ${host} is not a local database. This script is for development only.`);
  process.exit(1);
}
if (!args.includes("--confirm")) {
  console.error("Nothing done. Add --confirm to clear and reload the sample Inventory.");
  process.exit(1);
}
const backupPath = flag("backup");
if (!backupPath) {
  console.error("Add --backup=<file.json>: everything deleted is written there first.");
  process.exit(1);
}
const businessId = flag("business") ?? "BIZ-1001";

// ---- The sample, from the sheet ---------------------------------------------------

/** A time in Davao on a day of the sheet. */
const at = (day: string, hour: number, minute = 0) =>
  new Date(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`);

/** Shop markup on parts sold, as in the quotation settings. */
const MARKUP = 1.5;

interface Delivery {
  day: string;
  hour: number;
  /** Null for stock that was on the shelf before PO numbers were recorded. */
  po: string | null;
  invoice: string;
  qty: number;
  cost: number;
}

interface Job {
  day: string;
  hour: number;
  dr: string;
  plate: string;
  customer: string;
  qty: number;
}

interface SampleItem {
  sku: string;
  name: string;
  category: string;
  icon: string;
  unit: string;
  location: string;
  supplier: string;
  target: number;
  reorder: number;
  deliveries: Delivery[];
  jobs: Job[];
}

const ITEMS: SampleItem[] = [
  {
    sku: "SKU-5001", name: "Oil filter C-110", category: "Filters", icon: "layers", unit: "pcs",
    location: "Store · S2", supplier: "Sanden", target: 15, reorder: 5,
    deliveries: [
      { day: "2026-10-03", hour: 10, po: "37332", invoice: "4819", qty: 5, cost: 155 },
      { day: "2026-10-15", hour: 11, po: "37415", invoice: "4963", qty: 5, cost: 155 },
      { day: "2026-10-19", hour: 10, po: "37448", invoice: "5015", qty: 2, cost: 155 },
      { day: "2026-10-22", hour: 14, po: "37479", invoice: "5057", qty: 5, cost: 155 },
    ],
    jobs: [
      { day: "2026-10-05", hour: 14, dr: "7411", plate: "VIOS / LAQ-3092", customer: "Bacante", qty: 1 },
      { day: "2026-10-09", hour: 15, dr: "7445", plate: "XPANDER / LAM-1827", customer: "Teofilio", qty: 1 },
      { day: "2026-10-10", hour: 13, dr: "7458", plate: "ERTIGA / NGN-3395", customer: "Teresa", qty: 1 },
      { day: "2026-10-13", hour: 10, dr: "7470", plate: "FORTUNER / LCV-4855", customer: "Osama", qty: 1 },
      { day: "2026-10-14", hour: 9, dr: "7478", plate: "MIRAGE / LAK-1887", customer: "Bumagat", qty: 1 },
      { day: "2026-10-16", hour: 11, dr: "7495", plate: "ALMERA / LAI-1752", customer: "Gesulga", qty: 1 },
      { day: "2026-10-17", hour: 15, dr: "7555", plate: "HONDA / ABC-3472", customer: "Peralta", qty: 1 },
    ],
  },
  {
    sku: "SKU-5002", name: "Oil filter C-415", category: "Filters", icon: "layers", unit: "pcs",
    location: "Store · S2", supplier: "Sanden", target: 12, reorder: 4,
    deliveries: [
      { day: "2026-10-03", hour: 10, po: "37332", invoice: "4819", qty: 5, cost: 165 },
      { day: "2026-10-15", hour: 11, po: "37415", invoice: "4963", qty: 5, cost: 165 },
      { day: "2026-10-19", hour: 10, po: "37448", invoice: "5015", qty: 2, cost: 165 },
    ],
    jobs: [
      { day: "2026-10-07", hour: 10, dr: "7427", plate: "MIRAGE / LAB-9220", customer: "Mendoza", qty: 1 },
      { day: "2026-10-09", hour: 11, dr: "7437", plate: "VIOS / KAC-5792", customer: "Tomada", qty: 1 },
      { day: "2026-10-12", hour: 14, dr: "7462", plate: "T.RAIZE / LAK-1541", customer: "Grace", qty: 1 },
      { day: "2026-10-13", hour: 15, dr: "7472", plate: "XPANDER / NFU-2738", customer: "Trinidad", qty: 1 },
      { day: "2026-10-15", hour: 9, dr: "7481", plate: "MIRAGE / LAP-3067", customer: "Calumag", qty: 1 },
      { day: "2026-10-20", hour: 13, dr: "7596", plate: "CHERRY TIGGO / LAI-1972", customer: "Francis", qty: 1 },
    ],
  },
  {
    sku: "SKU-5003", name: "Oil filter C-806", category: "Filters", icon: "layers", unit: "pcs",
    location: "Store · S2", supplier: "Sanden", target: 8, reorder: 3,
    deliveries: [
      { day: "2026-10-03", hour: 10, po: "37332", invoice: "4819", qty: 2, cost: 170 },
      { day: "2026-10-15", hour: 11, po: "37415", invoice: "4963", qty: 4, cost: 170 },
    ],
    jobs: [
      { day: "2026-10-08", hour: 10, dr: "7430", plate: "TERRA / LAI-3998", customer: "Navales", qty: 1 },
      { day: "2026-10-13", hour: 16, dr: "7501", plate: "HILUX / LAK-1453", customer: "Sumifru", qty: 1 },
    ],
  },
  {
    sku: "SKU-5004", name: "Oil filter C-111", category: "Filters", icon: "layers", unit: "pcs",
    location: "Store · S2", supplier: "Sanden", target: 8, reorder: 3,
    deliveries: [{ day: "2026-10-19", hour: 10, po: "37448", invoice: "5015", qty: 5, cost: 175 }],
    jobs: [],
  },
  {
    sku: "SKU-5005", name: "Oil filter C-231", category: "Filters", icon: "layers", unit: "pcs",
    location: "Store · S2", supplier: "Sanden", target: 6, reorder: 2,
    deliveries: [{ day: "2026-10-22", hour: 14, po: "37479", invoice: "5057", qty: 3, cost: 260 }],
    jobs: [],
  },
  {
    sku: "SKU-5006", name: "Fuel filter F-197", category: "Filters", icon: "layers", unit: "pcs",
    location: "Store · S2", supplier: "Sanden", target: 6, reorder: 2,
    deliveries: [
      { day: "2026-10-03", hour: 10, po: "37332", invoice: "4819", qty: 3, cost: 495 },
      { day: "2026-10-22", hour: 14, po: "37479", invoice: "5057", qty: 2, cost: 495 },
    ],
    jobs: [
      { day: "2026-10-14", hour: 13, dr: "7479", plate: "ERTIGA / MAK-8941", customer: "Robert", qty: 1 },
      { day: "2026-10-21", hour: 10, dr: "7586", plate: "NAVARA / LAG-5493", customer: "Raya", qty: 1 },
      { day: "2026-10-24", hour: 15, dr: "7614", plate: "DMAX / LAK-9351", customer: "Bajao", qty: 1 },
    ],
  },
  {
    sku: "SKU-5007", name: "Fuel filter F-244 (Nissan)", category: "Filters", icon: "layers", unit: "pcs",
    location: "Store · S2", supplier: "Sanden", target: 4, reorder: 1,
    deliveries: [{ day: "2026-10-22", hour: 14, po: "37484", invoice: "5056", qty: 3, cost: 685 }],
    jobs: [],
  },
  {
    sku: "SKU-5008", name: "Motul 5W30 engine oil", category: "Fluids", icon: "package", unit: "liters",
    location: "Store · S1", supplier: "Dansons Motul", target: 60, reorder: 15,
    deliveries: [{ day: "2026-10-27", hour: 10, po: "37481", invoice: "1139", qty: 60, cost: 625 }],
    jobs: [{ day: "2026-10-28", hour: 11, dr: "7514", plate: "HILUX / MAV-7790", customer: "Sumifru", qty: 4 }],
  },
  {
    sku: "SKU-5009", name: "Coolant green", category: "Fluids", icon: "package", unit: "pcs",
    location: "Store · S1", supplier: "Global Synergy", target: 24, reorder: 6,
    deliveries: [{ day: "2026-10-26", hour: 9, po: "37482", invoice: "66204", qty: 24, cost: 188.51 }],
    jobs: [{ day: "2026-10-26", hour: 15, dr: "7516", plate: "JIMNY / LAF-2380", customer: "Sumifru", qty: 2 }],
  },
  {
    sku: "SKU-5010", name: "Coolant pink", category: "Fluids", icon: "package", unit: "pcs",
    location: "Store · S1", supplier: "Dansons Total", target: 24, reorder: 6,
    deliveries: [{ day: "2026-10-27", hour: 10, po: "37481", invoice: "1140", qty: 24, cost: 209.03 }],
    jobs: [{ day: "2026-10-28", hour: 11, dr: "7514", plate: "HILUX / MAV-7790", customer: "Sumifru", qty: 2 }],
  },
  {
    sku: "SKU-5011", name: "Brake cleaner", category: "Consumables", icon: "shield-check", unit: "cans",
    location: "Workshop · W1", supplier: "Sanden", target: 24, reorder: 6,
    deliveries: [{ day: "2026-10-23", hour: 9, po: "37480", invoice: "5066", qty: 24, cost: 170 }],
    jobs: [
      { day: "2026-10-23", hour: 15, dr: "7598", plate: "XPANDER / LAA-8788", customer: "Arjayson", qty: 2 },
      { day: "2026-10-24", hour: 14, dr: "7601", plate: "MONTERO / GAC-6568", customer: "Yuri", qty: 2 },
      { day: "2026-10-28", hour: 11, dr: "7514", plate: "HILUX / MAV-7790", customer: "Sumifru", qty: 3 },
    ],
  },
  {
    sku: "SKU-5012", name: "Gasket all", category: "Consumables", icon: "package", unit: "pcs",
    location: "Workshop · W1", supplier: "Athren", target: 12, reorder: 4,
    deliveries: [
      // On the shelf before PO numbers were recorded: shows as "No PO".
      { day: "2026-09-30", hour: 9, po: null, invoice: "", qty: 4, cost: 60 },
      { day: "2026-10-17", hour: 10, po: "37433", invoice: "27739", qty: 10, cost: 60 },
    ],
    jobs: [{ day: "2026-10-20", hour: 11, dr: "7574", plate: "STRADA / NFT-7563", customer: "Agrimarine", qty: 2 }],
  },
  {
    sku: "SKU-5013", name: "ATF T-IV", category: "Fluids", icon: "package", unit: "gallons",
    location: "Store · S1", supplier: "Athren", target: 4, reorder: 1,
    deliveries: [
      { day: "2026-10-17", hour: 9, po: "37434", invoice: "27736", qty: 3, cost: 1970 },
      { day: "2026-10-21", hour: 9, po: "37466", invoice: "27657", qty: 2, cost: 1970 },
    ],
    jobs: [
      { day: "2026-10-17", hour: 14, dr: "7510", plate: "HILUX / WQN-723", customer: "Sumifru", qty: 3 },
      { day: "2026-10-21", hour: 14, dr: "7507", plate: "FORTUNER / LHF-407", customer: "Sumifru", qty: 2 },
    ],
  },
  {
    sku: "SKU-5014", name: "Brake pads (Hilux)", category: "Brake parts", icon: "truck", unit: "sets",
    location: "Workshop · W3", supplier: "Sanden", target: 2, reorder: 1,
    deliveries: [
      { day: "2026-10-19", hour: 9, po: "37445", invoice: "5014", qty: 1, cost: 1300 },
      { day: "2026-10-28", hour: 9, po: "37501", invoice: "5118", qty: 1, cost: 1300 },
    ],
    jobs: [
      { day: "2026-10-19", hour: 15, dr: "7557", plate: "HILUX / NII-8296", customer: "RGS", qty: 1 },
      { day: "2026-10-28", hour: 15, dr: "7514", plate: "HILUX / MAV-7790", customer: "Sumifru", qty: 1 },
    ],
  },
];

// ---- Build documents: every movement in time order, jobs drawing oldest first -----

const cents = (pesos: number) => Math.round(pesos * 100);
const now = new Date();

type Doc = Record<string, unknown>;
const items: Doc[] = [];
const moves: Doc[] = [];
const batches: Doc[] = [];
const ledger: Doc[] = [];

interface Event {
  item: SampleItem;
  when: Date;
  delivery?: Delivery;
  job?: Job;
}

const events: Event[] = ITEMS.flatMap((item) => [
  ...item.deliveries.map((delivery) => ({ item, when: at(delivery.day, delivery.hour), delivery })),
  // A job on the day of a delivery comes after it.
  ...item.jobs.map((job) => ({ item, when: at(job.day, job.hour, 30), job })),
]).sort((a, b) => a.when.getTime() - b.when.getTime() || a.item.sku.localeCompare(b.item.sku));

let moveNo = 1001;
let batchNo = 1001;
const open = new Map<string, Doc[]>();
const lastTouched = new Map<string, Date>();

for (const event of events) {
  const { item, when } = event;
  const stock = open.get(item.sku) ?? [];
  open.set(item.sku, stock);
  lastTouched.set(item.sku, when);

  if (event.delivery) {
    const delivery = event.delivery;
    const unitCostCents = cents(delivery.cost);
    if (delivery.po === null) {
      // Opening stock: no movement, as the app makes it.
      const batch: Doc = {
        businessId, ref: `OPEN-${item.sku}`, sku: item.sku, source: "opening", receivedAt: when,
        quantityReceived: delivery.qty, remaining: delivery.qty, unitCostCents, supplier: item.supplier,
        documentRef: "", moveRef: null, createdAt: now,
      };
      batches.push(batch);
      stock.push(batch);
      continue;
    }
    const moveRef = `MV-${moveNo++}`;
    const batchRef = `BT-${batchNo++}`;
    const documentRef = delivery.invoice ? `Inv. ${delivery.invoice}` : "";
    moves.push({
      businessId, ref: moveRef, sku: item.sku, kind: "in", quantity: delivery.qty, reason: "Goods received",
      documentRef, poNumber: delivery.po, party: item.supplier, unitAmountCents: unitCostCents,
      amountCents: unitCostCents * delivery.qty, createdItem: false,
      batches: [{ batchRef, quantity: delivery.qty, unitCostCents }], costCents: unitCostCents * delivery.qty,
      occurredAt: when, createdAt: now,
    });
    const batch: Doc = {
      businessId, ref: batchRef, sku: item.sku, source: "goods-received", receivedAt: when,
      quantityReceived: delivery.qty, remaining: delivery.qty, unitCostCents, supplier: item.supplier,
      documentRef, poNumber: delivery.po, moveRef, createdAt: now,
    };
    batches.push(batch);
    stock.push(batch);
    continue;
  }

  const job = event.job!;
  let left = job.qty;
  const draws: { batchRef: string; quantity: number; unitCostCents: number }[] = [];
  for (const batch of stock) {
    if (left === 0) break;
    const take = Math.min(left, batch.remaining as number);
    if (take === 0) continue;
    batch.remaining = (batch.remaining as number) - take;
    draws.push({ batchRef: batch.ref as string, quantity: take, unitCostCents: batch.unitCostCents as number });
    left -= take;
  }
  if (left > 0) throw new Error(`${item.name}: the job on ${job.day} takes more than is on hand.`);

  const costCents = draws.reduce((sum, draw) => sum + draw.quantity * draw.unitCostCents, 0);
  // Priced at the shop markup over what the units cost, rounded to the peso.
  const unitPriceCents = Math.round((draws[0].unitCostCents * MARKUP) / 100) * 100;
  const moveRef = `MV-${moveNo++}`;
  moves.push({
    businessId, ref: moveRef, sku: item.sku, kind: "out", quantity: job.qty, reason: "Picked for booking",
    documentRef: `DR ${job.dr} · ${job.plate}`, poNumber: "", party: job.customer, unitAmountCents: unitPriceCents,
    amountCents: unitPriceCents * job.qty, createdItem: false, batches: draws, costCents,
    occurredAt: when, createdAt: now,
  });
  ledger.push({
    businessId, source: "inventory", sourceRef: moveRef, occurredAt: when, amountCents: unitPriceCents * job.qty,
    description: `${item.name} × ${job.qty} · ${job.customer}`, status: "recognised", createdAt: now, updatedAt: now,
  });
}

for (const item of ITEMS) {
  const stock = open.get(item.sku) ?? [];
  const onHand = stock.reduce((sum, batch) => sum + (batch.remaining as number), 0);
  const value = stock.reduce((sum, batch) => sum + (batch.remaining as number) * (batch.unitCostCents as number), 0);
  const last = stock[stock.length - 1];
  items.push({
    businessId, sku: item.sku, name: item.name, category: item.category, icon: item.icon, onHand,
    target: item.target, reorder: item.reorder, unit: item.unit, location: item.location, supplier: item.supplier,
    unitCostCents: onHand > 0 ? Math.round(value / onHand) : (last?.unitCostCents as number) ?? 0,
    createdAt: at("2026-09-30", 8), updatedAt: lastTouched.get(item.sku) ?? now,
  });
}

// ---- Run -----------------------------------------------------------------------------

const CLEARED = [
  { name: "inventoryItems", filter: {} },
  { name: "stockMoves", filter: {} },
  { name: "stockBatches", filter: {} },
  { name: "transactions", filter: { source: "inventory" } },
  { name: "receipts", filter: {} },
  { name: "purchaseOrders", filter: {} },
  { name: "supplierItems", filter: {} },
  { name: "supplierCosts", filter: {} },
];

async function main() {
  const client = await new MongoClient(uri!).connect();
  const db = client.db(dbName);
  try {
    const business = await db.collection("businesses").findOne({ businessId });
    if (!business) throw new Error(`${businessId} is not a business in ${dbName}.`);

    // 1. Back up everything that is about to go.
    const backup: Record<string, unknown[]> = {};
    for (const { name, filter } of CLEARED) {
      backup[name] = await db.collection(name).find({ businessId, ...filter }).toArray();
    }
    const file = resolve(backupPath!);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ businessId, takenAt: new Date(), db: dbName, collections: backup }, null, 2));
    console.log(`✓ backup of ${business.name} (${businessId}) written to ${file}`);
    for (const [name, docs] of Object.entries(backup)) console.log(`    ${name.padEnd(16)} ${docs.length}`);

    // 2. Clear.
    for (const { name, filter } of CLEARED) {
      await db.collection(name).deleteMany({ businessId, ...filter });
    }
    console.log("✓ cleared");

    // 3. Suppliers named on the sheet, added only when the business has none by that name.
    const supplierRefs = new Map<string, string>();
    const existing = await db.collection("suppliers").find({ businessId }).toArray();
    let supplierNo = existing.reduce((max, doc) => Math.max(max, Number(String(doc.ref).replace("SP-", "")) || 0), 1000);
    for (const name of [...new Set(ITEMS.map((item) => item.supplier))]) {
      const found = existing.find((doc) => doc.nameKey === supplierNameKey(name));
      if (found) {
        supplierRefs.set(name, found.ref as string);
        continue;
      }
      const ref = `SP-${++supplierNo}`;
      await db.collection("suppliers").insertOne({
        businessId, ref, name, nameKey: supplierNameKey(name), contactPerson: "", phone: "", email: "", terms: "",
        leadTimeDays: null, notes: "From the COSTING RECORDS sheet.", active: true, createdAt: now, updatedAt: now,
      });
      supplierRefs.set(name, ref);
    }

    // 4. Price book: what each supplier last charged for each part, linked to the item.
    const supplierItems: Doc[] = [];
    const supplierCosts: Doc[] = [];
    let itemNo = 1001;
    for (const item of ITEMS) {
      const bought = item.deliveries.filter((delivery) => delivery.po !== null);
      const latest = bought[bought.length - 1];
      if (!latest) continue;
      const ref = `SI-${itemNo++}`;
      const supplierRef = supplierRefs.get(item.supplier)!;
      supplierItems.push({
        businessId, ref, supplierRef, description: item.name, key: descriptionKey(item.name), sku: item.sku,
        unit: item.unit, costCents: cents(latest.cost), costSource: "purchase",
        costUpdatedAt: at(latest.day, latest.hour), preferred: true, createdAt: at(bought[0].day, bought[0].hour),
      });
      supplierCosts.push({
        businessId, itemRef: ref, supplierRef, sku: item.sku, description: item.name, costCents: cents(bought[0].cost),
        previousCents: null, source: "purchase", documentRef: `PO ${bought[0].po} · Inv. ${bought[0].invoice}`,
        at: at(bought[0].day, bought[0].hour),
      });
    }

    // 5. Load.
    await db.collection("inventoryItems").insertMany(items);
    await db.collection("stockMoves").insertMany(moves);
    await db.collection("stockBatches").insertMany(batches);
    if (ledger.length) await db.collection("transactions").insertMany(ledger);
    await db.collection("supplierItems").insertMany(supplierItems);
    await db.collection("supplierCosts").insertMany(supplierCosts);

    const ins = moves.filter((move) => move.kind === "in").length;
    console.log(
      `✓ loaded ${items.length} items · ${batches.length} batches · ${ins} deliveries with a PO No. · ` +
        `${moves.length - ins} jobs · ${ledger.length} ledger entries · ${supplierRefs.size} suppliers · ` +
        `${supplierItems.length} price-book entries`,
    );
    for (const item of items) {
      const left = batches
        .filter((batch) => batch.sku === item.sku && (batch.remaining as number) > 0)
        .map((batch) => `${batch.poNumber ? `PO ${batch.poNumber}` : "No PO"}×${batch.remaining}`)
        .join(", ");
      console.log(`    ${String(item.sku)} ${String(item.name).padEnd(28)} ${String(item.onHand).padStart(3)} ${left}`);
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
