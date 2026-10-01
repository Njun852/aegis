import type {
  BookingStatus,
  DateRange,
  ReportBookings,
  ReportPeriod,
  ReportSummary,
} from "@/types";

/**
 * Pure helpers for the dashboard's full report. Database access lives in
 * `src/lib/dal/report.ts`; nothing here touches Mongo, so `scripts/report-check.ts`
 * can assert the period maths and the reducers directly.
 */

/** The range as it appears in the report's link. */
export const REPORT_RANGE_SLUGS: Record<DateRange, string> = {
  "This month": "this-month",
  "Last month": "last-month",
  "This quarter": "this-quarter",
};

export function rangeFromSlug(slug: string | string[] | undefined): DateRange {
  const hit = (Object.entries(REPORT_RANGE_SLUGS) as [DateRange, string][]).find(
    ([, value]) => value === slug,
  );
  return hit ? hit[0] : "This month";
}

function formatDay(date: Date, withYear: boolean): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

/** "Oct 1 – Oct 31, 2026" for a half-open window, naming its last day. */
function labelFor(from: Date, to: Date): string {
  const last = new Date(to.getFullYear(), to.getMonth(), to.getDate() - 1);
  return `${formatDay(from, from.getFullYear() !== last.getFullYear())} – ${formatDay(last, true)}`;
}

export interface PeriodBounds {
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
}

/**
 * The calendar window each range means, and the equal window before it. The
 * same month-aligned ranges `buildLedgerRevenue` uses for the dashboard, so the
 * report's revenue total matches the tile it was opened from.
 */
export function periodBounds(range: DateRange, today: Date): PeriodBounds {
  const year = today.getFullYear();
  const month = today.getMonth();

  if (range === "This quarter") {
    const first = month - (month % 3);
    return {
      from: new Date(year, first, 1),
      to: new Date(year, first + 3, 1),
      previousFrom: new Date(year, first - 3, 1),
      previousTo: new Date(year, first, 1),
    };
  }

  const start = range === "Last month" ? month - 1 : month;
  return {
    from: new Date(year, start, 1),
    to: new Date(year, start + 1, 1),
    previousFrom: new Date(year, start - 1, 1),
    previousTo: new Date(year, start, 1),
  };
}

export function periodFor(range: DateRange, today: Date): ReportPeriod {
  const bounds = periodBounds(range, today);
  return {
    range,
    from: bounds.from.toISOString(),
    to: bounds.to.toISOString(),
    label: labelFor(bounds.from, bounds.to),
    previousLabel: labelFor(bounds.previousFrom, bounds.previousTo),
  };
}

/**
 * "12.5%" / "-4.1%", or null when the earlier period had nothing: there is no
 * honest percentage for "up from zero".
 */
export function changeBetween(current: number, previous: number): string | null {
  if (previous === 0) return null;
  return `${(((current - previous) / previous) * 100).toFixed(1)}%`;
}

const STATUS_ORDER: BookingStatus[] = [
  "Pending",
  "Confirmed",
  "In progress",
  "Completed",
  "Cancelled",
];

/**
 * Bookings whose appointment falls in `[from, to)`. A cancelled booking is
 * counted, because it was a booking, but adds no value: it did not happen.
 */
export function summariseBookings(
  bookings: {
    startsAt: Date;
    status: BookingStatus;
    valueCents: number;
    service: string;
    channel: string;
    online: boolean;
  }[],
  from: Date,
  to: Date,
): ReportBookings {
  const inPeriod = bookings.filter(
    (booking) => booking.startsAt >= from && booking.startsAt < to,
  );

  const count = <K extends string>(key: (booking: (typeof inPeriod)[number]) => K) => {
    const totals = new Map<K, number>();
    for (const booking of inPeriod) totals.set(key(booking), (totals.get(key(booking)) ?? 0) + 1);
    return totals;
  };

  const statuses = count((booking) => booking.status);
  const channels = count((booking) => booking.channel || "Not recorded");

  const services = new Map<string, { count: number; valueCents: number }>();
  for (const booking of inPeriod) {
    const entry = services.get(booking.service) ?? { count: 0, valueCents: 0 };
    entry.count += 1;
    if (booking.status !== "Cancelled") entry.valueCents += booking.valueCents;
    services.set(booking.service, entry);
  }

  return {
    total: inPeriod.length,
    bookedValueCents: inPeriod
      .filter((booking) => booking.status !== "Cancelled")
      .reduce((sum, booking) => sum + booking.valueCents, 0),
    byStatus: STATUS_ORDER.map((status) => ({ status, count: statuses.get(status) ?? 0 })),
    byChannel: [...channels.entries()]
      .map(([channel, total]) => ({ channel, count: total }))
      .sort((a, b) => b.count - a.count || a.channel.localeCompare(b.channel)),
    topServices: [...services.entries()]
      .map(([service, entry]) => ({ service, ...entry }))
      .sort((a, b) => b.count - a.count || b.valueCents - a.valueCents || a.service.localeCompare(b.service))
      .slice(0, 5),
    online: inPeriod.filter((booking) => booking.online).length,
  };
}

const LIMITS = { highlights: 4, risks: 3, actions: 3 };

/**
 * Narrows the model's JSON to a summary, or null. A reply missing its headline
 * or carrying anything but short strings is rejected whole, and so never cached.
 */
export function parseReportSummary(raw: unknown): ReportSummary | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;

  const headline = typeof value.headline === "string" ? value.headline.trim() : "";
  if (!headline) return null;

  const list = (key: keyof typeof LIMITS): string[] | null => {
    const items = value[key];
    if (!Array.isArray(items)) return null;
    if (!items.every((item) => typeof item === "string")) return null;
    return (items as string[])
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, LIMITS[key]);
  };

  const highlights = list("highlights");
  const risks = list("risks");
  const actions = list("actions");
  if (!highlights || !risks || !actions) return null;
  if (highlights.length === 0) return null;

  return { headline, highlights, risks, actions };
}
