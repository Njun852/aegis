import "server-only";

import type { Collection, Db, Document } from "mongodb";
import clientPromise from "@/lib/db/mongodb";
import type { BusinessDocument, Membership } from "@/types";

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
