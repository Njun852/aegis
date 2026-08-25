import type { OptionalModuleKey } from "./business";

/**
 * AEGIS staff see and administer every business. A member only ever sees the
 * businesses they hold a membership for.
 */
export type UserRole = "aegis_admin" | "member";

export interface AegisUser {
  id: string;
  username: string;
  email: string;
  name: string;
  role: UserRole;
  /** Where the user lands before they pick a business. */
  defaultBusinessId: string;
}

/** Links a member to one business. Admins bypass this collection entirely. */
export interface Membership {
  userId: string;
  businessId: string;
}

/** What `verifySession()` hands back to every DAL read. */
export interface AegisSession {
  userId: string;
  role: UserRole;
  /** Already validated against the user's memberships — safe to filter on. */
  activeBusinessId: string;
}

/** Stored shape of `businesses`. `modules` is the entitlement grant. */
export interface BusinessDocument {
  businessId: string;
  name: string;
  meta: string;
  onboarded: string;
  modules: OptionalModuleKey[];
  status: "active" | "suspended";
}
