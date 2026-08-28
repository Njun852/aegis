import { BOOKING_STATUS_STYLES } from "@/lib/data/bookings";
import type {
  Booking,
  BookingRange,
  BookingStatus,
  BookingStatusFilter,
} from "@/types";

/**
 * Pure helpers over bookings the server already loaded and tenant-scoped.
 * Database access lives in `src/lib/dal/bookings.ts` — nothing here touches
 * Mongo, so these are safe in client components.
 */

export function getStatusStyle(status: BookingStatus) {
  return BOOKING_STATUS_STYLES[status];
}

/** "$ 1,150.00" — the design puts a space after the currency symbol. */
export function formatMoney(cents: number, withCents = true) {
  const amount = (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: withCents ? 2 : 0,
    maximumFractionDigits: withCents ? 2 : 0,
  });
  return `$ ${amount}`;
}

export function formatDay(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? "hr" : "hrs"}`;
  }
  return `${minutes} min`;
}

export function formatTimeRange(start: Date, minutes: number) {
  const end = new Date(start.getTime() + minutes * 60_000);
  const at = (date: Date) =>
    date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  return `${at(start)} – ${at(end)}`;
}

/** Midnight-to-midnight bounds, so a booking later today is still "today". */
function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/** `null` means unbounded — every booking qualifies. */
export function rangeBounds(
  range: BookingRange,
  today: Date,
): { from: Date; to: Date } | null {
  if (range === "All time") return null;

  const start = startOfDay(today);
  if (range === "Past 30 days") {
    return { from: addDays(start, -30), to: addDays(start, 1) };
  }
  if (range === "Next 30 days") {
    return { from: start, to: addDays(start, 31) };
  }
  return { from: start, to: addDays(start, 7) };
}

export interface BookingFilter {
  range: BookingRange;
  today: Date;
  status?: BookingStatusFilter;
  search?: string;
}

export function filterBookings(
  bookings: Booking[],
  { range, today, status = "All", search = "" }: BookingFilter,
) {
  const bounds = rangeBounds(range, today);
  const term = search.trim().toLowerCase();

  return bookings.filter((booking) => {
    if (bounds) {
      const startsAt = new Date(booking.startsAt);
      if (startsAt < bounds.from || startsAt >= bounds.to) return false;
    }
    if (status !== "All" && booking.status !== status) return false;
    if (!term) return true;
    return (
      booking.customer.toLowerCase().includes(term) ||
      booking.service.toLowerCase().includes(term) ||
      booking.ref.toLowerCase().includes(term) ||
      booking.company.toLowerCase().includes(term) ||
      booking.staff.toLowerCase().includes(term)
    );
  });
}

export function countByStatus(bookings: Booking[], status: BookingStatusFilter) {
  if (status === "All") return bookings.length;
  return bookings.filter((booking) => booking.status === status).length;
}

export function countOnDay(bookings: Booking[], day: Date) {
  const target = startOfDay(day).getTime();
  return bookings.filter(
    (booking) => startOfDay(new Date(booking.startsAt)).getTime() === target,
  ).length;
}

/**
 * Revenue is recognised the moment the booking is created, not when it is paid.
 * Cancelled bookings are the one exception: the sale is voided, so it drops out
 * of the total. This rule lives here and in the equivalent Mongo aggregation in
 * `src/lib/dal/bookings.ts` — change both together.
 */
export function recognisedRevenueCents(bookings: Booking[]) {
  return bookings
    .filter((booking) => booking.status !== "Cancelled")
    .reduce((total, booking) => total + booking.valueCents, 0);
}

/** The drawer's activity trail. Derived, not stored, until there is an audit log. */
export function bookingTimeline(booking: Booking) {
  const created = new Date(booking.startsAt);
  created.setDate(created.getDate() - 6);

  return [
    {
      label: "Booking requested",
      meta: `${formatDay(created)} · ${booking.channel}`,
      dot: "var(--accent-primary)",
    },
    {
      label: "Confirmation email sent",
      meta: `${formatDay(created)} · automated`,
      dot: "var(--status-positive)",
    },
    {
      label: "Reminder scheduled",
      meta: "24 hrs before start · SMS + email",
      dot: "var(--gray-300)",
    },
  ];
}
