/**
 * The indexes CRM relies on, kept in one place so `scripts/seed.ts` (a fresh
 * database) and `scripts/crm-check.ts` (an existing one) create the same set.
 * The customers collection's ref index lives in `FLEET_INDEXES`, which made the
 * collection first.
 *
 * None of these are unique. Families share a phone and small firms share an
 * inbox, so a match is a warning for a person to weigh, not a refusal.
 */
export interface CrmIndex {
  collection: "customers" | "bookings";
  keys: Record<string, 1 | -1>;
}

export const CRM_INDEXES: CrmIndex[] = [
  { collection: "customers", keys: { businessId: 1, phoneKey: 1 } },
  { collection: "customers", keys: { businessId: 1, emailKey: 1 } },
  // A customer's bookings, for the profile and the list's totals.
  { collection: "bookings", keys: { businessId: 1, customerRef: 1 } },
];
