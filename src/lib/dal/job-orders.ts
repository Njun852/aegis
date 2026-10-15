import "server-only";

import { formatStamp } from "@/lib/format";
import { jobStartRefusal, syncedBookingStatus, type BookingJob } from "@/lib/job-orders";
import { formatManilaStamp } from "@/lib/quotations";
import { getBooking, setBookingStatus } from "./bookings";
import { InputError } from "./refs";
import { tenantScope } from "./tenant";
import type { JobOrder, JobOrderDocument, JobOrderLine, JobOrderStatus, JobOrderSummary } from "@/types";

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
 */
const jobOrders = () => tenantScope<JobOrderDocument>("jobOrders");

/** Quoted cost and margin over the lines that carry a cost. Internal. */
export function jobOrderCosting(lines: JobOrderLine[], discountCents: number) {
  let costCents = 0;
  let salesCents = 0;
  let costedLines = 0;
  for (const line of lines) {
    if (line.quotedCostCents === null) continue;
    costCents += Math.round(line.qty * line.quotedCostCents);
    salesCents += Math.round(line.qty * line.unitPriceCents);
    costedLines += 1;
  }
  const marginCents = salesCents - costCents - (costedLines ? discountCents : 0);
  const base = salesCents - (costedLines ? discountCents : 0);
  return {
    costCents,
    marginCents,
    marginPercent: costedLines && base > 0 ? Math.round((marginCents / base) * 1000) / 10 : null,
    costedLines,
  };
}

function toJobOrder(doc: JobOrderDocument): JobOrder {
  const costing = jobOrderCosting(doc.lines, doc.discountCents);
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
    lines: doc.lines,
    discountCents: doc.discountCents,
    approvedTotalCents: doc.approvedTotalCents,
    approvedAt: formatManilaStamp(doc.approvedAt),
    approvedByCustomer: doc.approvedByCustomer,
    quotedCostCents: costing.costCents,
    quotedMarginCents: costing.marginCents,
    quotedMarginPercent: costing.marginPercent,
    costedLines: costing.costedLines,
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
 * the quotation, and new work is a new quotation. With Bookings on, the
 * linked booking follows; work cannot start on a booking nobody confirmed.
 */
export async function setJobOrderStatus(
  ref: string,
  status: JobOrderStatus,
  options: { bookingsEnabled: boolean },
): Promise<{ bookingNote: string | null }> {
  const collection = await jobOrders();
  const doc = await collection.findOne({ ref });
  if (!doc) throw new InputError(`${ref} is no longer on file.`);
  if (doc.status === "Cancelled") throw new InputError(`${ref} was cancelled and stays cancelled.`);
  if (doc.status === status) return { bookingNote: null };

  const booking = options.bookingsEnabled && doc.bookingRef ? await getBooking(doc.bookingRef) : null;
  const refusal = jobStartRefusal(status, booking);
  if (refusal) throw new InputError(refusal);

  await collection.updateOne({ ref }, { $set: { status, updatedAt: new Date() } });
  const bookingNote = booking ? await syncBooking(booking.ref) : null;
  return { bookingNote };
}
