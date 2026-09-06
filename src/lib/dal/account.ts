import "server-only";

import { ObjectId } from "mongodb";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { usersCollection } from "./db";
import { verifySession } from "./session";

/**
 * The signed-in user's own account.
 *
 * Deliberately separate from `users.ts`: that module is imported by
 * `session.ts`, so anything here that needs `verifySession` would close an
 * import cycle. Nothing in this file may be reached without a session.
 */

export type PasswordChangeResult =
  | { ok: true }
  | { ok: false; reason: "wrong-password" | "not-found" };

/**
 * Changes the signed-in user's own password.
 *
 * The current password is required even though the session already proves who
 * they are: it is what stops an unattended signed-in screen becoming a
 * permanent account takeover. The new hash carries its own fresh salt, so two
 * accounts with the same password still store different hashes.
 */
export async function changeOwnPassword(
  currentPassword: string,
  newPassword: string,
): Promise<PasswordChangeResult> {
  const { userId } = await verifySession();
  if (!ObjectId.isValid(userId)) return { ok: false, reason: "not-found" };

  const users = await usersCollection();
  const id = new ObjectId(userId);
  const doc = await users.findOne({ _id: id });
  if (!doc) return { ok: false, reason: "not-found" };

  const matches = await verifyPassword(currentPassword, doc.passwordHash);
  if (!matches) return { ok: false, reason: "wrong-password" };

  await users.updateOne(
    { _id: id },
    { $set: { passwordHash: await hashPassword(newPassword) } },
  );

  return { ok: true };
}
