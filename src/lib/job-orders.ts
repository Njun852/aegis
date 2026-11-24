import type { BookingStatus, JobLineStockState, JobOrderLine, JobOrderStatus } from "@/types";

// ---- Stock and costing --------------------------------------------------------------

/** Who a job's parts were used for, as Inventory records it: "Juan Cruz · ABC 123". */
export function usedForLabel(job: { billTo: { name: string; company: string }; vehicle: { plate: string } }): string {
  return [job.billTo.name.trim() || job.billTo.company.trim(), job.vehicle.plate.trim()].filter(Boolean).join(" · ");
}

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
 * Bookings and job orders. Since 20 Nov 2026 a job order is the record of the
 * agreed work, with no progress of its own: the booking owns the appointment
 * and moves itself from Pending to Completed. Pure, so the drawer, the
 * actions and the check script agree.
 */

/** A job order as the booking side needs to see it. */
export interface BookingJob {
  ref: string;
  status: JobOrderStatus;
}

export function activeJobs<T extends { status: JobOrderStatus }>(jobs: T[]): T[] {
  return jobs.filter((job) => job.status !== "Cancelled");
}

function names(jobs: BookingJob[]): string {
  return jobs.map((job) => job.ref).join(", ");
}

/**
 * Why the booking side may not make this move while it has job orders, or
 * null when it may. A job order is a record of the agreed work, with no
 * progress of its own (20 Nov 2026), so the booking keeps moving itself
 * through Start and Complete. It only may not be cancelled under a recorded
 * job order, whose sale it carries.
 */
export function bookingMoveRefusal(next: BookingStatus, jobs: BookingJob[]): string | null {
  const active = activeJobs(jobs);
  if (active.length === 0 || next !== "Cancelled") return null;
  return `This booking has job order ${names(active)} recorded. Cancel the job order first.`;
}

/** What a job order shows: it is recorded, or it was cancelled. Older ones stored Open, In progress or Completed. */
export function jobOrderLabel(status: JobOrderStatus): "Recorded" | "Cancelled" {
  return status === "Cancelled" ? "Cancelled" : "Recorded";
}
