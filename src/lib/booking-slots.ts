import { phoneKey } from "@/lib/crm";
import type { BookingStatus } from "@/types";

/**
 * The rules of the public booking page, kept pure so the page, the server
 * action and `scripts/booking-page-check.ts` all apply exactly the same ones.
 *
 * Every time here is Asia/Manila. The Philippines keeps no daylight saving, so
 * a fixed +08:00 offset is exact, and building dates with it means the server's
 * own timezone can never move a customer's slot.
 */

export const TIMEZONE_LABEL = "Asia/Manila";
const OFFSET = "+08:00";
const OFFSET_MS = 8 * 3_600_000;

/** Hourly starts, 08:00 to 16:00, so the last appointment starts at 4pm. */
export const SLOT_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16];
export const SLOT_MINUTES = 60;
/** Bookings a single slot can hold, online and staff-made together. */
export const SLOT_CAPACITY = 2;
export const DAYS_AHEAD = 60;
/** 0 is Sunday. Closed. */
export const CLOSED_WEEKDAYS = [0];

export const HEARD_FROM = [
  "Facebook",
  "Google",
  "Friend or family",
  "Returning customer",
  "Saw the shop",
  "Other",
];

/** "2026-09-30" for the Manila calendar day `date` falls on. */
export function manilaDateKey(date: Date): string {
  return new Date(date.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** Noon Manila is 04:00 UTC the same day, so the UTC weekday is Manila's. */
function manilaWeekday(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00${OFFSET}`).getUTCDay();
}

/** The instant a slot starts: `2026-09-30`, 9 → 09:00 Manila. */
export function slotStart(dateKey: string, hour: number): Date {
  return new Date(`${dateKey}T${String(hour).padStart(2, "0")}:00:00${OFFSET}`);
}

function addDays(dateKey: string, days: number): string {
  const noon = new Date(`${dateKey}T12:00:00${OFFSET}`);
  return manilaDateKey(new Date(noon.getTime() + days * 86_400_000));
}

/** "9:00 AM" */
export function formatSlotTime(hour: number): string {
  const suffix = hour < 12 ? "AM" : "PM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:00 ${suffix}`;
}

/** "Wed, Sep 30, 2026" */
export function formatSlotDay(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00${OFFSET}`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  });
}

/** "Wed, Sep 30, 2026 · 9:00 AM", for any instant, in Manila time. */
export function formatManila(date: Date): string {
  const day = formatSlotDay(manilaDateKey(date));
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  });
  return `${day} · ${time}`;
}

export interface OpenDay {
  /** "2026-09-30" */
  date: string;
  /** Hours still open that day, e.g. [9, 10, 14]. */
  hours: number[];
}

/**
 * Every bookable day in the window with the hours still open. A day that has
 * begun loses the slots that have already started; Sundays never appear; a
 * slot holding `SLOT_CAPACITY` non-cancelled bookings is full.
 *
 * `bookings` may be any bookings in the window, staff-made ones included, so a
 * slot the shop filled by phone is not offered online as well.
 */
export function openDays(
  now: Date,
  bookings: { startsAt: Date; status: BookingStatus }[],
): OpenDay[] {
  const taken = new Map<number, number>();
  for (const booking of bookings) {
    if (booking.status === "Cancelled") continue;
    // Counted against the slot it starts in, so a 09:30 staff booking fills
    // part of the 9 o'clock slot. Flooring to the UTC hour is flooring to the
    // Manila hour, because the offset is a whole number of hours.
    const hourStart = Math.floor(booking.startsAt.getTime() / 3_600_000) * 3_600_000;
    taken.set(hourStart, (taken.get(hourStart) ?? 0) + 1);
  }

  const today = manilaDateKey(now);
  const days: OpenDay[] = [];
  for (let offset = 0; offset < DAYS_AHEAD; offset += 1) {
    const date = addDays(today, offset);
    if (CLOSED_WEEKDAYS.includes(manilaWeekday(date))) continue;
    const hours = SLOT_HOURS.filter((hour) => {
      const start = slotStart(date, hour);
      if (start.getTime() <= now.getTime()) return false;
      return (taken.get(start.getTime()) ?? 0) < SLOT_CAPACITY;
    });
    if (hours.length > 0) days.push({ date, hours });
  }
  return days;
}

/** The first and last calendar days a customer may pick, for the date input. */
export function bookingWindow(now: Date): { min: string; max: string } {
  const min = manilaDateKey(now);
  return { min, max: addDays(min, DAYS_AHEAD - 1) };
}

/**
 * Whether a requested slot is one the page could have offered, ignoring how
 * full it is: in the window, on an open day, on the hour grid, not started.
 */
export function isOfferableSlot(dateKey: string, hour: number, now: Date): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  if (!SLOT_HOURS.includes(hour)) return false;
  const { min, max } = bookingWindow(now);
  if (dateKey < min || dateKey > max) return false;
  if (CLOSED_WEEKDAYS.includes(manilaWeekday(dateKey))) return false;
  return slotStart(dateKey, hour).getTime() > now.getTime();
}

/** A Philippine mobile: 09XXXXXXXXX, however it was spaced or prefixed. */
export function isPhilippineMobile(input: string): boolean {
  return /^09\d{9}$/.test(phoneKey(input));
}

/** Codes avoid 0/O and 1/I, which people misread when copying them down. */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 8;

/** "AB7K3Q9P" → "AB7K-3Q9P", the way it is shown. */
export function formatCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** What a customer typed back to the stored form: upper case, no dash or spaces. */
export function normaliseCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isWellFormedCode(code: string): boolean {
  return code.length === CODE_LENGTH && [...code].every((char) => CODE_ALPHABET.includes(char));
}

/** How each status reads to the customer who made the request. */
export const CUSTOMER_STATUS: Record<BookingStatus, { title: string; detail: string }> = {
  Pending: {
    title: "Waiting for confirmation",
    detail: "We have your request. Our team will confirm the time with you.",
  },
  Confirmed: { title: "Confirmed", detail: "Your appointment is booked. See you then." },
  "In progress": { title: "In the workshop", detail: "Our team is working on your vehicle now." },
  Completed: { title: "Completed", detail: "The work is done. Thank you for choosing us." },
  Cancelled: {
    title: "Cancelled",
    detail: "This appointment was cancelled. Book again any time, or call us.",
  },
};
