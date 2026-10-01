/**
 * Full report rehearsal.
 *
 *   npm run report:check
 *
 * Proves the parts of the report that are arithmetic rather than layout: which
 * days each range covers (at month, quarter and year edges), which bookings
 * fall inside a period and what they add up to, and that a malformed AI reply
 * is rejected instead of being cached and shown.
 *
 * Pure: it reads and writes nothing, and never calls the model.
 */
import assert from "node:assert/strict";
import {
  REPORT_RANGE_SLUGS,
  changeBetween,
  parseReportSummary,
  periodBounds,
  periodFor,
  rangeFromSlug,
  summariseBookings,
} from "@/lib/report";

const day = (year: number, month: number, date: number, hour = 12) =>
  new Date(year, month - 1, date, hour);
const same = (a: Date, b: Date) => a.getTime() === b.getTime();

// ---- Periods ----------------------------------------------------------------

const october = periodBounds("This month", day(2026, 10, 1));
assert.ok(same(october.from, new Date(2026, 9, 1)), "a month starts at midnight on the 1st");
assert.ok(same(october.to, new Date(2026, 10, 1)), "…and ends where the next begins");
assert.ok(same(october.previousFrom, new Date(2026, 8, 1)) && same(october.previousTo, october.from));
assert.equal(periodFor("This month", day(2026, 10, 1)).label, "Oct 1 – Oct 31, 2026");
assert.equal(periodFor("This month", day(2026, 10, 31, 23)).label, "Oct 1 – Oct 31, 2026", "the last evening is still October");
assert.equal(periodFor("Last month", day(2026, 10, 1)).label, "Sep 1 – Sep 30, 2026");
assert.equal(periodFor("Last month", day(2026, 10, 1)).previousLabel, "Aug 1 – Aug 31, 2026");

assert.equal(periodFor("This quarter", day(2026, 10, 1)).label, "Oct 1 – Dec 31, 2026");
assert.equal(periodFor("This quarter", day(2026, 12, 31)).label, "Oct 1 – Dec 31, 2026");
assert.equal(periodFor("This quarter", day(2026, 10, 1)).previousLabel, "Jul 1 – Sep 30, 2026");

// Across a year end.
assert.equal(periodFor("Last month", day(2027, 1, 15)).label, "Dec 1 – Dec 31, 2026");
assert.equal(periodFor("This quarter", day(2027, 2, 10)).previousLabel, "Oct 1 – Dec 31, 2026");
assert.equal(periodFor("This month", day(2028, 2, 10)).label, "Feb 1 – Feb 29, 2028", "a leap February");

for (const [range, slug] of Object.entries(REPORT_RANGE_SLUGS)) {
  assert.equal(rangeFromSlug(slug), range);
}
assert.equal(rangeFromSlug("nonsense"), "This month", "an unknown range falls back, it does not throw");
assert.equal(rangeFromSlug(undefined), "This month");

assert.equal(changeBetween(150, 100), "50.0%");
assert.equal(changeBetween(50, 100), "-50.0%");
assert.equal(changeBetween(100, 0), null, "no percentage for 'up from nothing'");

console.log("✓ periods: month, quarter, year end, leap year; range links");

// ---- Bookings ---------------------------------------------------------------

const booking = (
  startsAt: Date,
  status: "Pending" | "Confirmed" | "In progress" | "Completed" | "Cancelled",
  valueCents: number,
  extra: Partial<{ service: string; channel: string; online: boolean }> = {},
) => ({
  startsAt,
  status,
  valueCents,
  service: "PMS",
  channel: "Phone",
  online: false,
  ...extra,
});

const summary = summariseBookings(
  [
    booking(new Date(2026, 9, 1, 0, 0), "Completed", 10_000),
    booking(day(2026, 10, 15), "Cancelled", 99_999, { service: "Detailing" }),
    booking(day(2026, 10, 20), "Pending", 0, { channel: "Website form", online: true }),
    booking(day(2026, 10, 31, 23), "Confirmed", 5_000, { service: "Brakes" }),
    booking(new Date(2026, 10, 1, 0, 0), "Confirmed", 7_000),
    booking(day(2026, 9, 30, 23), "Completed", 3_000),
  ],
  october.from,
  october.to,
);

assert.equal(summary.total, 4, "the first instant of the period is in; the first of the next is out");
assert.equal(summary.bookedValueCents, 15_000, "a cancelled booking is counted but adds no value");
assert.equal(summary.byStatus.find((row) => row.status === "Cancelled")?.count, 1);
assert.equal(summary.byStatus.length, 5, "every status is listed, zeros included");
assert.equal(summary.online, 1);
assert.deepEqual(summary.byChannel[0], { channel: "Phone", count: 3 });
assert.deepEqual(summary.topServices[0], { service: "PMS", count: 2, valueCents: 10_000 });
assert.equal(
  summary.topServices.find((row) => row.service === "Detailing")?.valueCents,
  0,
  "a cancelled service shows as booked but worth nothing",
);

const empty = summariseBookings([], october.from, october.to);
assert.equal(empty.total, 0);
assert.equal(empty.bookedValueCents, 0);

console.log("✓ bookings: period edges, cancellations, channels, top services");

// ---- AI reply ---------------------------------------------------------------

const good = parseReportSummary({
  headline: " Booked revenue rose. ",
  highlights: ["a", "b", "c", "d", "e"],
  risks: [],
  actions: ["x", " "],
});
assert.equal(good?.headline, "Booked revenue rose.");
assert.equal(good?.highlights.length, 4, "lists are cut to their limits");
assert.deepEqual(good?.actions, ["x"], "blank lines are dropped");

assert.equal(parseReportSummary(null), null);
assert.equal(parseReportSummary({ headline: "", highlights: ["a"], risks: [], actions: [] }), null);
assert.equal(parseReportSummary({ headline: "h", highlights: [], risks: [], actions: [] }), null, "a summary with nothing in it is not kept");
assert.equal(parseReportSummary({ headline: "h", highlights: ["a"], risks: "none", actions: [] }), null);
assert.equal(parseReportSummary({ headline: "h", highlights: [1], risks: [], actions: [] }), null);

console.log("✓ AI summary: malformed replies rejected, limits enforced");
