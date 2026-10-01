import type { Booking } from "@/types";

/**
 * The bookings calendar's date maths, kept pure and free of timezones.
 *
 * A booking arrives with `dateKey` ("2026-10-01"), the calendar day the server
 * formatted its `day` and `time` strings for. The calendar only ever compares
 * and steps those keys, so the grid the server renders and the one the browser
 * hydrates are the same grid wherever either of them is running.
 */

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Sunday first, as local calendars are printed. */
export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface CalendarMonth {
  year: number;
  /** 0 is January. */
  month: number;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** The server-side half: the local calendar day of an instant, as a key. */
export function dateKeyOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function monthOfKey(dateKey: string): CalendarMonth {
  const [year, month] = dateKey.split("-").map(Number);
  return { year, month: month - 1 };
}

/** "2026-10", what every key in the month starts with. */
export function monthPrefix({ year, month }: CalendarMonth): string {
  return `${year}-${pad(month + 1)}`;
}

export function monthLabel({ year, month }: CalendarMonth): string {
  return `${MONTH_NAMES[month]} ${year}`;
}

export function shiftMonth({ year, month }: CalendarMonth, by: number): CalendarMonth {
  const index = year * 12 + month + by;
  return { year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 };
}

export interface CalendarDay {
  dateKey: string;
  /** 1 to 31. */
  day: number;
  /** False for the days of the neighbouring months that fill out the grid. */
  inMonth: boolean;
}

/**
 * The weeks a month is drawn as: whole weeks, Sunday to Saturday, so the first
 * and last rows carry days from the months either side. UTC is used purely as a
 * timezone-free calendar here; no instant is involved.
 */
export function monthGrid({ year, month }: CalendarMonth): CalendarDay[][] {
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

  const weeks: CalendarDay[][] = [];
  for (let index = 0; index < cells; index += 1) {
    const date = new Date(Date.UTC(year, month, 1 - firstWeekday + index));
    if (index % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push({
      dateKey: date.toISOString().slice(0, 10),
      day: date.getUTCDate(),
      inMonth: date.getUTCMonth() === month,
    });
  }
  return weeks;
}

/** "Thursday, October 1, 2026", from a key alone. */
export function longDayLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return `${names[weekday]}, ${MONTH_NAMES[month - 1]} ${day}, ${year}`;
}

/** Bookings grouped by day, each day's in start order. */
export function bookingsByDay(bookings: Booking[]): Map<string, Booking[]> {
  const days = new Map<string, Booking[]>();
  for (const booking of bookings) {
    const list = days.get(booking.dateKey);
    if (list) list.push(booking);
    else days.set(booking.dateKey, [booking]);
  }
  for (const list of days.values()) {
    list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }
  return days;
}

/** "09:00" from the server's "09:00 – 09:45". */
export function startTime(booking: Pick<Booking, "time">): string {
  return booking.time.split(" ")[0];
}
