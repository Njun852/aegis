/**
 * Indexes the public booking page relies on, kept in one place so
 * `scripts/seed.ts` (a fresh database) and `scripts/booking-page-check.ts` (an
 * existing one) create the same set.
 *
 * Both are unique and partial: only the documents that have the field are held
 * to it, so bookings made in the app and businesses without a page are left
 * alone.
 */
export interface BookingPageIndex {
  collection: "bookings" | "businesses";
  keys: Record<string, 1 | -1>;
  options: { unique: true; partialFilterExpression: Record<string, unknown> };
}

export const BOOKING_PAGE_INDEXES: BookingPageIndex[] = [
  // A code, with the customer's mobile, is how a request is retrieved; two
  // requests at one business must never share one.
  {
    collection: "bookings",
    keys: { businessId: 1, "request.code": 1 },
    options: { unique: true, partialFilterExpression: { "request.code": { $type: "string" } } },
  },
  // One business per public link.
  {
    collection: "businesses",
    keys: { "onlineBooking.slug": 1 },
    options: { unique: true, partialFilterExpression: { "onlineBooking.slug": { $type: "string" } } },
  },
];

/** Link names that would read as part of the app rather than a business. */
export const RESERVED_SLUGS = ["admin", "api", "book", "login", "new", "status", "test", "aegis"];
