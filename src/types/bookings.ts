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
 * What a customer sent from the public booking page. Kept apart from the
 * booking's own fields because it is exactly what a stranger typed: staff turn
 * it into a customer and a vehicle only after reading it.
 */
export interface BookingRequest {
  /** "AB7K3Q9P". Shown to the customer as AB7K-3Q9P; with the mobile, it retrieves the booking. */
  code: string;
  mobile: string;
  heardFrom: string;
  vehicle: {
    make: string;
    model: string;
    plate: string;
    year: number | null;
  };
}

/**
 * What an online request's details already match on file, so staff can link
 * rather than create a duplicate. Worked out on the server when the book loads.
 */
export interface RequestMatches {
  /** Customers with the request's mobile. Empty without CRM. */
  customers: { ref: string; name: string; reason: string }[];
  /** The car already on file with the request's plate, and its owner. */
  vehicle: { ref: string; plate: string; label: string; customerRef: string; ownerName: string } | null;
}

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
  /** The mobile typed on a staff-made booking. Empty on older ones and on online requests, which keep theirs in `request`. */
  phone: string;
  service: string;
  /** ISO 8601. The source of truth for ordering and range filtering. */
  startsAt: string;
  durationMinutes: number;
  /**
   * "2026-08-24", the calendar day `day` and `time` below were formatted for.
   * The calendar view places bookings by this rather than re-deriving a day
   * from `startsAt` in the browser's timezone.
   */
  dateKey: string;
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
  /** The Fleet vehicle this booking is for. Null when none was picked. */
  vehicleRef: string | null;
  /** The CRM customer this booking belongs to. Null until someone links it. */
  customerRef: string | null;
  /** Present when the booking came from the public booking page. */
  request: BookingRequest | null;
}

/** What the New Booking form submits. `ref` and status are server-assigned. */
export interface BookingInput {
  customer: string;
  company: string;
  email: string;
  phone?: string;
  service: string;
  startsAt: string;
  durationMinutes: number;
  staff: string;
  valueCents: number;
  channel: string;
  notes: string;
  vehicleRef?: string | null;
  customerRef?: string | null;
}

/** Stored shape. `businessId` is stamped on by `tenantScope`. */
export interface BookingDocument {
  businessId: string;
  ref: string;
  customer: string;
  company: string;
  email: string;
  /** Absent on bookings made before the form asked for a mobile. */
  phone?: string;
  service: string;
  startsAt: Date;
  durationMinutes: number;
  staff: string;
  valueCents: number;
  status: BookingStatus;
  channel: string;
  notes: string;
  /** Absent on bookings made before Fleet existed, and on those with no vehicle. */
  vehicleRef?: string | null;
  /**
   * Set when the booking is made for a known customer, or linked to one later.
   * Absent on bookings made before CRM; they are never matched up automatically,
   * because a name or email typed on a booking is not proof of who it was.
   */
  customerRef?: string | null;
  /** Present only on bookings made from the public booking page. */
  request?: BookingRequest & {
    /** `phoneKey` of the mobile; what retrieval matches on. */
    mobileKey: string;
    submittedAt: Date;
  };
  createdAt: Date;
}

export interface BookingStatusStyle {
  tone: "positive" | "warning" | "accent" | "neutral" | "negative";
  dot: string;
}
