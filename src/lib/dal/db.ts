import "server-only";

import type { Collection, Db, Document } from "mongodb";
import clientPromise from "@/lib/db/mongodb";
import type { BusinessDocument, MailSyncDocument, Membership } from "@/types";

/**
 * The single place the database handle is produced. Nothing outside
 * `src/lib/dal` imports this — screens go through the DAL functions so the
 * session check and the tenant filter can never be skipped.
 */
export async function getDb(): Promise<Db> {
  const client = await clientPromise;
  return client.db(process.env.MONGODB_DB_NAME);
}

export interface UserDocument {
  username: string;
  email: string;
  name: string;
  passwordHash: string;
  role: "aegis_admin" | "member";
  defaultBusinessId: string;
  createdAt: Date;
}

export const COLLECTIONS = {
  users: "users",
  businesses: "businesses",
  memberships: "memberships",
  mailSync: "mailSync",
} as const;

async function collection<T extends Document>(name: string): Promise<Collection<T>> {
  const db = await getDb();
  return db.collection<T>(name);
}

export const usersCollection = () =>
  collection<UserDocument>(COLLECTIONS.users);
export const businessesCollection = () =>
  collection<BusinessDocument>(COLLECTIONS.businesses);
export const membershipsCollection = () =>
  collection<Membership>(COLLECTIONS.memberships);

/**
 * Mail sync state carries a `businessId` like any tenant-owned collection, but
 * is reached by explicit id rather than through `tenantScope`: the admin screen
 * reports on a business other than the one the admin is currently switched to.
 * Every caller passes the id deliberately and is gated by `requireAdmin` or by
 * the active session — see `src/lib/dal/mailbox.ts`.
 */
export const mailSyncCollection = () =>
  collection<MailSyncDocument>(COLLECTIONS.mailSync);

export interface DatabasePing {
  ok: boolean;
  latencyMs: number;
  /** The driver's own message when the ping failed. */
  error: string | null;
  /** Database actually in use, so dev and production are distinguishable. */
  name: string;
}

/**
 * Round-trips a `ping` to MongoDB.
 *
 * The status screen must not infer that the database is up from a page having
 * rendered — a cached render proves nothing. This asks the server directly and
 * reports what it says, including how long it took to say it.
 */
export async function pingDatabase(): Promise<DatabasePing> {
  const started = Date.now();
  const name = process.env.MONGODB_DB_NAME ?? "(unset)";

  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    return { ok: true, latencyMs: Date.now() - started, error: null, name };
  } catch (cause) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: cause instanceof Error ? cause.message : String(cause),
      name,
    };
  }
}
