/**
 * Bookings calendar rehearsal.
 *
 *   npm run calendar:check
 *
 * Proves the month grid the calendar view draws: where each month starts, how
 * many weeks it takes, the neighbouring days that fill out the first and last
 * rows, stepping across a year end, and that bookings land on the day the
 * server stamped them with, in start order.
 *
 * Pure: it reads and writes nothing.
 */
import assert from "node:assert/strict";
import {
  bookingsByDay,
  dateKeyOf,
  longDayLabel,
  monthGrid,
  monthLabel,
  monthOfKey,
  monthPrefix,
  shiftMonth,
  startTime,
} from "@/lib/booking-calendar";
import type { Booking } from "@/types";

// October 2026 starts on a Thursday and has 31 days: five rows.
const october = monthGrid({ year: 2026, month: 9 });
assert.equal(october.length, 5);
assert.ok(october.every((week) => week.length === 7), "every row is a whole week");
assert.equal(october[0][0].dateKey, "2026-09-27", "the first row starts on the Sunday before");
assert.equal(october[0][0].inMonth, false);
assert.equal(october[0][4].dateKey, "2026-10-01", "the 1st falls under Thursday");
assert.equal(october[0][4].inMonth, true);
assert.equal(october[4][6].dateKey, "2026-10-31", "the 31st is the last Saturday");

// August 2026 starts on a Saturday and needs six rows.
const august = monthGrid({ year: 2026, month: 7 });
assert.equal(august.length, 6);
assert.equal(august[0][6].dateKey, "2026-08-01");
assert.equal(august[5][1].dateKey, "2026-08-31");
assert.equal(august[5][2].dateKey, "2026-09-01");
assert.equal(august[5][2].inMonth, false);

// February 2026 starts on a Sunday and has 28 days: exactly four rows.
const february = monthGrid({ year: 2026, month: 1 });
assert.equal(february.length, 4);
assert.ok(february.flat().every((day) => day.inMonth), "a month that fits its weeks has no filler days");
assert.equal(monthGrid({ year: 2028, month: 1 }).flat().filter((day) => day.inMonth).length, 29, "leap February");

assert.deepEqual(shiftMonth({ year: 2026, month: 11 }, 1), { year: 2027, month: 0 });
assert.deepEqual(shiftMonth({ year: 2027, month: 0 }, -1), { year: 2026, month: 11 });
assert.deepEqual(shiftMonth({ year: 2026, month: 9 }, -10), { year: 2025, month: 11 });

assert.equal(monthLabel({ year: 2026, month: 9 }), "October 2026");
assert.equal(monthPrefix({ year: 2026, month: 0 }), "2026-01");
assert.deepEqual(monthOfKey("2026-10-01"), { year: 2026, month: 9 });
assert.equal(longDayLabel("2026-10-01"), "Thursday, October 1, 2026");
assert.equal(dateKeyOf(new Date(2026, 9, 1, 23, 59)), "2026-10-01", "late evening is still that day");
assert.equal(dateKeyOf(new Date(2026, 0, 5, 0, 0)), "2026-01-05");

const booking = (ref: string, dateKey: string, startsAt: string, time: string) =>
  ({ ref, dateKey, startsAt, time }) as Booking;

const days = bookingsByDay([
  booking("BK-3", "2026-10-01", "2026-10-01T07:00:00.000Z", "15:00 – 16:00"),
  booking("BK-1", "2026-10-01", "2026-10-01T01:00:00.000Z", "09:00 – 09:45"),
  booking("BK-2", "2026-10-02", "2026-10-02T01:00:00.000Z", "09:00 – 10:00"),
]);
assert.deepEqual(days.get("2026-10-01")?.map((entry) => entry.ref), ["BK-1", "BK-3"], "a day's bookings are in start order");
assert.equal(days.get("2026-10-02")?.length, 1);
assert.equal(days.get("2026-10-03"), undefined);
assert.equal(startTime({ time: "09:00 – 09:45" }), "09:00");

console.log("✓ calendar: month grids, filler days, year ends, day grouping");
