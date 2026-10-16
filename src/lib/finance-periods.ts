import { manilaDateKey } from "@/lib/booking-slots";
import { isDateKey } from "@/lib/quotations";
import type { DateKey, MonthKey } from "@/types";

/**
 * Reporting periods for Finance, all in Asia/Manila.
 *
 * Finance records are dated with day keys ("2026-09-30"), so a month is the
 * keys that start with "2026-09" and no timezone ever enters the question.
 * Only a real instant (when a report was generated, a timer firing) is turned
 * into a key, through Manila's fixed +08:00 offset. Mongo's own `$month`
 * groups in UTC, which would put a sale made before 8 AM on the 1st into the
 * previous month, so nothing here relies on it.
 */

export { isDateKey };

export function isMonthKey(value: string): value is MonthKey {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function monthKeyOf(date: Date): MonthKey {
  return manilaDateKey(date).slice(0, 7);
}

export function monthOfDay(day: DateKey): MonthKey {
  return day.slice(0, 7);
}

export function inMonth(day: DateKey, month: MonthKey): boolean {
  return monthOfDay(day) === month;
}

export function addMonths(month: MonthKey, count: number): MonthKey {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, index - 1 + count, 1));
  return date.toISOString().slice(0, 7);
}

/** The first and last day of a month, both inclusive. */
export function monthDays(month: MonthKey): { first: DateKey; last: DateKey } {
  const [year, index] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, index, 0)).getUTCDate();
  return { first: `${month}-01`, last: `${month}-${String(last).padStart(2, "0")}` };
}

/**
 * The instants a Manila month covers, half-open `[from, to)`, for the few
 * fields that are real timestamps rather than day keys.
 */
export function monthWindow(month: MonthKey): { from: Date; to: Date } {
  return {
    from: new Date(`${month}-01T00:00:00+08:00`),
    to: new Date(`${addMonths(month, 1)}-01T00:00:00+08:00`),
  };
}

/**
 * The month that has just ended in Manila: the one the automatic close
 * freezes. On 1 October 2026 at 00:05 Manila it is "2026-09", even though UTC
 * still reads 30 September.
 */
export function monthToClose(now: Date): MonthKey {
  return addMonths(monthKeyOf(now), -1);
}

/** January to December of a year, for the annual report. */
export function monthsOfYear(year: number): MonthKey[] {
  return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
}

/** "September 2026". */
export function monthLabel(month: MonthKey): string {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year, index - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Whole days from one day to another; negative when `to` is earlier. */
export function daysBetween(from: DateKey, to: DateKey): number {
  const at = (day: DateKey) => {
    const [year, month, date] = day.split("-").map(Number);
    return Date.UTC(year, month - 1, date);
  };
  return Math.round((at(to) - at(from)) / 86_400_000);
}

export function addDaysToKey(day: DateKey, count: number): DateKey {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + count)).toISOString().slice(0, 10);
}
