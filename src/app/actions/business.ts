"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { setModuleGrants } from "@/lib/dal/businesses";
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
