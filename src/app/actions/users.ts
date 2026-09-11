"use server";

import { revalidatePath } from "next/cache";
import {
  createUser,
  deleteUser,
  setUserPassword,
  updateUser,
} from "@/lib/dal/user-admin";
import { PASSWORD_MIN_LENGTH } from "@/lib/password-policy";
import type { ManagedUser, UserRole } from "@/types";

/**
 * Account management for administrators.
 *
 * Every rule here is enforced on the server, not just in the form: the form is a
 * convenience, this is the boundary. The role check itself lives in the DAL, so
 * it holds even for a caller that skips this file.
 */

export interface UserActionState {
  error: string | null;
  user: ManagedUser | null;
}

const USERNAME = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const ROLES: UserRole[] = ["aegis_admin", "member"];

/** The same rule Account Settings applies, so the two can never disagree. */
function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    return `The password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  return null;
}

export async function createUserAction(input: {
  name: string;
  username: string;
  password: string;
  role: UserRole;
  businessIds: string[];
}): Promise<UserActionState> {
  const name = input.name.trim();
  const username = input.username.trim().toLowerCase();

  if (name.length < 2) {
    return { error: "Enter the person's name.", user: null };
  }
  if (!USERNAME.test(username)) {
    return {
      error:
        "Usernames are 3 to 32 characters: lowercase letters, numbers, dots, dashes or underscores.",
      user: null,
    };
  }
  const problem = passwordProblem(input.password);
  if (problem) return { error: problem, user: null };
  if (!ROLES.includes(input.role)) {
    return { error: "Choose a role.", user: null };
  }

  const result = await createUser({
    name,
    username,
    // Not trimmed: spaces are legitimate password characters.
    password: input.password,
    role: input.role,
    businessIds: Array.isArray(input.businessIds) ? input.businessIds : [],
  });

  if (!result.ok) return { error: result.error, user: null };

  revalidatePath("/admin/users");
  return { error: null, user: result.user };
}

export async function setUserPasswordAction(
  userId: string,
  password: string,
): Promise<UserActionState> {
  const problem = passwordProblem(password);
  if (problem) return { error: problem, user: null };

  const result = await setUserPassword(userId, password);
  return result.ok
    ? { error: null, user: null }
    : { error: result.error, user: null };
}

export async function deleteUserAction(userId: string): Promise<UserActionState> {
  const result = await deleteUser(userId);
  if (!result.ok) return { error: result.error, user: null };

  revalidatePath("/admin/users");
  return { error: null, user: null };
}

export async function updateUserAction(
  userId: string,
  input: {
    name: string;
    role: UserRole;
    businessIds: string[];
  },
): Promise<UserActionState> {
  const name = input.name.trim();

  if (name.length < 2) {
    return { error: "Enter the person's name.", user: null };
  }
  if (!ROLES.includes(input.role)) {
    return { error: "Choose a role.", user: null };
  }

  const result = await updateUser(userId, {
    name,
    role: input.role,
    businessIds: Array.isArray(input.businessIds) ? input.businessIds : [],
  });
  if (!result.ok) return { error: result.error, user: null };

  // Layout-wide: editing your own name changes the sidebar, and a changed role
  // changes which navigation the account sees.
  revalidatePath("/", "layout");
  return { error: null, user: result.user };
}
