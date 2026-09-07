import type { MailFailure } from "./failures";

/**
 * The seam between AEGIS and whatever is actually holding the mail.
 *
 * Everything above this file — triage, deadline extraction, approval flagging,
 * reply drafting, the screens — works on `FetchedMessage`, not on IMAP. That is
 * what makes the transport a decision we can revisit: replacing this
 * implementation with a Gmail API one later changes this folder and nothing
 * else.
 */

/** One message as retrieved, before AEGIS has analysed anything about it. */
export interface FetchedMessage {
  /** RFC822 Message-ID, or `uidvalidity:uid` for the rare message without one. */
  messageId: string;
  /** Display name, falling back to the address when the sender sent none. */
  from: string;
  email: string;
  subject: string;
  /** Plain-text paragraphs. HTML-only mail is converted before it gets here. */
  body: string[];
  receivedAt: Date;
  unread: boolean;
  /**
   * The IMAP UID, and the uidValidity it belongs to.
   *
   * Stored because flags are addressed by UID, not by Message-ID: marking a
   * message read has to name it the way the server names it. A UID is only
   * meaningful within its uidValidity, so the pair travels together.
   */
  uid: number;
  uidValidity: string;
}

/**
 * Where the last fetch got to. `uidValidity` is IMAP's own signal that UIDs
 * have been reset — when it changes, `lastUid` means nothing and the next fetch
 * starts over.
 */
export interface MailCursor {
  uidValidity: string | null;
  lastUid: number | null;
}

export interface FetchResult {
  messages: FetchedMessage[];
  cursor: MailCursor;
  /** True when this run started the mailbox from scratch. */
  initialImport: boolean;
}

/** Every operation resolves to a result — none of them throw. */
export type MailOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; reason: MailFailure; detail: string };

export interface MailboxCredentials {
  address: string;
  appPassword: string;
}

export interface MailSource {
  /** Newest first. `limit` bounds both the first import and every later run. */
  fetchSince(cursor: MailCursor, limit: number): Promise<MailOutcome<FetchResult>>;
  /** Proves the credentials work without reading or writing anything. */
  verify(): Promise<MailOutcome<true>>;
  /**
   * Sets or clears the \Seen flag on one message.
   *
   * The only write AEGIS makes into the mailbox itself. `uidValidity` is
   * checked against the server's before anything is touched — a stale UID would
   * otherwise mark an unrelated message read.
   */
  setSeen(
    uid: number,
    uidValidity: string,
    seen: boolean,
  ): Promise<MailOutcome<true>>;
  send(to: string, subject: string, body: string): Promise<MailOutcome<true>>;
}
