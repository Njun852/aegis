import "server-only";

import { ObjectId } from "mongodb";
import { hashPassword } from "@/lib/auth/password";
import {
  businessesCollection,
  membershipsCollection,
  usersCollection,
} from "./db";
import { requireAdmin } from "./session";
import type { ManagedUser, UserRole } from "@/types";

/**
 * Creating, listing and removing accounts.
 *
 * Separate from `users.ts` for the same reason `account.ts` is: `session.ts`
 * imports `users.ts`, so anything here that needs `requireAdmin` would close an
 * import cycle. Every function asserts the role itself — the same rule
 * `createBusiness` and `setModuleGrants` follow — so the check cannot be skipped
 * by a caller that forgets it.
 *
 * Passwords are typed by the administrator and hashed before they are stored;
 * nothing here ever returns one or keeps it in the clear.
 */

export async function listUsers(): Promise<ManagedUser[]> {
  await requireAdmin();

  const [users, memberships] = await Promise.all([
    usersCollection().then((collection) =>
      collection
        // Never the hash, even to an administrator.
        .find({}, { projection: { passwordHash: 0 } })
        .sort({ createdAt: 1 })
        .toArray(),
    ),
    membershipsCollection().then((collection) => collection.find().toArray()),
  ]);

  return users.map((doc) => {
    const id = doc._id.toString();
    return {
      id,
      username: doc.username,
      name: doc.name,
      role: doc.role,
      businessIds: memberships
        .filter((membership) => membership.userId === id)
        .map((membership) => membership.businessId),
      createdAt: doc.createdAt.toISOString(),
    };
  });
}

export interface NewUser {
  name: string;
  username: string;
  /** Already checked against the password policy by the caller. */
  password: string;
  role: UserRole;
  /** Businesses a member may reach. Ignored for administrators. */
  businessIds: string[];
}

export type CreateUserResult =
  | { ok: true; user: ManagedUser }
  | { ok: false; error: string };

export async function createUser(input: NewUser): Promise<CreateUserResult> {
  const session = await requireAdmin();

  const users = await usersCollection();
  const username = input.username.trim().toLowerCase();

  if (await users.findOne({ username })) {
    return { ok: false, error: `The username "${username}" is already taken.` };
  }

  // Business ids come from the browser, so they are checked rather than trusted:
  // a membership pointing at a business that does not exist grants nothing, but
  // it would still be a row that should never have been written.
  const businesses = await businessesCollection();
  const known = new Set(
    (await businesses.find({}, { projection: { businessId: 1 } }).toArray()).map(
      (doc) => doc.businessId,
    ),
  );
  const businessIds =
    input.role === "member"
      ? [...new Set(input.businessIds)].filter((id) => known.has(id))
      : [];

  if (input.role === "member" && businessIds.length === 0) {
    return { ok: false, error: "A member needs at least one business to reach." };
  }

  const defaultBusinessId =
    input.role === "member"
      ? businessIds[0]
      : known.has(session.activeBusinessId)
        ? session.activeBusinessId
        : [...known][0];

  if (!defaultBusinessId) {
    return { ok: false, error: "Create a business before creating users." };
  }

  const createdAt = new Date();

  let insertedId: ObjectId;
  try {
    const result = await users.insertOne({
      username,
      name: input.name.trim(),
      passwordHash: await hashPassword(input.password),
      role: input.role,
      defaultBusinessId,
      createdAt,
      createdBy: session.userId,
    });
    insertedId = result.insertedId;
  } catch (cause) {
    // Two admins taking the same username at the same instant: the unique index
    // is the backstop the check above cannot be.
    if ((cause as { code?: number })?.code === 11000) {
      return { ok: false, error: `The username "${username}" is already taken.` };
    }
    throw cause;
  }

  const id = insertedId.toString();
  if (businessIds.length > 0) {
    const memberships = await membershipsCollection();
    await memberships.insertMany(
      businessIds.map((businessId) => ({ userId: id, businessId })),
    );
  }

  return {
    ok: true,
    user: {
      id,
      username,
      name: input.name.trim(),
      role: input.role,
      businessIds,
      createdAt: createdAt.toISOString(),
    },
  };
}

export interface UserChanges {
  name: string;
  role: UserRole;
  /** Businesses a member may reach. Ignored for administrators. */
  businessIds: string[];
}

export type UpdateUserResult =
  | { ok: true; user: ManagedUser }
  | { ok: false; error: string };

/**
 * Changes an account's name, role, and the businesses a member reaches.
 * The username is not editable: it is what the person signs in with.
 *
 * Takes effect on the account's very next request, because sessions read the
 * user back from the database rather than trusting the login token — a demoted
 * administrator loses the internal screens and a member loses a business the
 * moment this returns.
 *
 * Nobody can change their own role. Demoting yourself would strand you
 * mid-session, and because the caller must be an administrator, it is also
 * what guarantees at least one administrator always remains: any other
 * administrator you demote leaves you.
 */
export async function updateUser(
  userId: string,
  changes: UserChanges,
): Promise<UpdateUserResult> {
  const session = await requireAdmin();
  if (!ObjectId.isValid(userId)) return { ok: false, error: "That account no longer exists." };

  const users = await usersCollection();
  const _id = new ObjectId(userId);
  const target = await users.findOne({ _id });
  if (!target) return { ok: false, error: "That account no longer exists." };

  if (userId === session.userId && changes.role !== target.role) {
    return {
      ok: false,
      error: "You cannot change your own role. Ask another administrator to do it.",
    };
  }

  const businesses = await businessesCollection();
  const known = new Set(
    (await businesses.find({}, { projection: { businessId: 1 } }).toArray()).map(
      (doc) => doc.businessId,
    ),
  );
  const businessIds =
    changes.role === "member"
      ? [...new Set(changes.businessIds)].filter((id) => known.has(id))
      : [];

  if (changes.role === "member" && businessIds.length === 0) {
    return { ok: false, error: "A member needs at least one business to reach." };
  }

  // The default has to be somewhere the account can still go. Keep it when it
  // survives the change; otherwise move it rather than leave it pointing at a
  // business that was just taken away.
  const defaultBusinessId =
    changes.role === "member"
      ? businessIds.includes(target.defaultBusinessId)
        ? target.defaultBusinessId
        : businessIds[0]
      : known.has(target.defaultBusinessId)
        ? target.defaultBusinessId
        : [...known][0];

  const name = changes.name.trim();
  const memberships = await membershipsCollection();

  if (changes.role === "member") {
    /**
     * Grant before revoking, and both before the role changes. The standalone
     * MongoDB has no transactions, so the order is the only thing standing
     * between an interrupted edit and a member left, even briefly, with no
     * business to reach. Each step is safe to repeat.
     */
    for (const businessId of businessIds) {
      await memberships.updateOne(
        { userId, businessId },
        { $set: { userId, businessId } },
        { upsert: true },
      );
    }
    await memberships.deleteMany({ userId, businessId: { $nin: businessIds } });
    await users.updateOne(
      { _id },
      { $set: { name, role: "member", defaultBusinessId } },
    );
  } else {
    // An administrator reaches every business, so memberships mean nothing to
    // them. They are cleared rather than left behind, where they would silently
    // come back into force if the account were ever made a member again.
    await users.updateOne(
      { _id },
      { $set: { name, role: "aegis_admin", defaultBusinessId } },
    );
    await memberships.deleteMany({ userId });
  }

  return {
    ok: true,
    user: {
      id: userId,
      username: target.username,
      name,
      role: changes.role,
      businessIds,
      createdAt: target.createdAt.toISOString(),
    },
  };
}

export type SetPasswordResult = { ok: true } | { ok: false; error: string };

/**
 * Replaces another account's password with one the administrator types.
 *
 * The recovery path for a forgotten password, since there is no reset by
 * email. The old password stops working immediately; a session already signed
 * in with it is not ended.
 *
 * Not for your own account. Account Settings asks for the current password
 * before changing it, which is what stops an unattended signed-in screen
 * becoming a takeover; allowing it here would be a way around that.
 */
export async function setUserPassword(
  userId: string,
  password: string,
): Promise<SetPasswordResult> {
  const session = await requireAdmin();
  if (!ObjectId.isValid(userId)) return { ok: false, error: "That account no longer exists." };
  if (userId === session.userId) {
    return {
      ok: false,
      error: "Change your own password in Account Settings.",
    };
  }

  const users = await usersCollection();
  const result = await users.updateOne(
    { _id: new ObjectId(userId) },
    { $set: { passwordHash: await hashPassword(password) } },
  );

  return result.matchedCount === 0
    ? { ok: false, error: "That account no longer exists." }
    : { ok: true };
}

export type DeleteUserResult = { ok: true } | { ok: false; error: string };

/**
 * Removes an account and its memberships.
 *
 * Two guards, both against locking the company out of its own system: nobody can
 * delete the account they are signed in with, and the last administrator cannot
 * be deleted at all. Because sessions now read the user back from the database,
 * the deleted account is signed out on its very next request.
 */
export async function deleteUser(userId: string): Promise<DeleteUserResult> {
  const session = await requireAdmin();
  if (!ObjectId.isValid(userId)) return { ok: false, error: "That account no longer exists." };

  if (userId === session.userId) {
    return {
      ok: false,
      error: "You cannot delete the account you are signed in with. Sign in as another administrator to remove it.",
    };
  }

  const users = await usersCollection();
  const target = await users.findOne({ _id: new ObjectId(userId) });
  if (!target) return { ok: false, error: "That account no longer exists." };

  /**
   * Backstop, not the real protection. The caller is an administrator and
   * cannot delete themselves, so if the target is an administrator there are
   * already at least two — in ordinary use this never fires, and it is the
   * self-guard above that prevents lockout. It is kept so the invariant is
   * stated where the delete happens. It does not cover two administrators
   * deleting each other at the same instant; the standalone MongoDB has no
   * transactions to make count-then-delete atomic.
   */
  if (target.role === "aegis_admin") {
    const admins = await users.countDocuments({ role: "aegis_admin" });
    if (admins <= 1) {
      return {
        ok: false,
        error: "This is the last administrator. Create another administrator before removing it.",
      };
    }
  }

  await users.deleteOne({ _id: target._id });
  const memberships = await membershipsCollection();
  await memberships.deleteMany({ userId });

  return { ok: true };
}
