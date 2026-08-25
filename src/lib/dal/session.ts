import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/auth";
import { businessesCollection } from "./db";
import { membershipBusinessIds } from "./users";
import type { AegisSession } from "@/types";

export const ACTIVE_BUSINESS_COOKIE = "aegis.active_business";

/**
 * The authorization checkpoint. Every DAL read calls this first.
 *
 * `cache` memoises it for the duration of one render pass, so a layout and the
 * page inside it share a single session lookup instead of two.
 */
export const verifySession = cache(async (): Promise<AegisSession> => {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { id: userId, role, defaultBusinessId } = session.user;
  const activeBusinessId = await resolveActiveBusiness(
    userId,
    role,
    defaultBusinessId,
  );

  return { userId, role, activeBusinessId };
});

/** Null instead of a redirect — for callers that must not bounce, like /login. */
export const optionalSession = cache(async (): Promise<AegisSession | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;

  const { id: userId, role, defaultBusinessId } = session.user;
  return {
    userId,
    role,
    activeBusinessId: await resolveActiveBusiness(
      userId,
      role,
      defaultBusinessId,
    ),
  };
});

/**
 * The active business comes from a cookie, so it is attacker-controlled input.
 * It is re-checked against what the user may actually reach on every request,
 * and falls back to their default when it does not hold up. A tampered cookie
 * therefore grants nothing.
 */
async function resolveActiveBusiness(
  userId: string,
  role: AegisSession["role"],
  defaultBusinessId: string,
): Promise<string> {
  const store = await cookies();
  const requested = store.get(ACTIVE_BUSINESS_COOKIE)?.value;
  if (!requested) return defaultBusinessId;

  const allowed = await allowedBusinessIds(userId, role);
  return allowed.includes(requested) ? requested : defaultBusinessId;
}

/** Admins administer every business; members only reach their memberships. */
export async function allowedBusinessIds(
  userId: string,
  role: AegisSession["role"],
): Promise<string[]> {
  if (role === "aegis_admin") {
    const businesses = await businessesCollection();
    const docs = await businesses
      .find({}, { projection: { businessId: 1 } })
      .toArray();
    return docs.map((doc) => doc.businessId);
  }
  return membershipBusinessIds(userId);
}

/** Guards the AEGIS-internal screens. Members never reach /admin. */
export async function requireAdmin(): Promise<AegisSession> {
  const session = await verifySession();
  if (session.role !== "aegis_admin") {
    redirect("/dashboard");
  }
  return session;
}
