import "server-only";

import { formatDate } from "@/lib/fleet";
import { descriptionKey } from "@/lib/quotations";
import {
  UNRECORDED_SUPPLIERS,
  changePercent,
  supplierNameKey,
  wholeDaysBetween,
} from "@/lib/suppliers";
import { listInventory } from "./inventory";
import { InputError, insertWithRef, isDuplicateKey } from "./refs";
import { tenantScope } from "./tenant";
import type {
  CostSource,
  InventoryItemDocument,
  InventoryOption,
  Supplier,
  SupplierCostChange,
  SupplierCostDocument,
  SupplierDocument,
  SupplierImportCandidate,
  SupplierInput,
  SupplierItem,
  SupplierItemDocument,
  SupplierItemInput,
  SupplierSummary,
} from "@/types";

/**
 * Suppliers, their price book and its history. All three are tenant
 * collections reached only through `tenantScope`. The price book is written
 * only through `recordCost`, so every cost change, whoever makes it, lands in
 * the history the same way.
 */
const suppliers = () => tenantScope<SupplierDocument>("suppliers");
const supplierItems = () => tenantScope<SupplierItemDocument>("supplierItems");
const supplierCosts = () => tenantScope<SupplierCostDocument>("supplierCosts");
const inventoryItems = () => tenantScope<InventoryItemDocument>("inventoryItems");

function toSupplier(doc: SupplierDocument): Supplier {
  return {
    ref: doc.ref,
    name: doc.name,
    contactPerson: doc.contactPerson,
    phone: doc.phone,
    email: doc.email,
    terms: doc.terms,
    leadTimeDays: doc.leadTimeDays,
    notes: doc.notes,
    active: doc.active,
  };
}

export async function listSupplierSummaries(): Promise<SupplierSummary[]> {
  const [supplierCollection, itemCollection] = await Promise.all([suppliers(), supplierItems()]);
  const [docs, counts] = await Promise.all([
    supplierCollection.find().sort({ name: 1 }).toArray(),
    itemCollection
      .aggregate([{ $group: { _id: "$supplierRef", count: { $sum: 1 }, latest: { $max: "$costUpdatedAt" } } }])
      .toArray(),
  ]);
  const bySupplier = new Map(counts.map((row) => [String(row._id), row]));
  return docs.map((doc) => {
    const row = bySupplier.get(doc.ref);
    return {
      ...toSupplier(doc),
      itemCount: (row?.count as number | undefined) ?? 0,
      lastCostDay: row?.latest ? formatDate(row.latest as Date) : null,
    };
  });
}

export async function findSupplier(ref: string): Promise<Supplier | null> {
  const collection = await suppliers();
  const doc = await collection.findOne({ ref });
  return doc ? toSupplier(doc) : null;
}

export async function createSupplier(input: SupplierInput): Promise<string> {
  const collection = await suppliers();
  const nameKey = supplierNameKey(input.name);
  const taken = await collection.findOne({ nameKey });
  if (taken) throw new InputError(`${taken.name} is already on file as ${taken.ref}.`);

  const now = new Date();
  try {
    return await insertWithRef(collection, "SP-", 1001, (ref) =>
      collection.insertOne({ ref, ...input, nameKey, active: true, createdAt: now, updatedAt: now }),
    );
  } catch (error) {
    if (isDuplicateKey(error, "nameKey")) throw new InputError(`A supplier named ${input.name} is already on file.`);
    throw error;
  }
}

export async function updateSupplier(ref: string, input: SupplierInput): Promise<void> {
  const collection = await suppliers();
  const nameKey = supplierNameKey(input.name);
  const taken = await collection.findOne({ nameKey, ref: { $ne: ref } });
  if (taken) throw new InputError(`${taken.name} is already on file as ${taken.ref}.`);
  const result = await collection.updateOne({ ref }, { $set: { ...input, nameKey, updatedAt: new Date() } });
  if (result.matchedCount === 0) throw new InputError(`${ref} is no longer on file.`);
}

/** A supplier the shop stopped using keeps its history; it is only set aside. */
export async function setSupplierActive(ref: string, active: boolean): Promise<void> {
  const collection = await suppliers();
  const result = await collection.updateOne({ ref }, { $set: { active, updatedAt: new Date() } });
  if (result.matchedCount === 0) throw new InputError(`${ref} is no longer on file.`);
}

// ---- Price book -------------------------------------------------------------------

export async function listSupplierItems(now = new Date()): Promise<SupplierItem[]> {
  const [itemCollection, supplierCollection, stockCollection] = await Promise.all([
    supplierItems(),
    suppliers(),
    inventoryItems(),
  ]);
  const [docs, supplierDocs, stock] = await Promise.all([
    itemCollection.find().sort({ description: 1 }).toArray(),
    supplierCollection.find({}).project<{ ref: string; name: string }>({ ref: 1, name: 1 }).toArray(),
    stockCollection.find({}).project<{ sku: string; name: string }>({ sku: 1, name: 1 }).toArray(),
  ]);
  const supplierName = new Map(supplierDocs.map((doc) => [doc.ref, doc.name]));
  const itemName = new Map(stock.map((doc) => [doc.sku, doc.name]));
  return docs.map((doc) => ({
    ref: doc.ref,
    supplierRef: doc.supplierRef,
    supplierName: supplierName.get(doc.supplierRef) ?? doc.supplierRef,
    description: doc.description,
    sku: doc.sku,
    itemName: doc.sku ? (itemName.get(doc.sku) ?? null) : null,
    unit: doc.unit,
    costCents: doc.costCents,
    costSource: doc.costSource,
    costDay: formatDate(doc.costUpdatedAt),
    costUpdatedAt: doc.costUpdatedAt.toISOString(),
    costAgeDays: wholeDaysBetween(doc.costUpdatedAt, now),
    preferred: doc.preferred,
  }));
}

/**
 * The one writer of costs. Creates the supplier's entry for this wording, or
 * updates it, and writes a history line when the cost changed. The same cost
 * confirmed again only refreshes its date, so the history is a list of real
 * changes rather than of every receipt.
 *
 * Purchases and receipt photos (the next steps) call this too.
 */
export async function recordCost(input: {
  supplierRef: string;
  description: string;
  sku: string | null;
  unit: string;
  costCents: number;
  source: CostSource;
  documentRef?: string;
  /** Refuse instead of updating when the supplier already has this wording. */
  mustBeNew?: boolean;
}): Promise<string> {
  const supplier = await findSupplier(input.supplierRef);
  if (!supplier) throw new InputError("That supplier is no longer on file.");
  const key = descriptionKey(input.description);
  if (!key) throw new InputError("The part needs a description.");
  if (input.sku) await assertItemExists(input.sku);

  const [itemCollection, historyCollection] = await Promise.all([supplierItems(), supplierCosts()]);
  const now = new Date();
  const existing = await itemCollection.findOne({ supplierRef: input.supplierRef, key });

  if (existing && input.mustBeNew) {
    throw new InputError(`${supplier.name} already has “${existing.description}” in the price book. Change its cost instead.`);
  }

  let ref: string;
  let previous: number | null = null;
  if (existing) {
    ref = existing.ref;
    previous = existing.costCents;
    await itemCollection.updateOne(
      { ref },
      {
        $set: {
          costCents: input.costCents,
          costSource: input.source,
          costUpdatedAt: now,
          // A link or unit given now fills a gap; it never clears one already made.
          ...(input.sku ? { sku: input.sku } : {}),
          ...(input.unit ? { unit: input.unit } : {}),
        },
      },
    );
  } else {
    try {
      ref = await insertWithRef(itemCollection, "SI-", 1001, (next) =>
        itemCollection.insertOne({
          ref: next,
          supplierRef: input.supplierRef,
          description: input.description.trim(),
          key,
          sku: input.sku,
          unit: input.unit,
          costCents: input.costCents,
          costSource: input.source,
          costUpdatedAt: now,
          preferred: false,
          createdAt: now,
        }),
      );
    } catch (error) {
      if (isDuplicateKey(error, "key")) {
        throw new InputError(`${supplier.name} already has that part in the price book.`);
      }
      throw error;
    }
  }

  if (previous !== input.costCents) {
    await historyCollection.insertOne({
      itemRef: ref,
      supplierRef: input.supplierRef,
      sku: input.sku ?? existing?.sku ?? null,
      description: existing?.description ?? input.description.trim(),
      costCents: input.costCents,
      previousCents: previous,
      source: input.source,
      documentRef: input.documentRef ?? "",
      at: now,
    });
  }
  return ref;
}

export async function addSupplierItem(supplierRef: string, input: SupplierItemInput): Promise<string> {
  return recordCost({ supplierRef, ...input, source: "typed", mustBeNew: true });
}

export async function setItemCost(ref: string, costCents: number): Promise<void> {
  const collection = await supplierItems();
  const doc = await collection.findOne({ ref });
  if (!doc) throw new InputError("That price-book entry is no longer on file.");
  await recordCost({
    supplierRef: doc.supplierRef,
    description: doc.description,
    sku: doc.sku,
    unit: doc.unit,
    costCents,
    source: "typed",
  });
}

/** Wording, unit and the Inventory link. The cost changes only through `recordCost`. */
export async function updateSupplierItemDetails(
  ref: string,
  fields: { description: string; sku: string | null; unit: string },
): Promise<void> {
  const collection = await supplierItems();
  const doc = await collection.findOne({ ref });
  if (!doc) throw new InputError("That price-book entry is no longer on file.");
  const key = descriptionKey(fields.description);
  if (!key) throw new InputError("The part needs a description.");
  if (fields.sku) await assertItemExists(fields.sku);
  try {
    await collection.updateOne(
      { ref },
      { $set: { description: fields.description.trim(), key, sku: fields.sku, unit: fields.unit } },
    );
  } catch (error) {
    if (isDuplicateKey(error, "key")) throw new InputError("This supplier already has a part with that wording.");
    throw error;
  }
}

/**
 * Marks the supplier to buy a part from. One per part: the others for the same
 * Inventory item (or, unlinked, the same wording) are unmarked first.
 */
export async function setPreferredItem(ref: string, preferred: boolean): Promise<void> {
  const collection = await supplierItems();
  const doc = await collection.findOne({ ref });
  if (!doc) throw new InputError("That price-book entry is no longer on file.");
  if (preferred) {
    const siblings = doc.sku ? { sku: doc.sku } : { sku: null, key: doc.key };
    const marked = await collection.find({ ...siblings, preferred: true, ref: { $ne: ref } }).toArray();
    await Promise.all(marked.map((other) => collection.updateOne({ ref: other.ref }, { $set: { preferred: false } })));
  }
  await collection.updateOne({ ref }, { $set: { preferred } });
}

/** Removes the entry; its cost history is kept, since past quotations were priced from it. */
export async function deleteSupplierItem(ref: string): Promise<void> {
  const collection = await supplierItems();
  const result = await collection.deleteOne({ ref });
  if (result.deletedCount === 0) throw new InputError("That price-book entry is no longer on file.");
}

export async function listCostChanges(days = 120, now = new Date()): Promise<SupplierCostChange[]> {
  const [historyCollection, supplierCollection] = await Promise.all([supplierCosts(), suppliers()]);
  const since = new Date(now.getTime() - days * 86_400_000);
  const [docs, supplierDocs] = await Promise.all([
    historyCollection.find({ at: { $gte: since } }).sort({ at: -1 }).limit(500).toArray(),
    supplierCollection.find({}).project<{ ref: string; name: string }>({ ref: 1, name: 1 }).toArray(),
  ]);
  const supplierName = new Map(supplierDocs.map((doc) => [doc.ref, doc.name]));
  return docs.map((doc) => ({
    itemRef: doc.itemRef,
    supplierRef: doc.supplierRef,
    supplierName: supplierName.get(doc.supplierRef) ?? doc.supplierRef,
    description: doc.description,
    sku: doc.sku,
    costCents: doc.costCents,
    previousCents: doc.previousCents,
    changePercent: changePercent(doc.previousCents, doc.costCents),
    source: doc.source,
    documentRef: doc.documentRef,
    day: formatDate(doc.at),
    at: doc.at.toISOString(),
  }));
}

// ---- Inventory links --------------------------------------------------------------

async function assertItemExists(sku: string): Promise<void> {
  const collection = await inventoryItems();
  if (!(await collection.findOne({ sku }))) throw new InputError(`${sku} is not in Inventory.`);
}

export async function listInventoryOptions(): Promise<InventoryOption[]> {
  const collection = await inventoryItems();
  const docs = await collection.find({}).project<InventoryOption>({ sku: 1, name: 1, unit: 1, _id: 0 }).sort({ name: 1 }).toArray();
  return docs;
}

/** Supplier names typed into Inventory that have no supplier record yet. */
export async function listImportCandidates(): Promise<SupplierImportCandidate[]> {
  const [stockCollection, supplierCollection] = await Promise.all([inventoryItems(), suppliers()]);
  const [rows, known] = await Promise.all([
    stockCollection.aggregate([{ $group: { _id: "$supplier", count: { $sum: 1 } } }]).toArray(),
    supplierCollection.find({}).project<{ nameKey: string }>({ nameKey: 1 }).toArray(),
  ]);
  const onFile = new Set(known.map((doc) => doc.nameKey));
  return rows
    .map((row) => ({ name: String(row._id ?? "").trim(), itemCount: row.count as number }))
    .filter((row) => {
      const key = supplierNameKey(row.name);
      return !UNRECORDED_SUPPLIERS.has(key) && !onFile.has(key);
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Creates suppliers from Inventory's names. With `withItems`, each supplier's
 * Inventory items go into its price book at their current average cost,
 * linked, so the comparison starts populated rather than empty.
 */
export async function importSuppliers(
  names: string[],
  withItems: boolean,
): Promise<{ suppliers: number; items: number }> {
  const candidates = await listImportCandidates();
  const allowed = new Map(candidates.map((candidate) => [supplierNameKey(candidate.name), candidate.name]));
  const stock = withItems ? await listInventory() : [];
  let createdSuppliers = 0;
  let createdItems = 0;

  for (const name of names) {
    const original = allowed.get(supplierNameKey(name));
    if (!original) continue; // Already on file, or not an Inventory name.
    const ref = await createSupplier({
      name: original,
      contactPerson: "",
      phone: "",
      email: "",
      terms: "",
      leadTimeDays: null,
      notes: "Created from the supplier names in Inventory.",
    });
    createdSuppliers += 1;

    for (const item of stock.filter((entry) => supplierNameKey(entry.supplier) === supplierNameKey(original))) {
      if (item.unitCostCents <= 0) continue;
      await recordCost({
        supplierRef: ref,
        description: item.name,
        sku: item.sku,
        unit: item.unit,
        costCents: item.unitCostCents,
        source: "inventory",
      });
      createdItems += 1;
    }
  }
  return { suppliers: createdSuppliers, items: createdItems };
}
