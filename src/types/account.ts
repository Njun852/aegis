import type { OptionalModuleKey } from "./business";

/**
 * AEGIS staff see and administer every business. A member only ever sees the
 * businesses they hold a membership for.
 */
export type UserRole = "aegis_admin" | "member";

export interface AegisUser {
  id: string;
  username: string;
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

/** An account as the Users screen sees it. Never carries a password or hash. */
export interface ManagedUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  /** Businesses a member may reach. Empty for administrators, who reach all. */
  businessIds: string[];
  /** ISO 8601. */
  createdAt: string;
}

/** What `verifySession()` hands back to every DAL read. */
export interface AegisSession {
  userId: string;
  role: UserRole;
  /** Already validated against the user's memberships — safe to filter on. */
  activeBusinessId: string;
}

/** Stored shape of `businesses`. `modules` is the entitlement grant. */
/**
 * A connected mailbox, as stored on the business.
 *
 * The app password is held encrypted (`src/lib/auth/secrets.ts`) and never
 * leaves the server: no read path returns `secretCipher` to a browser, and the
 * admin screen shows only whether a mailbox is configured and which address.
 */
export interface MailboxConfig {
  /** The address AEGIS signs in to, and sends replies from. */
  address: string;
  /** The Gmail app password, AES-256-GCM encrypted. Server-only, always. */
  secretCipher: string;
  updatedAt: Date;
}

export interface BusinessDocument {
  businessId: string;
  name: string;
  meta: string;
  onboarded: string;
  modules: OptionalModuleKey[];
  status: "active" | "suspended";
  /** Absent until an admin connects a mailbox for this business. */
  mailbox?: MailboxConfig;
}

/** What the admin screen may safely know about a mailbox. Never the password. */
export interface MailboxStatus {
  connected: boolean;
  address: string | null;
  updatedAt: string | null;
  /** ISO 8601 of the last successful retrieval, or null if none has succeeded. */
  lastSyncAt: string | null;
  /** The last failure, already worded for a person. */
  lastError: string | null;
  lastErrorAt: string | null;
}

/**
 * Where the last sync got to, kept apart from the business record because it is
 * rewritten on every run while the mailbox config almost never changes.
 */
export interface MailSyncDocument {
  businessId: string;
  /** IMAP resets UIDs when this changes; a change forces a fresh import. */
  uidValidity: string | null;
  lastUid: number | null;
  lastSyncAt: Date | null;
  lastOutcome: string | null;
  lastError: string | null;
  lastErrorAt: Date | null;
}
