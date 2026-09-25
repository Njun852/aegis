import "server-only";

import type { Collection, Db, Document } from "mongodb";
import clientPromise from "@/lib/db/mongodb";
import type {
  AdSyncDocument,
  BusinessDocument,
  MailSyncDocument,
  Membership,
  MessengerConversationDocument,
  MessengerStateDocument,
} from "@/types";

/**
 * The single place the database handle is produced. Nothing outside
 * `src/lib/dal` imports this — screens go through the DAL functions so the
 * session check and the tenant filter can never be skipped.
 */
export async function getDb(): Promise<Db> {
  const client = await clientPromise;
  return client.db(process.env.MONGODB_DB_NAME);
}

/**
 * Accounts made before email was dropped may still carry an `email` field.
 * Nothing reads it.
 */
export interface UserDocument {
  username: string;
  name: string;
  passwordHash: string;
  role: "aegis_admin" | "member";
  defaultBusinessId: string;
  createdAt: Date;
  /** The administrator who created this account. Absent on seeded users. */
  createdBy?: string;
}

export const COLLECTIONS = {
  users: "users",
  businesses: "businesses",
  memberships: "memberships",
  mailSync: "mailSync",
  adSync: "adSync",
  messengerConversations: "messengerConversations",
  messengerState: "messengerState",
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

/**
 * Ads sync state, reached by explicit id for the same reason as `mailSync`:
 * the admin screen and System Status report on a business by id. See
 * `src/lib/dal/ad-account.ts`.
 */
export const adSyncCollection = () =>
  collection<AdSyncDocument>(COLLECTIONS.adSync);

/**
 * Messenger chats and webhook health. Reached by explicit `businessId` like
 * `mailSync`: a webhook delivery has no session at all — it is resolved to a
 * business by the Page id Meta names — and the admin screen reports on a
 * business other than the active one. See `src/lib/dal/messenger.ts`.
 */
export const messengerConversationsCollection = () =>
  collection<MessengerConversationDocument>(COLLECTIONS.messengerConversations);
export const messengerStateCollection = () =>
  collection<MessengerStateDocument>(COLLECTIONS.messengerState);

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
