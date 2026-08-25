export type BookingStatus =
  | "Confirmed"
  | "Pending"
  | "In progress"
  | "Completed"
  | "Cancelled";

export type BookingStatusFilter = "All" | BookingStatus;

export interface Booking {
  ref: string;
  /** Owning business — bookings never cross tenants. */
  businessId: string;
  customer: string;
  company: string;
  email: string;
  service: string;
  duration: string;
  day: string;
  time: string;
  staff: string;
  /** Minor units (cents), so totals aggregate without float drift. */
  valueCents: number;
  status: BookingStatus;
  channel: string;
  notes: string;
}

export interface BookingStatusStyle {
  tone: "positive" | "warning" | "accent" | "neutral" | "negative";
  dot: string;
}

export interface BookingTimelineEntry {
  label: string;
  meta: string;
  dot: string;
}

/** The bookings toolbar's date-window options, in display order. */
export type BookingRange =
  | "Aug 20 – Aug 27, 2026"
  | "This week"
  | "Next 30 days";
