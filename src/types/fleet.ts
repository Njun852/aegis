/**
 * A customer, in the one shape Fleet and CRM share. Kept deliberately small:
 * Fleet needs an owner to call about a car that is due, and CRM will add its
 * own fields and screens over these same records rather than a second store.
 */
export interface Customer {
  ref: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
}

/** Stored shape. `businessId` is stamped on by `tenantScope`. */
export interface CustomerDocument {
  businessId: string;
  ref: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
  createdAt: Date;
}

export type ServiceSource = "manual" | "booking";

/** One line of a vehicle's service history. */
export interface ServiceRecord {
  ref: string;
  vehicleRef: string;
  /** ISO 8601. */
  performedAt: string;
  /** "Aug 24, 2026" */
  day: string;
  /** Null when nobody read the odometer at the time. */
  odometerKm: number | null;
  work: string;
  source: ServiceSource;
  /** Set when the record mirrors a completed booking. */
  bookingRef: string | null;
}

/**
 * Stored shape. A `source: "booking"` record is written and removed by the
 * booking it mirrors, so completing and reopening a booking can never leave a
 * stray or doubled history line.
 */
export interface ServiceRecordDocument {
  businessId: string;
  ref: string;
  vehicleRef: string;
  performedAt: Date;
  odometerKm: number | null;
  work: string;
  source: ServiceSource;
  bookingRef?: string;
  createdAt: Date;
}

export type ServiceDueStatus = "Overdue" | "Due soon" | "OK" | "No service on record";

export type ServiceDueFilter = "All" | ServiceDueStatus;

/**
 * When the next service falls due, on each basis separately. A basis the data
 * cannot support stays null rather than being estimated: a due date made up
 * from a guessed mileage would be worse than no date.
 */
export interface ServiceDue {
  status: ServiceDueStatus;
  /** ISO 8601, from the last service date plus the interval in months. */
  dueAt: string | null;
  /** "Mar 02, 2027" */
  dueDay: string | null;
  /** Whole days from today; negative when overdue. */
  daysLeft: number | null;
  /** The odometer reading at which the next service is due. */
  dueKm: number | null;
  /** Kilometres left from the latest reading; negative when overdue. */
  kmLeft: number | null;
}

/** A vehicle as the screens receive it, with its owner and schedule resolved. */
export interface Vehicle {
  ref: string;
  customerRef: string;
  owner: Customer | null;
  plate: string;
  make: string;
  model: string;
  year: number | null;
  colour: string;
  odometerKm: number | null;
  /** "Aug 24, 2026", when the odometer was last read. */
  odometerDay: string | null;
  intervalMonths: number;
  intervalKm: number;
  notes: string;
  lastService: ServiceRecord | null;
  due: ServiceDue;
}

/** Stored shape. */
export interface VehicleDocument {
  businessId: string;
  ref: string;
  customerRef: string;
  plate: string;
  /** Letters and digits only, upper case. What uniqueness is enforced on. */
  plateKey: string;
  make: string;
  model: string;
  year: number | null;
  colour: string;
  odometerKm: number | null;
  odometerAt: Date | null;
  intervalMonths: number;
  intervalKm: number;
  notes: string;
  createdAt: Date;
}

export interface VehicleInput {
  customerRef: string;
  plate: string;
  make: string;
  model: string;
  year: number | null;
  colour: string;
  odometerKm: number | null;
  intervalMonths: number;
  intervalKm: number;
  notes: string;
}

/** What the New Booking form's vehicle picker needs, and nothing more. */
export interface VehicleOption {
  ref: string;
  plate: string;
  label: string;
  ownerName: string;
  ownerEmail: string;
}
