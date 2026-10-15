import { formatMoney } from "./format";
import type {
  BookingRow,
  BookingStatus,
  DashboardRangeData,
  DateRange,
  Kpi,
  LedgerRevenue,
  RevenueFigures,
  RevenueMonthBucket,
} from "@/types";

/**
 * Turns monthly ledger buckets into the figures each dashboard range shows.
 * Pure, so the same maths is testable without a database.
 *
 * Every range the dashboard offers is month-aligned, which is why one
 * `revenueByMonth` aggregation can answer all three.
 */

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Months shown in the Revenue Overview bar chart. */
const CHART_MONTHS = 6;

function monthKey(year: number, month: number) {
  return year * 12 + month;
}

function totalFor(
  buckets: Map<number, number>,
  keys: number[],
): number {
  return keys.reduce((sum, key) => sum + (buckets.get(key) ?? 0), 0);
}

/**
 * "12.5%" / "-4.1%". With no prior period to compare against, a positive figure
 * reads as 100% growth and an empty one as flat — there is no honest percentage
 * for "up from nothing".
 */
function delta(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? "0.0%" : "100.0%";
  // Against the size of the previous figure, so a loss shrinking reads as an
  // improvement rather than flipping sign.
  const change = ((current - previous) / Math.abs(previous)) * 100;
  return `${change.toFixed(1)}%`;
}

function quarterMonths(key: number): number[] {
  const month = key % 12;
  const firstOfQuarter = key - (month % 3);
  return [firstOfQuarter, firstOfQuarter + 1, firstOfQuarter + 2];
}

/**
 * Monthly buckets to the figures for each range. Written for revenue and used
 * for every monthly money figure the dashboard shows: expenses, net, quoted.
 */
export function buildLedgerRevenue(
  months: RevenueMonthBucket[],
  today: Date,
): LedgerRevenue {
  const buckets = new Map<number, number>();
  for (const bucket of months) {
    const date = new Date(bucket.monthIso);
    // Added, not replaced: expenses arrive as more than one bucket for a month
    // (stock movements and cost-only receipts).
    const key = monthKey(date.getFullYear(), date.getMonth());
    buckets.set(key, (buckets.get(key) ?? 0) + bucket.totalCents);
  }

  const thisMonth = monthKey(today.getFullYear(), today.getMonth());

  /** The trailing window the chart and the KPI sparkline both read. */
  const chartKeys = Array.from(
    { length: CHART_MONTHS },
    (_, index) => thisMonth - (CHART_MONTHS - 1 - index),
  );

  const chartMonths = chartKeys.map((key) => ({
    label: MONTH_LABELS[key % 12],
    // The chart works in whole pesos; the ledger stores centavos.
    value: (buckets.get(key) ?? 0) / 100,
  }));

  const points = chartKeys.map((key) => (buckets.get(key) ?? 0) / 100);

  const money = (cents: number) => formatMoney(cents);

  const figures = (
    keys: number[],
    previousKeys: number[],
    highlight: number,
  ): RevenueFigures => {
    const total = totalFor(buckets, keys);
    return {
      total: money(total),
      delta: delta(total, totalFor(buckets, previousKeys)),
      months: chartMonths,
      highlightMonth: MONTH_LABELS[highlight % 12],
      points,
    };
  };

  const currentQuarter = quarterMonths(thisMonth);
  const previousQuarter = currentQuarter.map((key) => key - 3);

  const ranges: Record<DateRange, RevenueFigures> = {
    "This month": figures([thisMonth], [thisMonth - 1], thisMonth),
    "Last month": figures([thisMonth - 1], [thisMonth - 2], thisMonth - 1),
    "This quarter": figures(currentQuarter, previousQuarter, thisMonth),
  };

  return ranges;
}

/**
 * The window the ledger aggregation must cover to answer every range above.
 *
 * It has to reach *forward*, not just back: "This quarter" includes the months
 * after the current one, and a booking scheduled for next month is already
 * recognised revenue. The current quarter ends at most two months out, so the
 * window runs to the start of the month after that.
 */
export function revenueWindow(today: Date) {
  const from = new Date(today.getFullYear(), today.getMonth() - 8, 1);
  const to = new Date(today.getFullYear(), today.getMonth() + 3, 1);
  return { from, to };
}

export const buildMonthlyFigures = buildLedgerRevenue;

/** "2026-09-14" or an ISO time to the bucket key every monthly figure uses. */
function monthIsoOf(dateKey: string): string {
  const [year, month] = dateKey.slice(0, 7).split("-").map(Number);
  return new Date(year, month - 1, 1).toISOString();
}

/** Amounts on calendar days into monthly buckets, for figures kept as day keys (quotations). */
export function bucketsFromDays(entries: { dateKey: string; cents: number }[]): RevenueMonthBucket[] {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    const key = monthIsoOf(entry.dateKey);
    totals.set(key, (totals.get(key) ?? 0) + entry.cents);
  }
  return [...totals.entries()].map(([monthIso, totalCents]) => ({
    monthIso,
    label: new Date(monthIso).toLocaleDateString("en-US", { month: "short" }),
    totalCents,
  }));
}

/** Month by month, one set of buckets less another: revenue less purchases. */
export function subtractBuckets(plus: RevenueMonthBucket[], minus: RevenueMonthBucket[]): RevenueMonthBucket[] {
  const totals = new Map<string, number>();
  for (const bucket of plus) totals.set(bucket.monthIso, (totals.get(bucket.monthIso) ?? 0) + bucket.totalCents);
  for (const bucket of minus) totals.set(bucket.monthIso, (totals.get(bucket.monthIso) ?? 0) - bucket.totalCents);
  return [...totals.entries()].map(([monthIso, totalCents]) => ({
    monthIso,
    label: new Date(monthIso).toLocaleDateString("en-US", { month: "short" }),
    totalCents,
  }));
}

/** The month keys each range covers, and the period before it. */
function rangeKeys(today: Date): Record<DateRange, { keys: number[]; previous: number[] }> {
  const thisMonth = monthKey(today.getFullYear(), today.getMonth());
  const quarter = quarterMonths(thisMonth);
  return {
    "This month": { keys: [thisMonth], previous: [thisMonth - 1] },
    "Last month": { keys: [thisMonth - 1], previous: [thisMonth - 2] },
    "This quarter": { keys: quarter, previous: quarter.map((key) => key - 3) },
  };
}

function keyOfDay(dateKey: string): number {
  const [year, month] = dateKey.split("-").map(Number);
  return monthKey(year, month - 1);
}

const CHANNEL_COLORS = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)"];

/**
 * The Bookings card for each range: bookings scheduled in it, cancellations
 * left out, against the period before, and how they reached the shop.
 */
export function bookingFigures(
  bookings: { dateKey: string; status: BookingStatus; channel: string; valueCents: number }[],
  today: Date,
): Record<DateRange, Pick<DashboardRangeData, "bookingsTotal" | "bookingsDelta" | "bookingRows">> {
  const standing = bookings.filter((booking) => booking.status !== "Cancelled");
  const result = {} as Record<DateRange, Pick<DashboardRangeData, "bookingsTotal" | "bookingsDelta" | "bookingRows">>;
  for (const [range, { keys, previous }] of Object.entries(rangeKeys(today)) as [DateRange, { keys: number[]; previous: number[] }][]) {
    const inRange = standing.filter((booking) => keys.includes(keyOfDay(booking.dateKey)));
    const before = standing.filter((booking) => previous.includes(keyOfDay(booking.dateKey))).length;
    const channels = new Map<string, { count: number; cents: number }>();
    for (const booking of inRange) {
      const entry = channels.get(booking.channel) ?? { count: 0, cents: 0 };
      entry.count += 1;
      entry.cents += booking.valueCents;
      channels.set(booking.channel, entry);
    }
    const rows: BookingRow[] = [...channels.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 4)
      .map(([label, entry], index) => ({
        label,
        percent: `${Math.round((entry.count / inRange.length) * 100)}%`,
        color: CHANNEL_COLORS[index],
        detail: {
          left: `${entry.count} ${entry.count === 1 ? "booking" : "bookings"}`,
          right: formatMoney(entry.cents, false),
        },
      }));
    result[range] = {
      bookingsTotal: String(inRange.length),
      bookingsDelta: delta(inRange.length, before),
      bookingRows: rows,
    };
  }
  return result;
}

/**
 * The four tiles, every one from a real source. Revenue is the ledger;
 * expenses are what the shop paid for goods received; the net is the two
 * subtracted, month by month. The fourth is the quotations made, or, without
 * Quotations, the stock on hand. There is no balance tile: AEGIS has no bank
 * or cash account to read one from.
 */
export function buildKpis(input: {
  revenue: RevenueFigures;
  expenses: RevenueFigures;
  net: RevenueFigures;
  quoted: RevenueFigures | null;
  stockValueCents: number | null;
}): Kpi[] {
  const tile = (label: string, icon: string, tone: Kpi["tone"], figures: RevenueFigures): Kpi => ({
    label,
    value: figures.total,
    icon,
    tone,
    delta: figures.delta,
    points: figures.points,
  });
  const fourth: Kpi = input.quoted
    ? tile("Quoted", "file-text", "accent", input.quoted)
    : {
        label: "Stock value",
        value: formatMoney(input.stockValueCents ?? 0),
        icon: "package",
        tone: "accent",
        delta: "",
        points: [1, 1],
      };
  return [
    tile("Revenue", "trending-up", "positive", input.revenue),
    tile("Expenses (purchases)", "credit-card", "negative", input.expenses),
    tile("Revenue − purchases", "bar-chart-2", "accent", input.net),
    fourth,
  ];
}
