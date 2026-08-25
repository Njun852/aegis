import "server-only";

import type { Document, Filter, OptionalUnlessRequiredId } from "mongodb";
import { getDb } from "./db";
import { verifySession } from "./session";

/**
 * We store every tenant in one database, so the only thing standing between
 * businesses is the `businessId` filter — and a single forgotten filter is a
 * cross-tenant leak. Rather than trusting call sites to remember it, tenant
 * collections are reached only through this wrapper, which merges the active
 * business into every filter and stamps it onto every insert.
 *
 * Phase 2 collections (`bookings`, `transactions`) must use this exclusively.
 */
export async function tenantScope<
  T extends Document & { businessId: string },
>(name: string) {
  const { activeBusinessId } = await verifySession();
  const db = await getDb();
  const collection = db.collection<T>(name);

  const scoped = (filter: Filter<T> = {}) =>
    ({ ...filter, businessId: activeBusinessId }) as Filter<T>;

  return {
    businessId: activeBusinessId,

    find: (filter: Filter<T> = {}) => collection.find(scoped(filter)),

    findOne: (filter: Filter<T> = {}) => collection.findOne(scoped(filter)),

    countDocuments: (filter: Filter<T> = {}) =>
      collection.countDocuments(scoped(filter)),

    // The cast is unavoidable: TypeScript cannot see that adding back the one
    // key we omitted reconstitutes the generic document type.
    insertOne: (doc: Omit<OptionalUnlessRequiredId<T>, "businessId">) =>
      collection.insertOne({
        ...doc,
        businessId: activeBusinessId,
      } as unknown as OptionalUnlessRequiredId<T>),

    updateOne: (filter: Filter<T>, update: Document) =>
      collection.updateOne(scoped(filter), update),

    deleteOne: (filter: Filter<T>) => collection.deleteOne(scoped(filter)),

    /** Aggregations get the tenant match prepended; callers cannot opt out. */
    aggregate: (pipeline: Document[] = []) =>
      collection.aggregate([{ $match: { businessId: activeBusinessId } }, ...pipeline]),
  };
}
