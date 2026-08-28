import type {
  DateRange,
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
  const change = ((current - previous) / previous) * 100;
  return `${change.toFixed(1)}%`;
}

function quarterMonths(key: number): number[] {
  const month = key % 12;
  const firstOfQuarter = key - (month % 3);
  return [firstOfQuarter, firstOfQuarter + 1, firstOfQuarter + 2];
}

export function buildLedgerRevenue(
  months: RevenueMonthBucket[],
  today: Date,
): LedgerRevenue {
  const buckets = new Map<number, number>();
  for (const bucket of months) {
    const date = new Date(bucket.monthIso);
    buckets.set(
      monthKey(date.getFullYear(), date.getMonth()),
      bucket.totalCents,
    );
  }

  const thisMonth = monthKey(today.getFullYear(), today.getMonth());

  /** The trailing window the chart and the KPI sparkline both read. */
  const chartKeys = Array.from(
    { length: CHART_MONTHS },
    (_, index) => thisMonth - (CHART_MONTHS - 1 - index),
  );

  const chartMonths = chartKeys.map((key) => ({
    label: MONTH_LABELS[key % 12],
    // The chart works in dollars; the ledger stores cents.
    value: (buckets.get(key) ?? 0) / 100,
  }));

  const points = chartKeys.map((key) => (buckets.get(key) ?? 0) / 100);

  const money = (cents: number) =>
    `$ ${(cents / 100).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

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
