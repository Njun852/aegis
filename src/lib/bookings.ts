import {
  BOOKINGS,
  BOOKING_STATUS_STYLES,
  TODAY_ISO,
} from "@/lib/data/bookings";
import type {
  Booking,
  BookingRange,
  BookingStatus,
  BookingStatusFilter,
} from "@/types";

/**
 * QUERY SEAM — the same contract `src/lib/businesses.ts` follows. `businessId`
 * is a required argument on every read so a tenant filter can never be
 * forgotten at a call site.
 */

export interface BookingQuery {
  businessId: string;
  status?: BookingStatusFilter;
  search?: string;
  range?: BookingRange;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Sample bookings carry "Aug 24" with no year; the data set is all 2026. */
export function bookingDate(day: string) {
  const [month, date] = day.split(" ");
  return new Date(2026, MONTHS.indexOf(month), Number(date));
}

function rangeBounds(range: BookingRange) {
  const today = new Date(`${TODAY_ISO}T00:00:00`);
  if (range === "This week") {
    const end = new Date(today);
    end.setDate(end.getDate() + 6);
    return { start: today, end };
  }
  if (range === "Next 30 days") {
    const end = new Date(today);
    end.setDate(end.getDate() + 30);
    return { start: today, end };
  }
  return {
    start: new Date(2026, 7, 20),
    end: new Date(2026, 7, 27),
  };
}

export function inRange(booking: Booking, range: BookingRange) {
  const { start, end } = rangeBounds(range);
  const when = bookingDate(booking.day);
  return when >= start && when <= end;
}

export function listBookings(
  { businessId, status = "All", search = "", range }: BookingQuery,
  source: Booking[] = BOOKINGS,
) {
  const term = search.trim().toLowerCase();
  return source.filter((booking) => {
    if (booking.businessId !== businessId) return false;
    if (range && !inRange(booking, range)) return false;
    if (status !== "All" && booking.status !== status) return false;
    if (!term) return true;
    return (
      booking.customer.toLowerCase().includes(term) ||
      booking.service.toLowerCase().includes(term) ||
      booking.ref.toLowerCase().includes(term) ||
      booking.company.toLowerCase().includes(term)
    );
  });
}

export function getBooking(
  businessId: string,
  ref: string | null,
  source: Booking[] = BOOKINGS,
) {
  if (!ref) return undefined;
  return source.find(
    (booking) => booking.businessId === businessId && booking.ref === ref,
  );
}

export function countByStatus(bookings: Booking[], status: BookingStatusFilter) {
  if (status === "All") return bookings.length;
  return bookings.filter((booking) => booking.status === status).length;
}

export function countOnDay(bookings: Booking[], day: string) {
  return bookings.filter((booking) => booking.day === day).length;
}

/**
 * Revenue is recognised the moment the booking is created, not when it is paid.
 * Cancelled bookings are the one exception: the sale is voided, so it drops out
 * of the total. This is the only place that rule lives — the dashboard's
 * revenue figures aggregate over the same helper once the ledger is wired up.
 */
export function recognisedRevenueCents(bookings: Booking[]) {
  return bookings
    .filter((booking) => booking.status !== "Cancelled")
    .reduce((total, booking) => total + booking.valueCents, 0);
}

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

/** The drawer's activity trail. Derived, not stored, until there is an audit log. */
export function bookingTimeline(booking: Booking) {
  return [
    {
      label: "Booking requested",
      meta: `Aug 18, 2026 · 14:02 · ${booking.channel}`,
      dot: "var(--accent-primary)",
    },
    {
      label: "Confirmation email sent",
      meta: "Aug 18, 2026 · 14:03 · automated",
      dot: "var(--status-positive)",
    },
    {
      label: "Reminder scheduled",
      meta: "24 hrs before start · SMS + email",
      dot: "var(--gray-300)",
    },
  ];
}
