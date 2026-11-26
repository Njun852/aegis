import "server-only";

import { formatStamp } from "@/lib/format";
import { jobOrderCosting, linesToTake, stockStateOf, usedForLabel, type BookingJob } from "@/lib/job-orders";
import { formatManilaStamp, formatPeso, priceItemKey } from "@/lib/quotations";
import { recordStockMove, returnJobStock } from "./inventory";
import { currentQuoteActor } from "./quotations";
import { InputError } from "./refs";
import { tenantScope } from "./tenant";
import type {
  JobOrder,
  JobOrderDocument,
  JobOrderEvent,
  JobOrderEventDocument,
  JobOrderEventKind,
  JobOrderLine,
  JobOrderLineView,
  JobOrderSummary,
  JobPartUse,
  PriceItemUse,
  QuoteBillTo,
  QuoteLine,
  QuoteVehicle,
} from "@/types";

/**
 * Job orders: the work a customer approved, made from a quotation by
 * `convertToJobOrder` (`./quotations`) and never typed in from scratch.
 *
 * A job order carries no money of its own into the ledger. The sale is the
 * booking's, recorded once; a job order without a booking records no sale
 * yet, which is for invoicing to do. That is what keeps a converted
 * quotation from counting twice.
 *
 * Nor does it have progress of its own (20 Nov 2026): it is the record of
 * the agreed work, with no start or complete; the booking moves itself. When
 * its quotation is changed afterwards, the job order follows it and its
 * history says what changed (`syncJobOrderWithQuotation`).
 *
 * Its parts do leave Inventory: each line linked to an Inventory item takes
 * its units when the job order is made, oldest batch first, and the cost of
 * those batches becomes the line's actual cost. Cancelling puts them back.
 */
const jobOrders = () => tenantScope<JobOrderDocument>("jobOrders");

/** A claim older than this is from a request that died; another may take over. */
const STALE_CLAIM_MS = 2 * 60 * 1000;

function lineView(line: JobOrderLine): JobOrderLineView {
  const stockState = stockStateOf(line);
  const stock = line.stock ?? null;
  let stockNote: string | null = null;
  if (stock && stockState === "taken") stockNote = `${stock.moveRef} · ${formatStamp(stock.takenAt)}`;
  if (stock && stockState === "returned") stockNote = `Put back in stock · ${stock.returnMoveRef}`;
  return {
    id: line.id,
    section: line.section,
    description: line.description,
    qty: line.qty,
    unit: line.unit,
    unitPriceCents: line.unitPriceCents,
    quotedCostCents: line.quotedCostCents,
    sku: line.sku,
    stockState,
    actualCostCents: stock && stockState === "taken" ? stock.costCents : null,
    stockNote,
    // Only parts are ticked off (25 Nov 2026); a labor tick saved before then is not shown.
    checked: line.section === "parts" && (line.checked ?? false),
    supplierName: line.supplierName ?? "",
    supplierRef: line.supplierRef ?? null,
    boughtCostCents: line.boughtCostCents ?? null,
  };
}

function toJobOrder(doc: JobOrderDocument): JobOrder {
  const costing = jobOrderCosting(doc.lines, doc.discountCents);
  const lines = doc.lines.map(lineView);
  return {
    ref: doc.ref,
    quotationRef: doc.quotationRef,
    quotationRevision: doc.quotationRevision,
    bookingRef: doc.bookingRef,
    status: doc.status,
    billTo: doc.billTo,
    vehicle: doc.vehicle,
    serviceAdvisor: doc.serviceAdvisor,
    technician: doc.technician,
    lines,
    discountCents: doc.discountCents,
    approvedTotalCents: doc.approvedTotalCents,
    approvedAt: formatManilaStamp(doc.approvedAt),
    approvedByCustomer: doc.approvedByCustomer,
    poNumber: doc.poNumber ?? null,
    quotedCostCents: costing.quoted.costCents,
    quotedMarginCents: costing.quoted.marginCents,
    quotedMarginPercent: costing.quoted.marginPercent,
    costedLines: costing.quoted.costedLines,
    actualCostCents: costing.actual.costCents,
    actualMarginCents: costing.actual.marginCents,
    actualMarginPercent: costing.actual.marginPercent,
    stockLines: costing.stockLines,
    waitingLines: lines.filter((line) => line.stockState === "waiting").length,
    photoRef: doc.photoRef ?? null,
    createdBy: doc.createdBy.name,
    created: formatStamp(doc.createdAt),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export async function listJobOrderSummaries(): Promise<JobOrderSummary[]> {
  const collection = await jobOrders();
  const docs = await collection.find().sort({ updatedAt: -1 }).toArray();
  return docs.map((doc) => ({
    ref: doc.ref,
    quotationRef: doc.quotationRef,
    quotationRevision: doc.quotationRevision,
    bookingRef: doc.bookingRef,
    status: doc.status,
    customer: doc.billTo.name || doc.billTo.company,
    plate: doc.vehicle.plate,
    makeModel: doc.vehicle.makeModel,
    approvedTotalCents: doc.approvedTotalCents,
    created: formatStamp(doc.createdAt),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }));
}

export async function findJobOrder(ref: string): Promise<JobOrder | null> {
  const collection = await jobOrders();
  const doc = await collection.findOne({ ref });
  return doc ? toJobOrder(doc) : null;
}

/** Every job order made for one booking, cancelled ones included. */
export async function listJobsForBooking(bookingRef: string): Promise<BookingJob[]> {
  const collection = await jobOrders();
  const docs = await collection.find({ bookingRef }).sort({ createdAt: 1 }).toArray();
  return docs.map((doc) => ({ ref: doc.ref, status: doc.status }));
}

/** Job orders by booking ref, for the bookings screen. */
export async function listJobsByBooking(): Promise<Record<string, BookingJob[]>> {
  const collection = await jobOrders();
  const docs = await collection.find({ bookingRef: { $type: "string" } }).sort({ createdAt: 1 }).toArray();
  const byBooking: Record<string, BookingJob[]> = {};
  for (const doc of docs) (byBooking[doc.bookingRef as string] ??= []).push({ ref: doc.ref, status: doc.status });
  return byBooking;
}

// ---- Stock ------------------------------------------------------------------------

/**
 * Every part taken from stock for a job, newest first, with the customer and
 * car it went to: Inventory's "Used on jobs" list, the costing record of who
 * each unit was used for and what it cost.
 */
export async function listPartsUsedOnJobs(limit = 500): Promise<JobPartUse[]> {
  const collection = await jobOrders();
  const docs = await collection
    .find({ lines: { $elemMatch: { stock: { $type: "object" } } } })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .toArray();
  const uses: JobPartUse[] = [];
  for (const doc of docs) {
    for (const line of doc.lines) {
      const stock = line.stock;
      if (!stock || !line.sku) continue;
      uses.push({
        moveRef: stock.moveRef,
        sku: line.sku,
        description: line.description,
        quantity: stock.quantity,
        unit: line.unit,
        costCents: stock.costCents,
        occurredAt: stock.takenAt.toISOString(),
        when: formatStamp(stock.takenAt),
        jobOrderRef: doc.ref,
        jobStatus: doc.status,
        customer: doc.billTo.name || doc.billTo.company,
        plate: doc.vehicle.plate,
        makeModel: doc.vehicle.makeModel,
        returned: Boolean(stock.returnMoveRef),
      });
    }
  }
  return uses.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export interface StockTakeResult {
  taken: { description: string; quantity: number; unit: string; costCents: number }[];
  /** One sentence per part left waiting, saying why. */
  waiting: string[];
}

/** One line for a toast or the quotation's history. Null when nothing was linked to Inventory. */
export function stockTakeSummary(result: StockTakeResult): string | null {
  const parts: string[] = [];
  if (result.taken.length) {
    const cost = result.taken.reduce((sum, line) => sum + line.costCents, 0);
    const what = result.taken.map((line) => `${line.description} × ${line.quantity}`).join(", ");
    parts.push(`Taken from Inventory: ${what}, costing ${formatPeso(cost)}.`);
  }
  if (result.waiting.length) parts.push(`Not taken yet: ${result.waiting.join(" ")}`);
  return parts.length ? parts.join(" ") : null;
}

/**
 * Takes each waiting part line's units out of Inventory with a "Used on job
 * order" movement, oldest batch first, and records on the line which movement
 * and what it cost. A part short of stock stays waiting with the reason, and
 * can be taken later from the job order once the goods arrive.
 *
 * Each line is claimed on the job order before its stock moves, so a double
 * click, a retry or two people at once never take one line twice.
 */
export async function takeJobStock(ref: string): Promise<StockTakeResult> {
  const collection = await jobOrders();
  const doc = await collection.findOne({ ref });
  if (!doc) throw new InputError(`${ref} is no longer on file.`);
  if (doc.status === "Cancelled") throw new InputError(`${ref} was cancelled, so it takes no stock.`);

  const { take, refused } = linesToTake(doc.lines);
  const result: StockTakeResult = { taken: [], waiting: [...refused] };

  for (const line of take) {
    const now = new Date();
    const claimed = await collection.updateOne(
      {
        ref,
        status: { $ne: "Cancelled" },
        lines: {
          $elemMatch: {
            id: line.id,
            stock: null,
            $or: [{ stockClaimAt: null }, { stockClaimAt: { $lt: new Date(now.getTime() - STALE_CLAIM_MS) } }],
          },
        },
      },
      { $set: { "lines.$.stockClaimAt": now } },
    );
    if (claimed.matchedCount === 0) continue; // Taken, or being taken, by another request.

    try {
      const move = await recordStockMove({
        name: line.sku as string,
        kind: "out",
        quantity: line.qty,
        reason: "Used on job order",
        documentRef: ref,
        poNumber: "",
        party: usedForLabel(doc),
        unitAmountCents: 0,
      });
      await collection.updateOne(
        { ref, "lines.id": line.id },
        {
          $set: {
            "lines.$.stock": {
              moveRef: move.ref,
              quantity: move.quantity,
              costCents: move.costCents,
              batches: move.batches,
              takenAt: now,
              returnMoveRef: null,
            },
            "lines.$.stockClaimAt": null,
            updatedAt: now,
          },
        },
      );
      result.taken.push({ description: line.description, quantity: move.quantity, unit: line.unit, costCents: move.costCents });
    } catch (error) {
      await collection.updateOne({ ref, "lines.id": line.id }, { $set: { "lines.$.stockClaimAt": null } });
      const reason = error instanceof Error ? error.message : "Inventory could not be updated.";
      if (!(error instanceof Error)) console.error(`[job-orders] taking stock for ${ref} failed`, error);
      result.waiting.push(`${line.description}: ${reason}`);
    }
  }
  const summary = stockTakeSummary(result);
  if (summary) await logJobEvent(ref, "stock", summary);
  return result;
}


// ---- History ------------------------------------------------------------------------

const jobEvents = () => tenantScope<JobOrderEventDocument>("jobOrderEvents");

/** Adds a line to the job order's history, by the signed-in person. */
export async function logJobEvent(ref: string, kind: JobOrderEventKind, detail: string): Promise<void> {
  const actor = await currentQuoteActor();
  const collection = await jobEvents();
  await collection.insertOne({
    jobOrderRef: ref,
    kind,
    detail,
    by: { userId: actor.userId, name: actor.name },
    at: new Date(),
  } as JobOrderEventDocument);
}

/** The job order's history, newest first. */
export async function listJobOrderEvents(ref: string): Promise<JobOrderEvent[]> {
  const collection = await jobEvents();
  const docs = await collection.find({ jobOrderRef: ref }).sort({ at: -1 }).limit(200).toArray();
  return docs.map((doc) => ({ kind: doc.kind, detail: doc.detail, by: doc.by.name, at: formatStamp(doc.at) }));
}

// ---- Putting stock back -------------------------------------------------------------

/**
 * Puts back what one line took, into the batches it came from. The line is
 * claimed first, so a part is never put back twice. Returns the movement, or
 * null when there was nothing to put back; throws with the reason on failure.
 */
async function returnLineStock(doc: JobOrderDocument, line: JobOrderLine): Promise<string | null> {
  const collection = await jobOrders();
  const stock = line.stock;
  if (!stock || stock.returnMoveRef || !line.sku) return null;

  const claimed = await collection.updateOne(
    { ref: doc.ref, lines: { $elemMatch: { id: line.id, "stock.moveRef": stock.moveRef, "stock.returnMoveRef": null } } },
    { $set: { "lines.$.stock.returnMoveRef": "returning" } },
  );
  if (claimed.matchedCount === 0) return null;

  try {
    const moveRef = await returnJobStock({
      sku: line.sku,
      quantity: stock.quantity,
      costCents: stock.costCents,
      batches: stock.batches,
      jobOrderRef: doc.ref,
      party: usedForLabel(doc),
    });
    await collection.updateOne(
      { ref: doc.ref, "lines.id": line.id },
      { $set: { "lines.$.stock.returnMoveRef": moveRef, updatedAt: new Date() } },
    );
    return moveRef;
  } catch (error) {
    await collection.updateOne({ ref: doc.ref, "lines.id": line.id }, { $set: { "lines.$.stock.returnMoveRef": null } });
    console.error(`[job-orders] putting back stock for ${doc.ref} failed`, error);
    throw error;
  }
}

/**
 * Puts back every part a job order took and has not returned, into the
 * batches it came from. For a cancelled job order. Returns one sentence per
 * part that could not be put back.
 */
export async function returnJobOrderStock(ref: string): Promise<{ returned: number; failed: string[] }> {
  const collection = await jobOrders();
  const doc = await collection.findOne({ ref });
  if (!doc) throw new InputError(`${ref} is no longer on file.`);

  let returned = 0;
  const failed: string[] = [];
  const back: string[] = [];
  for (const line of doc.lines) {
    try {
      if (await returnLineStock(doc, line)) {
        returned += 1;
        back.push(`${line.description} × ${line.stock?.quantity ?? line.qty}`);
      }
    } catch (error) {
      failed.push(`${line.description}: ${error instanceof Error ? error.message : "Inventory could not be updated."}`);
    }
  }
  if (back.length) await logJobEvent(ref, "stock", `Put back in Inventory: ${back.join(", ")}.`);
  return { returned, failed };
}

// ---- Cancelling ---------------------------------------------------------------------

/**
 * A job order is a record of the agreed work with no progress of its own
 * (20 Nov 2026): nothing to start or complete. Cancelling is the one change:
 * final, the parts it took go back into Inventory, and new work is a new
 * quotation. The booking is left as it is, for staff to move.
 */
export async function cancelJobOrder(ref: string): Promise<{ stockNote: string | null }> {
  const collection = await jobOrders();
  const doc = await collection.findOne({ ref });
  if (!doc) throw new InputError(`${ref} is no longer on file.`);
  if (doc.status === "Cancelled") throw new InputError(`${ref} was cancelled already.`);

  await collection.updateOne({ ref }, { $set: { status: "Cancelled", updatedAt: new Date() } });
  await logJobEvent(ref, "cancelled", `${ref} cancelled.`);

  const { returned, failed } = await returnJobOrderStock(ref);
  let stockNote: string | null = returned ? `${returned} ${returned === 1 ? "part" : "parts"} put back in Inventory.` : null;
  if (failed.length) stockNote = `${stockNote ?? ""} Not put back: ${failed.join(" ")}`.trim();
  return { stockNote };
}

// ---- Checklist ----------------------------------------------------------------------

export interface JobLineChecklistInput {
  checked: boolean;
  /** For parts only; ignored on labor. */
  supplierName: string;
  supplierRef: string | null;
  boughtCostCents: number | null;
}

/**
 * Ticks a line on the job order's checklist, and for a part records who it
 * was bought from and for what. The cost becomes the line's actual cost
 * unless the part was taken from Inventory. A change of supplier or cost goes
 * into the history; ticking alone does not, so the history stays readable.
 */
export async function saveJobLineChecklist(ref: string, lineId: string, input: JobLineChecklistInput): Promise<void> {
  const collection = await jobOrders();
  const doc = await collection.findOne({ ref });
  if (!doc) throw new InputError(`${ref} is no longer on file.`);
  if (doc.status === "Cancelled") throw new InputError(`${ref} was cancelled, so its checklist is closed.`);
  const line = doc.lines.find((entry) => entry.id === lineId);
  if (!line) throw new InputError("That line is no longer on the job order. Reload the page.");

  const part = line.section === "parts";
  const supplierName = part ? input.supplierName.trim().slice(0, 120) : "";
  const supplierRef = part && supplierName ? input.supplierRef : null;
  const boughtCostCents = part ? input.boughtCostCents : null;
  if (boughtCostCents !== null && (!Number.isInteger(boughtCostCents) || boughtCostCents < 0)) {
    throw new InputError("Write the cost as an amount in pesos, like 1,250.00.");
  }

  await collection.updateOne(
    { ref, "lines.id": lineId },
    {
      $set: {
        "lines.$.checked": part && input.checked,
        "lines.$.supplierName": supplierName,
        "lines.$.supplierRef": supplierRef,
        "lines.$.boughtCostCents": boughtCostCents,
        updatedAt: new Date(),
      },
    },
  );

  const before = { name: line.supplierName ?? "", cost: line.boughtCostCents ?? null };
  if (before.name !== supplierName || before.cost !== boughtCostCents) {
    const from = supplierName ? `from ${supplierName}` : "supplier not given";
    const cost = boughtCostCents === null ? "cost not given" : `for ${formatPeso(boughtCostCents)}`;
    await logJobEvent(ref, "stock", `${line.description}: bought ${from}, ${cost}.`);
  }
}

// ---- Following the quotation ----------------------------------------------------------

/** The quotation as it stands after a save, for its job order to follow. */
export interface QuotationForJob {
  ref: string;
  revision: number;
  billTo: QuoteBillTo;
  vehicle: QuoteVehicle;
  serviceAdvisor: string;
  technician: string;
  lines: QuoteLine[];
  discountCents: number;
  approvedTotalCents: number;
}

function lineChanges(before: JobOrderLine, after: JobOrderLine): string | null {
  const parts: string[] = [];
  if (before.description !== after.description) parts.push(`now "${after.description}"`);
  if (before.qty !== after.qty) parts.push(`qty ${before.qty} → ${after.qty}`);
  if (before.unitPriceCents !== after.unitPriceCents) {
    parts.push(`price ${formatPeso(before.unitPriceCents)} → ${formatPeso(after.unitPriceCents)}`);
  }
  if ((before.sku ?? null) !== (after.sku ?? null)) parts.push(after.sku ? "linked to a different stock item" : "no longer linked to stock");
  return parts.length ? `${before.description}: ${parts.join(", ")}` : null;
}

/**
 * The quotation was changed after its job order was recorded: the job order
 * follows it (lines, discount, total, customer and car) and its history says
 * what changed. A part whose quantity or stock item changed, or that was
 * removed, goes back into Inventory first; then every linked part not yet
 * taken is taken, so stock and the job's actual cost stay true.
 */
export async function syncJobOrderWithQuotation(
  ref: string,
  quote: QuotationForJob,
  options: { inventory: boolean },
): Promise<{ summary: string | null; stockNote: string | null }> {
  const collection = await jobOrders();
  const doc = await collection.findOne({ ref });
  if (!doc) throw new InputError(`${ref} is no longer on file.`);
  if (doc.status === "Cancelled") throw new InputError(`${ref} was cancelled; it no longer follows ${quote.ref}.`);

  const oldById = new Map(doc.lines.map((line) => [line.id, line]));
  const priced = quote.lines.filter((line) => line.unitPriceCents !== null);
  const next: JobOrderLine[] = [];
  const toReturn: JobOrderLine[] = [];
  const changes: string[] = [];

  for (const line of priced) {
    const built: JobOrderLine = {
      id: line.id,
      section: line.section,
      description: line.description,
      qty: line.qty,
      unit: line.unit,
      unitPriceCents: line.unitPriceCents ?? 0,
      quotedCostCents: line.costCents,
      sku: line.sku ?? null,
      stock: null,
    };
    const old = oldById.get(line.id);
    if (!old) {
      changes.push(`Added ${built.description} × ${built.qty} (${formatPeso(Math.round(built.qty * built.unitPriceCents))})`);
    } else {
      const changed = lineChanges(old, built);
      if (changed) changes.push(changed);
      // The checklist stays with the line: ticked, and where the part was bought and for what.
      built.checked = old.checked ?? false;
      built.supplierName = old.supplierName ?? "";
      built.supplierRef = old.supplierRef ?? null;
      built.boughtCostCents = old.boughtCostCents ?? null;
      const holding = old.stock && !old.stock.returnMoveRef;
      // The stock stays with the line while it still names the same units.
      if (holding && old.sku === built.sku && old.qty === built.qty) built.stock = old.stock;
      else if (holding) toReturn.push(old);
    }
    next.push(built);
  }
  for (const old of doc.lines) {
    if (next.some((line) => line.id === old.id)) continue;
    changes.push(`Removed ${old.description}`);
    if (old.stock && !old.stock.returnMoveRef) toReturn.push(old);
  }

  if (doc.discountCents !== quote.discountCents) {
    changes.push(`Discount ${formatPeso(doc.discountCents)} → ${formatPeso(quote.discountCents)}`);
  }
  if (usedForLabel(doc) !== usedForLabel(quote)) changes.push(`Customer and car now ${usedForLabel(quote) || "not given"}`);
  if (doc.approvedTotalCents !== quote.approvedTotalCents) {
    changes.push(`Total ${formatPeso(doc.approvedTotalCents)} → ${formatPeso(quote.approvedTotalCents)}`);
  }

  // Back into Inventory before the lines that held them are replaced.
  const back: string[] = [];
  const failed: string[] = [];
  for (const old of toReturn) {
    try {
      if (await returnLineStock(doc, old)) back.push(`${old.description} × ${old.stock?.quantity ?? old.qty}`);
    } catch (error) {
      failed.push(`${old.description}: ${error instanceof Error ? error.message : "Inventory could not be updated."}`);
    }
  }
  if (failed.length) {
    throw new InputError(`The job order was not changed, because some parts could not go back into Inventory. ${failed.join(" ")}`);
  }

  await collection.updateOne(
    { ref },
    {
      $set: {
        lines: next,
        discountCents: quote.discountCents,
        approvedTotalCents: quote.approvedTotalCents,
        billTo: quote.billTo,
        vehicle: quote.vehicle,
        serviceAdvisor: quote.serviceAdvisor,
        technician: quote.technician,
        quotationRevision: quote.revision,
        updatedAt: new Date(),
      },
    },
  );

  const summary = changes.length ? `${quote.ref} rev ${quote.revision} saved. ${changes.join("; ")}.` : null;
  if (summary) await logJobEvent(ref, "quotation-changed", summary);
  if (back.length) await logJobEvent(ref, "stock", `Put back in Inventory: ${back.join(", ")}.`);

  const notes: string[] = [];
  if (back.length) notes.push(`Put back in Inventory: ${back.join(", ")}.`);
  if (options.inventory) {
    const taken = stockTakeSummary(await takeJobStock(ref));
    if (taken) notes.push(taken);
  }
  return { summary, stockNote: notes.length ? notes.join(" ") : null };
}

// ---- Price list: where each line was used ----------------------------------------

/**
 * Every job each price list line was used on, newest first, keyed by
 * `priceItemKey`: the customer and car, quantity, what it sold for and what
 * it cost (the stock it took, else its quoted cost). Cancelled job orders are
 * left out; their work did not happen.
 */
export async function listPriceItemUses(): Promise<Record<string, PriceItemUse[]>> {
  const collection = await jobOrders();
  const docs = await collection.find({ status: { $ne: "Cancelled" } }).sort({ createdAt: -1 }).limit(1000).toArray();
  const uses: Record<string, PriceItemUse[]> = {};
  for (const doc of docs) {
    for (const line of doc.lines) {
      const stock = line.stock && !line.stock.returnMoveRef ? line.stock : null;
      const bought = line.boughtCostCents ?? null;
      const costCents = stock
        ? stock.costCents
        : bought !== null
          ? bought
          : line.quotedCostCents !== null
            ? Math.round(line.qty * line.quotedCostCents)
            : null;
      (uses[priceItemKey(line.section, line.description)] ??= []).push({
        jobOrderRef: doc.ref,
        when: formatStamp(doc.createdAt),
        at: doc.createdAt.toISOString(),
        customer: doc.billTo.name || doc.billTo.company,
        company: doc.billTo.name ? doc.billTo.company : "",
        phone: doc.billTo.phone,
        email: doc.billTo.email,
        customerRef: doc.billTo.customerRef ?? null,
        plate: doc.vehicle.plate,
        makeModel: doc.vehicle.makeModel,
        boughtFrom: line.supplierName ?? "",
        boughtFromRef: line.supplierRef ?? null,
        qty: line.qty,
        unit: line.unit,
        amountCents: Math.round(line.qty * line.unitPriceCents),
        costCents,
        costSource: stock ? "stock" : bought !== null ? "bought" : costCents !== null ? "quoted" : null,
      });
    }
  }
  return uses;
}
