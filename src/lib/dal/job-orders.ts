import "server-only";

import { formatStamp } from "@/lib/format";
import {
  jobOrderCosting,
  jobStartRefusal,
  linesToTake,
  stockStateOf,
  syncedBookingStatus,
  type BookingJob,
} from "@/lib/job-orders";
import { formatManilaStamp, formatPeso } from "@/lib/quotations";
import { getBooking, setBookingStatus } from "./bookings";
import { recordStockMove, returnJobStock } from "./inventory";
import { InputError } from "./refs";
import { tenantScope } from "./tenant";
import type {
  JobOrder,
  JobOrderDocument,
  JobOrderLine,
  JobOrderLineView,
  JobOrderStatus,
  JobOrderSummary,
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
 * Nor does it keep a second copy of the booking's progress: once a booking
 * has a job order, the work is moved on here and the booking follows (rules
 * in `src/lib/job-orders.ts`).
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
    quotedCostCents: costing.quoted.costCents,
    quotedMarginCents: costing.quoted.marginCents,
    quotedMarginPercent: costing.quoted.marginPercent,
    costedLines: costing.quoted.costedLines,
    actualCostCents: costing.actual.costCents,
    actualMarginCents: costing.actual.marginCents,
    actualMarginPercent: costing.actual.marginPercent,
    stockLines: costing.stockLines,
    waitingLines: lines.filter((line) => line.stockState === "waiting").length,
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
        party: "",
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
  return result;
}

/**
 * Puts back every part a job order took and has not returned, into the
 * batches it came from. For a cancelled job order. Each line is claimed
 * first, so a part is never put back twice. Returns one sentence per part
 * that could not be put back.
 */
export async function returnJobOrderStock(ref: string): Promise<{ returned: number; failed: string[] }> {
  const collection = await jobOrders();
  const doc = await collection.findOne({ ref });
  if (!doc) throw new InputError(`${ref} is no longer on file.`);

  let returned = 0;
  const failed: string[] = [];
  for (const line of doc.lines) {
    const stock = line.stock;
    if (!stock || stock.returnMoveRef || !line.sku) continue;

    const claimed = await collection.updateOne(
      { ref, lines: { $elemMatch: { id: line.id, "stock.moveRef": stock.moveRef, "stock.returnMoveRef": null } } },
      { $set: { "lines.$.stock.returnMoveRef": "returning" } },
    );
    if (claimed.matchedCount === 0) continue;

    try {
      const moveRef = await returnJobStock({
        sku: line.sku,
        quantity: stock.quantity,
        costCents: stock.costCents,
        batches: stock.batches,
        jobOrderRef: ref,
      });
      await collection.updateOne(
        { ref, "lines.id": line.id },
        { $set: { "lines.$.stock.returnMoveRef": moveRef, updatedAt: new Date() } },
      );
      returned += 1;
    } catch (error) {
      await collection.updateOne({ ref, "lines.id": line.id }, { $set: { "lines.$.stock.returnMoveRef": null } });
      console.error(`[job-orders] putting back stock for ${ref} failed`, error);
      failed.push(`${line.description}: ${error instanceof Error ? error.message : "Inventory could not be updated."}`);
    }
  }
  return { returned, failed };
}

/**
 * Brings the booking in line with its job orders, through the booking's own
 * status change so the ledger and the car's service history move with it.
 * Returns what changed, for the person's toast, or null.
 */
async function syncBooking(bookingRef: string): Promise<string | null> {
  const booking = await getBooking(bookingRef);
  if (!booking) return null;
  const jobs = await listJobsForBooking(bookingRef);
  const next = syncedBookingStatus(booking.status, jobs.map((job) => job.status));
  if (!next) return null;
  await setBookingStatus(bookingRef, next);
  return `Booking ${bookingRef} moved to ${next}.`;
}

/**
 * Moves the work on. Cancelled is final: the approval it came from stays on
 * the quotation, and new work is a new quotation; the parts it took go back
 * into Inventory. With Bookings on, the linked booking follows; work cannot
 * start on a booking nobody confirmed.
 */
export async function setJobOrderStatus(
  ref: string,
  status: JobOrderStatus,
  options: { bookingsEnabled: boolean },
): Promise<{ bookingNote: string | null; stockNote: string | null }> {
  const collection = await jobOrders();
  const doc = await collection.findOne({ ref });
  if (!doc) throw new InputError(`${ref} is no longer on file.`);
  if (doc.status === "Cancelled") throw new InputError(`${ref} was cancelled and stays cancelled.`);
  if (doc.status === status) return { bookingNote: null, stockNote: null };

  const booking = options.bookingsEnabled && doc.bookingRef ? await getBooking(doc.bookingRef) : null;
  const refusal = jobStartRefusal(status, booking);
  if (refusal) throw new InputError(refusal);

  await collection.updateOne({ ref }, { $set: { status, updatedAt: new Date() } });

  let stockNote: string | null = null;
  if (status === "Cancelled") {
    const { returned, failed } = await returnJobOrderStock(ref);
    if (returned) stockNote = `${returned} ${returned === 1 ? "part" : "parts"} put back in Inventory.`;
    if (failed.length) stockNote = `${stockNote ?? ""} Not put back: ${failed.join(" ")}`.trim();
  }

  const bookingNote = booking ? await syncBooking(booking.ref) : null;
  return { bookingNote, stockNote };
}
