/**
 * Indexes Quotations relies on, kept in one place so `scripts/seed.ts` (a fresh
 * database) and `scripts/quote-check.ts` (an existing one) create the same set.
 */
export interface QuotationIndex {
  collection: "quotations" | "quotePriceItems" | "quotePhotos" | "quotationRevisions" | "quoteEvents" | "jobOrders";
  keys: Record<string, 1 | -1>;
  options?: { unique?: boolean };
}

export const QUOTATION_INDEXES: QuotationIndex[] = [
  { collection: "quotations", keys: { businessId: 1, ref: 1 }, options: { unique: true } },
  { collection: "quotations", keys: { businessId: 1, updatedAt: -1 } },
  // The booking drawer lists the quotations made for it.
  { collection: "quotations", keys: { businessId: 1, bookingRef: 1 } },
  // One remembered line per wording per section, so saving the same job twice
  // updates its price rather than listing it twice.
  {
    collection: "quotePriceItems",
    keys: { businessId: 1, section: 1, key: 1 },
    options: { unique: true },
  },
  { collection: "quotePhotos", keys: { businessId: 1, ref: 1 }, options: { unique: true } },
  // The daily cap on photo reads counts by this.
  { collection: "quotePhotos", keys: { businessId: 1, createdAt: -1 } },
  // Each superseded version is written once: two saves racing to supersede the
  // same revision cannot both succeed.
  {
    collection: "quotationRevisions",
    keys: { businessId: 1, quotationRef: 1, revision: 1 },
    options: { unique: true },
  },
  { collection: "quoteEvents", keys: { businessId: 1, quotationRef: 1, at: -1 } },
  { collection: "jobOrders", keys: { businessId: 1, ref: 1 }, options: { unique: true } },
  // One job order per quotation, so converting twice cannot book the work twice.
  { collection: "jobOrders", keys: { businessId: 1, quotationRef: 1 }, options: { unique: true } },
  { collection: "jobOrders", keys: { businessId: 1, updatedAt: -1 } },
  // A booking's status follows its job orders, read by this on every move.
  { collection: "jobOrders", keys: { businessId: 1, bookingRef: 1 } },
];
