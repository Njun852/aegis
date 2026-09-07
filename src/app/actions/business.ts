"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import {
  createBusiness,
  getBusinessForUser,
  renameBusiness,
  setModuleGrants,
} from "@/lib/dal/businesses";
import {
  ACTIVE_BUSINESS_COOKIE,
  allowedBusinessIds,
  verifySession,
} from "@/lib/dal/session";
import type { OptionalModuleKey } from "@/types";

/**
 * Switching tenants. Membership is checked here before the cookie is written,
 * and checked again by the DAL on every subsequent read — the cookie alone is
 * never trusted.
 */
export async function switchBusinessAction(businessId: string): Promise<void> {
  const { userId, role } = await verifySession();
  const allowed = await allowedBusinessIds(userId, role);

  if (!allowed.includes(businessId)) {
    throw new Error("You do not have access to that business.");
  }

  const store = await cookies();
  store.set(ACTIVE_BUSINESS_COOKIE, businessId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });

  revalidatePath("/", "layout");
}

/** Admin-only; `setModuleGrants` asserts the role before it writes. */
export async function saveModuleGrantsAction(
  businessId: string,
  modules: OptionalModuleKey[],
): Promise<void> {
  await setModuleGrants(businessId, modules);
  revalidatePath("/", "layout");
}

export interface BusinessFormState {
  error: string | null;
  /** The id of the business created, so the caller can navigate to it. */
  businessId: string | null;
}

/** Trims, and rejects the empty or absurd before a write is attempted. */
function checkName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 2) return "Give the business a name.";
  if (trimmed.length > 80) return "That name is too long (80 characters max).";
  return null;
}

/**
 * Creates a business.
 *
 * Admin-only — `createBusiness` asserts the role before it writes, the same way
 * `setModuleGrants` does, so the check cannot be skipped by calling this
 * directly.
 */
export async function createBusinessAction(
  name: string,
  meta: string,
): Promise<BusinessFormState> {
  const invalid = checkName(name);
  if (invalid) return { error: invalid, businessId: null };

  const business = await createBusiness(name.trim(), meta.trim());

  // Layout-wide: the sidebar's business switcher lists these too.
  revalidatePath("/", "layout");
  return { error: null, businessId: business.id };
}

export async function renameBusinessAction(
  businessId: string,
  name: string,
  meta: string,
): Promise<BusinessFormState> {
  const invalid = checkName(name);
  if (invalid) return { error: invalid, businessId: null };

  // Confirms the business exists and is one this account may administer before
  // writing to it — the same gate the rest of the admin screens use.
  if (!(await getBusinessForUser(businessId))) {
    return { error: "That business could not be found.", businessId: null };
  }

  await renameBusiness(businessId, name.trim(), meta.trim());
  revalidatePath("/", "layout");
  return { error: null, businessId };
}
