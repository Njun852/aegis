import type {
  ServiceDue,
  ServiceDueFilter,
  ServiceDueStatus,
  Vehicle,
} from "@/types";

/**
 * Pure helpers for Fleet. Database access lives in `src/lib/dal/fleet.ts`;
 * nothing here touches Mongo, so these are safe in client components and in
 * `scripts/fleet-check.ts`, which asserts the due rules below at their edges.
 */

/** Inside this many days, or this many km, a service counts as due soon. */
export const DUE_SOON_DAYS = 30;
export const DUE_SOON_KM = 500;

/** The schedule a new vehicle starts on until someone sets its own. */
export const DEFAULT_INTERVAL_MONTHS = 6;
export const DEFAULT_INTERVAL_KM = 5000;

export const SERVICE_DUE_STATUSES: ServiceDueStatus[] = [
  "Overdue",
  "Due soon",
  "OK",
  "No service on record",
];

export const SERVICE_DUE_STYLES: Record<
  ServiceDueStatus,
  { tone: "negative" | "warning" | "positive" | "neutral"; dot: string }
> = {
  Overdue: { tone: "negative", dot: "var(--status-negative)" },
  "Due soon": { tone: "warning", dot: "var(--status-warning)" },
  OK: { tone: "positive", dot: "var(--status-positive)" },
  "No service on record": { tone: "neutral", dot: "var(--gray-400)" },
};

/**
 * "ABC 1234", "abc-1234" and "ABC1234" are the same car. Uniqueness is enforced
 * on this key so a second spelling cannot create a second vehicle.
 */
export function plateKey(plate: string): string {
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** "Aug 24, 2026" — history spans years, so the year is always shown. */
export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

export function formatKm(km: number): string {
  return `${km.toLocaleString("en-US")} km`;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * Calendar months, clamped to the end of a shorter month: a service on Aug 31
 * with a six-month interval is due Feb 28, not Mar 3.
 */
export function addMonths(date: Date, months: number): Date {
  const copy = new Date(date);
  const day = copy.getDate();
  copy.setDate(1);
  copy.setMonth(copy.getMonth() + months);
  const lastDay = new Date(copy.getFullYear(), copy.getMonth() + 1, 0).getDate();
  copy.setDate(Math.min(day, lastDay));
  return copy;
}

export interface DueInput {
  /** The latest service, or null when the vehicle has no history. */
  lastServiceAt: Date | null;
  /** The odometer reading taken at that service, if one was. */
  lastServiceKm: number | null;
  /** The vehicle's latest known reading. */
  currentKm: number | null;
  intervalMonths: number;
  intervalKm: number;
}

/**
 * When the next service falls due. The worse of the two bases wins: a car well
 * inside its months but past its kilometres is overdue.
 *
 * The km basis needs a reading at the last service and a current reading; with
 * either missing it stays null. Nothing is estimated.
 */
export function computeDue(input: DueInput, today: Date): ServiceDue {
  if (!input.lastServiceAt) {
    return {
      status: "No service on record",
      dueAt: null,
      dueDay: null,
      daysLeft: null,
      dueKm: null,
      kmLeft: null,
    };
  }

  const dueAt = addMonths(input.lastServiceAt, input.intervalMonths);
  const daysLeft = Math.round(
    (startOfDay(dueAt).getTime() - startOfDay(today).getTime()) / 86_400_000,
  );

  const dueKm =
    input.lastServiceKm === null ? null : input.lastServiceKm + input.intervalKm;
  const kmLeft =
    dueKm === null || input.currentKm === null ? null : dueKm - input.currentKm;

  let status: ServiceDueStatus = "OK";
  if (daysLeft < 0 || (kmLeft !== null && kmLeft < 0)) {
    status = "Overdue";
  } else if (daysLeft <= DUE_SOON_DAYS || (kmLeft !== null && kmLeft <= DUE_SOON_KM)) {
    status = "Due soon";
  }

  return {
    status,
    dueAt: dueAt.toISOString(),
    dueDay: formatDate(dueAt),
    daysLeft,
    dueKm,
    kmLeft,
  };
}

/** "in 12 days", "today", "9 days ago" */
export function describeDays(daysLeft: number): string {
  if (daysLeft === 0) return "today";
  const count = Math.abs(daysLeft);
  const unit = count === 1 ? "day" : "days";
  return daysLeft > 0 ? `in ${count} ${unit}` : `${count} ${unit} ago`;
}

/** "1,200 km to go", "300 km over" */
export function describeKm(kmLeft: number): string {
  return kmLeft >= 0
    ? `${formatKm(kmLeft)} to go`
    : `${formatKm(-kmLeft)} over`;
}

const URGENCY: Record<ServiceDueStatus, number> = {
  Overdue: 0,
  "Due soon": 1,
  "No service on record": 2,
  OK: 3,
};

/**
 * Most urgent first, and within a status the soonest due first, so the top of
 * the list is always who to call next.
 */
export function sortByUrgency(vehicles: Vehicle[]): Vehicle[] {
  return [...vehicles].sort((a, b) => {
    const byStatus = URGENCY[a.due.status] - URGENCY[b.due.status];
    if (byStatus !== 0) return byStatus;
    const aDays = a.due.daysLeft ?? Number.POSITIVE_INFINITY;
    const bDays = b.due.daysLeft ?? Number.POSITIVE_INFINITY;
    if (aDays !== bDays) return aDays - bDays;
    return a.plate.localeCompare(b.plate);
  });
}

export function countByDue(vehicles: Vehicle[], filter: ServiceDueFilter): number {
  if (filter === "All") return vehicles.length;
  return vehicles.filter((vehicle) => vehicle.due.status === filter).length;
}

export function filterVehicles(
  vehicles: Vehicle[],
  { status, search }: { status: ServiceDueFilter; search: string },
): Vehicle[] {
  const term = search.trim().toLowerCase();
  const termKey = plateKey(search);
  return vehicles.filter((vehicle) => {
    if (status !== "All" && vehicle.due.status !== status) return false;
    if (!term) return true;
    return (
      (termKey !== "" && plateKey(vehicle.plate).includes(termKey)) ||
      vehicle.make.toLowerCase().includes(term) ||
      vehicle.model.toLowerCase().includes(term) ||
      vehicle.ref.toLowerCase().includes(term) ||
      (vehicle.owner?.name.toLowerCase().includes(term) ?? false) ||
      (vehicle.owner?.phone.toLowerCase().includes(term) ?? false)
    );
  });
}

/** "Toyota Vios 2019", without a dangling year when it is not known. */
export function vehicleLabel(vehicle: {
  make: string;
  model: string;
  year: number | null;
}): string {
  return [vehicle.make, vehicle.model, vehicle.year ?? ""]
    .filter((part) => String(part).trim() !== "")
    .join(" ");
}

/**
 * A whole, non-negative number of km or months as typed ("45,200", "45200").
 * Empty is null, so callers can tell "not given" from "unreadable" (undefined).
 */
export function parseWholeNumber(input: string): number | null | undefined {
  const cleaned = input.replace(/[,\s]/g, "").replace(/km$/i, "");
  if (!cleaned) return null;
  if (!/^\d+$/.test(cleaned)) return undefined;
  return Number(cleaned);
}
