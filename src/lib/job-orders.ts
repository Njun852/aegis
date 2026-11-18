import type { BookingStatus, JobLineStockState, JobOrderLine, JobOrderStatus } from "@/types";

// ---- Stock and costing --------------------------------------------------------------

/**
 * A part line takes its stock from Inventory when the job order is made: the
 * customer has approved it, so the part is really going on the car. A
 * quotation never holds stock, since most are revised, declined or never
 * answered.
 */
export function stockStateOf(line: Pick<JobOrderLine, "section" | "sku" | "stock">): JobLineStockState {
  if (line.stock) return line.stock.returnMoveRef ? "returned" : "taken";
  if (line.section !== "parts" || !line.sku) return "none";
  return "waiting";
}

/** Why a waiting line cannot be taken from stock as it stands, or null when it can. */
export function stockTakeRefusal(line: Pick<JobOrderLine, "qty" | "unit" | "description">): string | null {
  if (!Number.isInteger(line.qty) || line.qty < 1) {
    return `${line.description}: Inventory counts whole units, and this line is for ${line.qty} ${line.unit}. Take it from stock in Inventory.`;
  }
  return null;
}

/** The lines a job order should take from stock now. */
export function linesToTake<T extends Pick<JobOrderLine, "section" | "sku" | "stock" | "qty" | "unit" | "description">>(
  lines: T[],
): { take: T[]; refused: string[] } {
  const take: T[] = [];
  const refused: string[] = [];
  for (const line of lines) {
    if (stockStateOf(line) !== "waiting") continue;
    const refusal = stockTakeRefusal(line);
    if (refusal) refused.push(refusal);
    else take.push(line);
  }
  return { take, refused };
}

function marginOf(costCents: number, salesCents: number, costedLines: number, discountCents: number) {
  const discount = costedLines ? discountCents : 0;
  const marginCents = salesCents - costCents - discount;
  const base = salesCents - discount;
  return {
    costCents,
    marginCents,
    marginPercent: costedLines && base > 0 ? Math.round((marginCents / base) * 1000) / 10 : null,
    costedLines,
  };
}

/**
 * Quoted cost and margin over the lines that carry a cost, and the same with
 * each part taken from stock at what its batches actually cost. A line with
 * no stock taken keeps its quoted cost in the actual figure, so the two can
 * be compared line for line. Internal; never printed.
 */
export function jobOrderCosting(
  lines: Pick<JobOrderLine, "qty" | "unitPriceCents" | "quotedCostCents" | "stock">[],
  discountCents: number,
) {
  let quotedCost = 0;
  let quotedSales = 0;
  let quotedLines = 0;
  let actualCost = 0;
  let actualSales = 0;
  let actualLines = 0;
  let stockLines = 0;

  for (const line of lines) {
    const sales = Math.round(line.qty * line.unitPriceCents);
    if (line.quotedCostCents !== null) {
      quotedCost += Math.round(line.qty * line.quotedCostCents);
      quotedSales += sales;
      quotedLines += 1;
    }
    if (line.stock && !line.stock.returnMoveRef) {
      actualCost += line.stock.costCents;
      actualSales += sales;
      actualLines += 1;
      stockLines += 1;
    } else if (line.quotedCostCents !== null) {
      actualCost += Math.round(line.qty * line.quotedCostCents);
      actualSales += sales;
      actualLines += 1;
    }
  }

  return {
    quoted: marginOf(quotedCost, quotedSales, quotedLines, discountCents),
    actual: marginOf(actualCost, actualSales, actualLines, discountCents),
    stockLines,
  };
}

/**
 * How a booking and its job orders share one job without tracking it twice.
 *
 * The booking owns the appointment: Pending, then Confirmed. Once a job order
 * exists for it, the job order owns the work, Open, In progress, Completed,
 * and the booking follows. Pure, so the drawer, the actions and the check
 * script agree.
 */

/** A job order as the booking side needs to see it. */
export interface BookingJob {
  ref: string;
  status: JobOrderStatus;
}

export function activeJobs<T extends { status: JobOrderStatus }>(jobs: T[]): T[] {
  return jobs.filter((job) => job.status !== "Cancelled");
}

/**
 * The booking status its job orders call for, or null when the booking keeps
 * its own because no work has started. A booking with several job orders is
 * In progress until every one still standing is Completed.
 */
export function bookingStatusFromJobs(statuses: JobOrderStatus[]): BookingStatus | null {
  const active = statuses.filter((status) => status !== "Cancelled");
  if (active.length === 0) return null;
  if (active.every((status) => status === "Completed")) return "Completed";
  if (active.some((status) => status !== "Open")) return "In progress";
  return null;
}

/**
 * What the booking should become after a job order changed. Work undone or
 * cancelled leaves the appointment standing as Confirmed: the customer still
 * came in, and whether to cancel the booking is a person's call.
 */
export function syncedBookingStatus(current: BookingStatus, jobStatuses: JobOrderStatus[]): BookingStatus | null {
  if (current === "Cancelled") return null;
  const target = bookingStatusFromJobs(jobStatuses);
  const next = target ?? (current === "In progress" || current === "Completed" ? "Confirmed" : null);
  return next && next !== current ? next : null;
}

function names(jobs: BookingJob[]): string {
  return jobs.map((job) => job.ref).join(", ");
}

/** Why the booking side may not make this move while it has job orders, or null when it may. */
export function bookingMoveRefusal(next: BookingStatus, jobs: BookingJob[]): string | null {
  const active = activeJobs(jobs);
  if (active.length === 0) return null;
  if (next === "Cancelled") {
    return `This booking has open work on ${names(active)}. Cancel the job order first.`;
  }
  if (next === "In progress" || next === "Completed") {
    return `The work is tracked on ${names(active)}. Start and complete it there; this booking follows.`;
  }
  if (active.some((job) => job.status !== "Open")) {
    return `Work has started on ${names(active)}. Move the job order back to Open first.`;
  }
  return null;
}

/** Why a job order may not start yet, or null. Starting work on an unconfirmed booking would skip staff confirmation. */
export function jobStartRefusal(next: JobOrderStatus, booking: { ref: string; status: BookingStatus } | null): string | null {
  if (!booking || (next !== "In progress" && next !== "Completed")) return null;
  if (booking.status === "Pending") {
    return `Booking ${booking.ref} is still Pending. Confirm it in Bookings before starting the work.`;
  }
  return null;
}
