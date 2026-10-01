import type { BookingStatus, CustomerSummary, MonthValue } from "@/types";

/**
 * Pure helpers for CRM. Database access lives in `src/lib/dal/customers.ts`;
 * nothing here touches Mongo, so these are safe in client components and in
 * `scripts/crm-check.ts`, which asserts them.
 */

/**
 * One key per phone number however it was typed. Philippine numbers arrive as
 * "0917 123 4567", "+63 917 123 4567" or "639171234567"; all become
 * "09171234567". Empty when there are no digits, so a blank phone never
 * matches another blank phone.
 */
export function phoneKey(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("63") && digits.length === 12) return `0${digits.slice(2)}`;
  return digits;
}

export function emailKey(email: string): string {
  return email.trim().toLowerCase();
}

/** Seen in the window when any linked booking, other than a cancelled one, falls inside it. */
export const ACTIVE_WINDOW_DAYS = 90;

/**
 * Booked value per calendar month for the twelve months ending with `today`'s,
 * oldest first. Cancelled bookings are left out, as the ledger voids them.
 * Months with nothing booked are kept at zero so the chart has no gaps.
 */
export function monthlyBookedValue(
  bookings: { startsAt: string; valueCents: number; status: BookingStatus }[],
  today: Date,
): MonthValue[] {
  const months: MonthValue[] = [];
  for (let back = 11; back >= 0; back -= 1) {
    const month = new Date(today.getFullYear(), today.getMonth() - back, 1);
    months.push({
      key: monthKey(month),
      label: month.toLocaleDateString("en-US", { month: "short" }),
      valueCents: 0,
    });
  }

  const byKey = new Map(months.map((month) => [month.key, month]));
  for (const booking of bookings) {
    if (booking.status === "Cancelled") continue;
    const bucket = byKey.get(monthKey(new Date(booking.startsAt)));
    if (bucket) bucket.valueCents += booking.valueCents;
  }
  return months;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function filterCustomers(customers: CustomerSummary[], search: string): CustomerSummary[] {
  const term = search.trim().toLowerCase();
  if (!term) return customers;
  const digits = phoneKey(search);
  return customers.filter(
    (customer) =>
      customer.name.toLowerCase().includes(term) ||
      customer.company.toLowerCase().includes(term) ||
      customer.email.toLowerCase().includes(term) ||
      customer.ref.toLowerCase().includes(term) ||
      (digits.length >= 3 && phoneKey(customer.phone).includes(digits)),
  );
}

/**
 * Most recently active first; customers with no bookings yet follow, newest
 * record first, so someone just added is easy to find.
 */
export function sortByActivity(customers: CustomerSummary[]): CustomerSummary[] {
  return [...customers].sort((a, b) => {
    if (a.lastActivityAt && b.lastActivityAt) return b.lastActivityAt.localeCompare(a.lastActivityAt);
    if (a.lastActivityAt) return -1;
    if (b.lastActivityAt) return 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/** Seen within the active window: a linked booking in the last 90 days or booked ahead. */
export function isRecentlyActive(customer: CustomerSummary, today: Date): boolean {
  if (!customer.lastActivityAt) return false;
  const since = today.getTime() - ACTIVE_WINDOW_DAYS * 86_400_000;
  return new Date(customer.lastActivityAt).getTime() >= since;
}

export function isNewThisMonth(customer: CustomerSummary, today: Date): boolean {
  const created = new Date(customer.createdAt);
  return created.getFullYear() === today.getFullYear() && created.getMonth() === today.getMonth();
}
