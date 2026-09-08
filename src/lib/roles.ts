import type { UserRole } from "@/types";

/**
 * How a stored role reads on screen.
 *
 * The database calls it `aegis_admin`; nobody signing in thinks of themselves
 * that way. Kept in one place so the sidebar, the account screen and anything
 * added later cannot drift into describing the same person differently.
 */
export function roleLabel(role: UserRole): string {
  return role === "aegis_admin" ? "Administrator" : "Member";
}

/** The name a greeting uses. Falls back to the whole name when it is one word. */
export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}
