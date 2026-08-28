export type BookingStatus =
  | "Confirmed"
  | "Pending"
  | "In progress"
  | "Completed"
  | "Cancelled";

export type BookingStatusFilter = "All" | BookingStatus;

/**
 * The bookings toolbar's date-window options, in display order. "All time" is
 * unbounded — the escape hatch for a booking outside every rolling window.
 */
export type BookingRange =
  | "This week"
  | "Next 30 days"
  | "Past 30 days"
  | "All time";

/**
 * A booking as the screens receive it. Times arrive as an ISO string plus
 * server-formatted display strings: formatting on the server once keeps the
 * client from re-deriving them in a different timezone and tripping hydration.
 */
export interface Booking {
  ref: string;
  businessId: string;
  customer: string;
  company: string;
  email: string;
  service: string;
  /** ISO 8601. The source of truth for ordering and range filtering. */
  startsAt: string;
  durationMinutes: number;
  /** "Aug 24" */
  day: string;
  /** "09:00 – 09:45" */
  time: string;
  /** "45 min" */
  duration: string;
  staff: string;
  /** Minor units, so totals aggregate without float drift. */
  valueCents: number;
  status: BookingStatus;
  channel: string;
  notes: string;
}

/** What the New Booking form submits. `ref` and status are server-assigned. */
export interface BookingInput {
  customer: string;
  company: string;
  email: string;
  service: string;
  startsAt: string;
  durationMinutes: number;
  staff: string;
  valueCents: number;
  channel: string;
  notes: string;
}

/** Stored shape. `businessId` is stamped on by `tenantScope`. */
export interface BookingDocument {
  businessId: string;
  ref: string;
  customer: string;
  company: string;
  email: string;
  service: string;
  startsAt: Date;
  durationMinutes: number;
  staff: string;
  valueCents: number;
  status: BookingStatus;
  channel: string;
  notes: string;
  createdAt: Date;
}

export interface BookingStatusStyle {
  tone: "positive" | "warning" | "accent" | "neutral" | "negative";
  dot: string;
}
