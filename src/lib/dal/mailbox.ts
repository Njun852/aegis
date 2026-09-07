import "server-only";

import { decryptSecret, encryptSecret } from "@/lib/auth/secrets";
import { explainMailFailure } from "@/lib/mail/failures";
import type { MailFailure } from "@/lib/mail/failures";
import type { MailCursor, MailboxCredentials } from "@/lib/mail/source";
import { businessesCollection, mailSyncCollection } from "./db";
import { verifySession } from "./session";
import { findUserById } from "./users";
import type { MailSyncDocument, MailboxStatus } from "@/types";

/**
 * Mailbox credentials and sync state.
 *
 * The app password is stored encrypted on the business record and decrypted
 * only here, at the moment a connection is opened. Nothing in this file returns
 * a secret to a caller that could reach a browser: `readMailboxCredentials` is
 * used by the ingest path alone, and everything the admin screen renders comes
 * from `readMailboxStatus`, which has no password in its shape at all.
 */

/**
 * Credentials for the business the caller is signed in to.
 *
 * Returns null when no mailbox is configured, and also when the stored value
 * cannot be decrypted — a rotated `MAIL_CREDENTIAL_KEY` leaves rows that are
 * unreadable rather than wrong, and the honest response to that is the same as
 * having no mailbox: report it disconnected and ask for it to be reconnected.
 */
export async function readMailboxCredentialsFor(
  businessId: string,
): Promise<MailboxCredentials | null> {
  const businesses = await businessesCollection();
  const business = await businesses.findOne({ businessId });

  const mailbox = business?.mailbox;
  if (!mailbox?.address || !mailbox.secretCipher) return null;

  const appPassword = decryptSecret(mailbox.secretCipher);
  if (!appPassword) return null;

  return { address: mailbox.address, appPassword };
}

/** The same, for whichever business the caller is currently signed in to. */
export async function readMailboxCredentials(): Promise<MailboxCredentials | null> {
  const { activeBusinessId } = await verifySession();
  return readMailboxCredentialsFor(activeBusinessId);
}

/**
 * Records what a connection test found, against the business that was tested.
 *
 * A test is not a retrieval, so it never touches `lastSyncAt` — but it is the
 * freshest thing known about whether the mailbox works, so it does set and
 * clear the error. Without this an admin could watch a test fail and still see
 * the mailbox reported as healthy everywhere else.
 */
export async function recordVerifyOutcome(
  businessId: string,
  reason: MailFailure | null,
): Promise<void> {
  const sync = await mailSyncCollection();
  await sync.updateOne(
    { businessId },
    {
      $set: reason
        ? {
            lastOutcome: reason,
            lastError: explainMailFailure(reason),
            lastErrorAt: new Date(),
          }
        : { lastOutcome: "ok", lastError: null, lastErrorAt: null },
    },
    { upsert: true },
  );
}

/** The connected address for the active business, without touching the secret. */
export async function readMailboxAddress(): Promise<string | null> {
  const { activeBusinessId } = await verifySession();
  const businesses = await businessesCollection();
  const business = await businesses.findOne({ businessId: activeBusinessId });
  return business?.mailbox?.address ?? null;
}

/** Whether the active business has a mailbox configured at all. */
export async function isMailboxConfigured(): Promise<boolean> {
  return (await readMailboxAddress()) !== null;
}

/**
 * Stores a mailbox for a business. The password is encrypted before it reaches
 * the database and is never written anywhere in the clear — not to a log, and
 * not back to the client.
 */
export async function saveMailbox(
  businessId: string,
  address: string,
  appPassword: string,
): Promise<void> {
  const businesses = await businessesCollection();
  await businesses.updateOne(
    { businessId },
    {
      $set: {
        mailbox: {
          address,
          secretCipher: encryptSecret(appPassword),
          updatedAt: new Date(),
        },
      },
    },
  );

  // A new mailbox invalidates the old high-water mark: UIDs belong to the
  // mailbox that issued them, so the next sync must start over rather than
  // resume from another account's numbering.
  await clearMailSync(businessId);
}

export async function clearMailbox(businessId: string): Promise<void> {
  const businesses = await businessesCollection();
  await businesses.updateOne({ businessId }, { $unset: { mailbox: "" } });
  await clearMailSync(businessId);
}

async function clearMailSync(businessId: string): Promise<void> {
  const sync = await mailSyncCollection();
  await sync.deleteOne({ businessId });
}

export async function readMailSync(
  businessId: string,
): Promise<MailSyncDocument | null> {
  const sync = await mailSyncCollection();
  return sync.findOne({ businessId });
}

/**
 * Who a reply is written by, and which mailbox it leaves from.
 *
 * Read from the session and the business record, never from a fixture. The
 * drafting prompts previously signed every reply "Ahmed" on behalf of
 * "AUTOBLITZ" because those were the demo constants in
 * `src/lib/data/workspace.ts` — so a real user's reply went out under someone
 * else's name.
 */
export interface MailIdentity {
  /** The signed-in user's full name. */
  name: string;
  /** What a reply signs off with. */
  firstName: string;
  /** The business the reply is sent on behalf of. */
  businessName: string;
  /** The connected mailbox, or null when none is connected. */
  address: string | null;
}

export async function readMailIdentity(): Promise<MailIdentity> {
  const session = await verifySession();
  const [user, businesses] = await Promise.all([
    findUserById(session.userId),
    businessesCollection(),
  ]);
  const business = await businesses.findOne({
    businessId: session.activeBusinessId,
  });

  const name = user?.name?.trim() || user?.username || "";
  return {
    name,
    firstName: name.split(/\s+/)[0] ?? "",
    businessName: business?.name ?? "",
    address: business?.mailbox?.address ?? null,
  };
}

/** Sync state for the business the caller is signed in to. */
export async function readActiveMailSync(): Promise<MailSyncDocument | null> {
  const { activeBusinessId } = await verifySession();
  return readMailSync(activeBusinessId);
}

/** Where the last fetch got to, for the business the caller is signed in to. */
export async function readMailCursor(): Promise<MailCursor> {
  const { activeBusinessId } = await verifySession();
  const state = await readMailSync(activeBusinessId);
  return {
    uidValidity: state?.uidValidity ?? null,
    lastUid: state?.lastUid ?? null,
  };
}

/**
 * Records the outcome of a sync — the successful ones and the failures alike.
 *
 * A failure does not overwrite `lastSyncAt`: "when mail last actually arrived"
 * and "when we last tried" are different questions, and the status screen has
 * to be able to say that the last attempt failed *and* how stale the data now
 * is. That is exactly the case checklist item 12 exists to prevent hiding.
 */
export async function recordSyncSuccess(
  cursor: MailCursor,
  at = new Date(),
): Promise<void> {
  const { activeBusinessId } = await verifySession();
  const sync = await mailSyncCollection();

  await sync.updateOne(
    { businessId: activeBusinessId },
    {
      $set: {
        uidValidity: cursor.uidValidity,
        lastUid: cursor.lastUid,
        lastSyncAt: at,
        lastOutcome: "ok",
        lastError: null,
        lastErrorAt: null,
      },
    },
    { upsert: true },
  );
}

export async function recordSyncFailure(reason: MailFailure): Promise<void> {
  const { activeBusinessId } = await verifySession();
  const sync = await mailSyncCollection();

  await sync.updateOne(
    { businessId: activeBusinessId },
    {
      $set: {
        lastOutcome: reason,
        lastError: explainMailFailure(reason),
        lastErrorAt: new Date(),
      },
    },
    { upsert: true },
  );
}

/**
 * Everything the admin screen may know about a business's mailbox.
 *
 * Takes an explicit `businessId` because an admin inspects a business other
 * than the one they are switched to; callers are gated by `requireAdmin`.
 * Deliberately shaped so a password cannot be returned even by mistake.
 */
export async function readMailboxStatus(
  businessId: string,
): Promise<MailboxStatus> {
  const businesses = await businessesCollection();
  const business = await businesses.findOne({ businessId });
  const state = await readMailSync(businessId);
  const mailbox = business?.mailbox;

  return {
    connected: Boolean(mailbox?.address),
    address: mailbox?.address ?? null,
    updatedAt: mailbox?.updatedAt ? mailbox.updatedAt.toISOString() : null,
    lastSyncAt: state?.lastSyncAt ? state.lastSyncAt.toISOString() : null,
    lastError: state?.lastError ?? null,
    lastErrorAt: state?.lastErrorAt ? state.lastErrorAt.toISOString() : null,
  };
}
