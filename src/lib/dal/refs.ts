import "server-only";

/**
 * Sequential per-business refs (CU-1001, VH-1001, SR-1001) for the collections
 * that Fleet and CRM share. Bookings keep their own allocator.
 */

/** The one read ref allocation needs, which every scoped collection offers. */
export interface RefSource {
  find: (filter?: object) => {
    project: (projection: object) => { toArray: () => Promise<{ ref?: string }[]> };
  };
}

/** Mongo's duplicate-key error, optionally on one field of the index. */
export function isDuplicateKey(error: unknown, field?: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, keyPattern } = error as {
    code?: number;
    keyPattern?: Record<string, unknown>;
  };
  if (code !== 11000) return false;
  return field ? Boolean(keyPattern && field in keyPattern) : true;
}

/**
 * Next free ref. The highest number is found numerically rather than by
 * sorting the strings, which would put "VH-999" after "VH-1000". Two creates
 * at once can still pick the same number; the unique `{ businessId, ref }`
 * index turns that into error 11000, and `insertWithRef` retries.
 */
export async function nextRef(
  collection: RefSource,
  prefix: string,
  first: number,
): Promise<string> {
  const docs = await collection.find({}).project({ ref: 1, _id: 0 }).toArray();
  const highest = docs.reduce((max, doc) => {
    const parsed = Number.parseInt(String(doc.ref ?? "").replace(prefix, ""), 10);
    return Number.isFinite(parsed) && parsed > max ? parsed : max;
  }, first - 1);
  return `${prefix}${highest + 1}`;
}

export async function insertWithRef(
  collection: RefSource,
  prefix: string,
  first: number,
  insert: (ref: string) => Promise<unknown>,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const ref = await nextRef(collection, prefix, first);
    try {
      await insert(ref);
      return ref;
    } catch (error) {
      // Only a lost race for the ref is worth another go. Any other duplicate
      // (a taken plate) is the caller's to explain.
      if (!isDuplicateKey(error, "ref")) throw error;
    }
  }
  throw new Error(`Could not allocate a ${prefix} reference; please retry.`);
}

/**
 * A refusal the person can act on: a taken plate, a reading that goes
 * backwards, a customer no longer on file. Actions return its message to the
 * screen; any other error is a fault and is reported generically.
 */
export class InputError extends Error {}
