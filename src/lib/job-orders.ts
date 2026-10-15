import type { BookingStatus, JobOrderStatus } from "@/types";

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
