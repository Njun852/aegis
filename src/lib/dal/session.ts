import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/auth";
import { businessesCollection } from "./db";
import { findUserById, membershipBusinessIds } from "./users";
import type { AegisSession } from "@/types";

export const ACTIVE_BUSINESS_COOKIE = "aegis.active_business";

/**
 * Who the request belongs to, read from the **database**, not the token.
 *
 * The JWT carries the role it was issued with, and Auth.js cannot revoke a JWT.
 * Trusting it meant a deleted or demoted administrator kept admin powers in
 * every server action until the token expired — thirty days by default. Reading
 * the user back on each request makes deletion and demotion take effect on the
 * very next request instead. `cache` keeps it to one lookup per render pass.
 *
 * Returns null for a token whose user no longer exists, which is what lets
 * `/login` render for them rather than bouncing them to the dashboard and back.
 */
const resolveUser = cache(async () => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const user = await findUserById(userId);
  if (!user) return null;

  return {
    userId: user.id,
    role: user.role,
    defaultBusinessId: user.defaultBusinessId,
  };
});

/**
 * The authorization checkpoint. Every DAL read calls this first.
 *
 * `cache` memoises it for the duration of one render pass, so a layout and the
 * page inside it share a single session lookup instead of two.
 */
export const verifySession = cache(async (): Promise<AegisSession> => {
  const user = await resolveUser();
  if (!user) {
    redirect("/login");
  }

  const activeBusinessId = await resolveActiveBusiness(
    user.userId,
    user.role,
    user.defaultBusinessId,
  );
  // A member left with no business can reach nothing; signing them out is the
  // only honest answer. `optionalSession` returns null for the same case, so
  // /login renders for them instead of redirecting back here.
  if (!activeBusinessId) {
    redirect("/login");
  }

  return { userId: user.userId, role: user.role, activeBusinessId };
});

/** Null instead of a redirect — for callers that must not bounce, like /login. */
export const optionalSession = cache(async (): Promise<AegisSession | null> => {
  const user = await resolveUser();
  if (!user) return null;

  const activeBusinessId = await resolveActiveBusiness(
    user.userId,
    user.role,
    user.defaultBusinessId,
  );
  if (!activeBusinessId) return null;

  return { userId: user.userId, role: user.role, activeBusinessId };
});

/**
 * The active business comes from a cookie, so it is attacker-controlled input.
 * It is re-checked against what the user may actually reach on every request.
 *
 * The stored default is checked too, not trusted. It used to be returned
 * unconditionally whenever the cookie was missing or refused — which meant a
 * member whose access to their default business had been removed kept that
 * access through the fallback. Now it is used only if it is still allowed,
 * then the first business that is, and a member who can reach nothing gets no
 * business at all (null), which the callers treat as no session.
 */
async function resolveActiveBusiness(
  userId: string,
  role: AegisSession["role"],
  defaultBusinessId: string,
): Promise<string | null> {
  const store = await cookies();
  const requested = store.get(ACTIVE_BUSINESS_COOKIE)?.value;
  const allowed = await allowedBusinessIds(userId, role);

  if (requested && allowed.includes(requested)) return requested;
  if (allowed.includes(defaultBusinessId)) return defaultBusinessId;
  return allowed[0] ?? null;
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
