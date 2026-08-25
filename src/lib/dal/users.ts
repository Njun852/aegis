import "server-only";

import { ObjectId } from "mongodb";
import { verifyPassword } from "@/lib/auth/password";
import { membershipsCollection, usersCollection } from "./db";
import type { AegisUser } from "@/types";

/**
 * Used by the Credentials provider during sign-in, so it deliberately does NOT
 * call `verifySession` — there is no session yet. Returns the safe projection
 * only; the password hash never leaves this function.
 */
export async function authenticate(
  username: string,
  password: string,
): Promise<AegisUser | null> {
  const users = await usersCollection();
  const doc = await users.findOne({ username: username.trim().toLowerCase() });
  if (!doc) return null;

  const ok = await verifyPassword(password, doc.passwordHash);
  if (!ok) return null;

  return {
    id: doc._id.toString(),
    username: doc.username,
    email: doc.email,
    name: doc.name,
    role: doc.role,
    defaultBusinessId: doc.defaultBusinessId,
  };
}

export async function findUserById(userId: string): Promise<AegisUser | null> {
  if (!ObjectId.isValid(userId)) return null;

  const users = await usersCollection();
  const doc = await users.findOne({ _id: new ObjectId(userId) });
  if (!doc) return null;

  return {
    id: doc._id.toString(),
    username: doc.username,
    email: doc.email,
    name: doc.name,
    role: doc.role,
    defaultBusinessId: doc.defaultBusinessId,
  };
}

/** The business ids a member may switch to. Admins are not limited by this. */
export async function membershipBusinessIds(userId: string): Promise<string[]> {
  const memberships = await membershipsCollection();
  const docs = await memberships.find({ userId }).toArray();
  return docs.map((doc) => doc.businessId);
}
