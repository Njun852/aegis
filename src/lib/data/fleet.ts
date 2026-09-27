/**
 * The indexes Fleet relies on, kept in one place so `scripts/seed.ts` (a fresh
 * database) and `scripts/fleet-check.ts` (an existing one) create exactly the
 * same set. Creating an index that already exists is a no-op, so both can run
 * as often as they like.
 *
 * Three of these are what keep the data honest rather than just fast: one car
 * per plate, one history line per booking, one record per ref.
 */
export interface FleetIndex {
  collection: "customers" | "vehicles" | "serviceRecords";
  keys: Record<string, 1 | -1>;
  options?: {
    unique?: boolean;
    partialFilterExpression?: Record<string, unknown>;
  };
}

export const FLEET_INDEXES: FleetIndex[] = [
  { collection: "customers", keys: { businessId: 1, ref: 1 }, options: { unique: true } },
  { collection: "customers", keys: { businessId: 1, name: 1 } },
  { collection: "vehicles", keys: { businessId: 1, ref: 1 }, options: { unique: true } },
  // "ABC 1234" and "abc-1234" share a key, so they cannot become two cars.
  { collection: "vehicles", keys: { businessId: 1, plateKey: 1 }, options: { unique: true } },
  { collection: "vehicles", keys: { businessId: 1, customerRef: 1 } },
  { collection: "serviceRecords", keys: { businessId: 1, ref: 1 }, options: { unique: true } },
  { collection: "serviceRecords", keys: { businessId: 1, vehicleRef: 1, performedAt: -1 } },
  // One history line per booking, however often its status is changed. Partial,
  // because manual records have no booking and must not collide on "missing".
  {
    collection: "serviceRecords",
    keys: { businessId: 1, bookingRef: 1 },
    options: { unique: true, partialFilterExpression: { bookingRef: { $type: "string" } } },
  },
];
