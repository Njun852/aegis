/**
 * Indexes owner text alerts rely on, kept in one place so `scripts/seed.ts` (a
 * fresh database) and `scripts/owner-alerts-check.ts` (an existing one) create
 * the same set.
 */
export interface OwnerAlertIndex {
  collection: "ownerAlerts";
  keys: Record<string, 1 | -1>;
  options?: { unique?: boolean };
}

export const OWNER_ALERT_INDEXES: OwnerAlertIndex[] = [
  // One text per event per person: an event raised twice, by a retry or a
  // double click, is written and paid for once.
  { collection: "ownerAlerts", keys: { businessId: 1, eventKey: 1, to: 1 }, options: { unique: true } },
  // The daily limit and the panel's recent list read by this.
  { collection: "ownerAlerts", keys: { businessId: 1, createdAt: -1 } },
];
