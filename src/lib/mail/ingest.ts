import "server-only";

import {
  readMailCursor,
  readMailboxCredentials,
  readMailboxCredentialsFor,
  recordSyncFailure,
  recordSyncSuccess,
} from "@/lib/dal/mailbox";
import { upsertFetchedMessages } from "@/lib/dal/mail";
import { createImapSource } from "./imap-source";
import type { MailFailure } from "./failures";
import type { MailAttachment } from "./source";

/**
 * Retrieval: the step that replaced the seeded sample inbox.
 *
 * Nothing above this file knows the mail arrived over IMAP. New messages are
 * written with no analysis attached, which is all the existing pipeline needs —
 * `listUntriaged` is a set difference on `aiPromptVersion`, so the triage sweep
 * picks them up on the same sync and the reply sweep follows it.
 *
 * Spend discipline is inherited rather than reinvented: this decides how many
 * messages *enter*, and the sweeps already cap how many are analysed per run.
 */

/**
 * Messages taken on the very first connection to a mailbox.
 *
 * Every message retrieved is a message triaged, so this number is the first
 * bill. Ten is deliberately small — enough to prove the pipeline on real mail
 * without committing the month's budget before anyone has seen it work. Raise
 * it knowingly.
 */
export const INITIAL_IMPORT_LIMIT = 10;

/** Ceiling per later sync, so a quiet week followed by a busy one cannot spike. */
export const PER_SYNC_LIMIT = 25;

export interface SyncMailboxReport {
  /** Messages written that AEGIS had not seen before. */
  added: number;
  /** Messages the fetch returned, new or already known. */
  fetched: number;
  initialImport: boolean;
  /** Set when the run could not complete. Never thrown. */
  failed: MailFailure | null;
}

const IDLE: SyncMailboxReport = {
  added: 0,
  fetched: 0,
  initialImport: false,
  failed: null,
};

/**
 * Retrieves whatever has arrived since the last run and stores it.
 *
 * Returns a report rather than throwing, for the same reason the AI layer does:
 * a mailbox that cannot be reached is a normal state of the world, and the
 * inbox must still render from what is already stored. Checklist item 5 is
 * satisfied here — the failure is classified, recorded against the business,
 * and handed back for the screen to report.
 */
export async function syncMailbox(): Promise<SyncMailboxReport> {
  const credentials = await readMailboxCredentials();
  if (!credentials) {
    return { ...IDLE, failed: "not-configured" };
  }

  const cursor = await readMailCursor();
  const source = createImapSource(credentials);
  const limit = cursor.lastUid === null ? INITIAL_IMPORT_LIMIT : PER_SYNC_LIMIT;

  const result = await source.fetchSince(cursor, limit);
  if (!result.ok) {
    await recordSyncFailure(result.reason);
    return { ...IDLE, failed: result.reason };
  }

  const { messages, cursor: next, initialImport } = result.data;
  const added = await upsertFetchedMessages(messages);

  // Recorded after the write, so a crash between the two re-fetches those
  // messages rather than skipping them. Re-fetching is free and idempotent;
  // skipping would lose mail silently.
  await recordSyncSuccess(next);

  return { added, fetched: messages.length, initialImport, failed: null };
}

/**
 * Opens a connection and closes it again without reading anything, so an admin
 * can find out whether credentials work before committing to a sync.
 */
export async function verifyMailbox(
  businessId: string,
): Promise<MailFailure | null> {
  // Explicitly by business: an admin tests a mailbox belonging to a business
  // other than the one they are switched to, so resolving credentials from the
  // session here would test the wrong account and report the wrong answer.
  const credentials = await readMailboxCredentialsFor(businessId);
  if (!credentials) return "not-configured";

  const result = await createImapSource(credentials).verify();
  return result.ok ? null : result.reason;
}

/** Sends one message. The caller supplies already-validated recipient and text. */
export async function sendMail(
  to: string,
  subject: string,
  body: string,
  attachments: MailAttachment[] = [],
): Promise<MailFailure | null> {
  const credentials = await readMailboxCredentials();
  if (!credentials) return "not-configured";

  const result = await createImapSource(credentials).send(to, subject, body, attachments);
  return result.ok ? null : result.reason;
}

/**
 * Sets or clears \Seen on the mailbox itself.
 *
 * This is the one place AEGIS writes *into* Gmail rather than reading from it,
 * so it is deliberately narrow: one message, one flag.
 */
export async function markMailSeen(
  uid: number,
  uidValidity: string,
  seen: boolean,
): Promise<MailFailure | null> {
  const credentials = await readMailboxCredentials();
  if (!credentials) return "not-configured";

  const result = await createImapSource(credentials).setSeen(
    uid,
    uidValidity,
    seen,
  );
  return result.ok ? null : result.reason;
}
