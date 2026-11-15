"use server";

import { requireModule } from "@/lib/dal/businesses";
import {
  findMessage,
  readMailFreshness,
  readMessageLocation,
  recordSentReply,
  setMessageRead,
} from "@/lib/dal/mail";
import { isMailboxConnected } from "@/lib/integrations";
import { readRecipients } from "@/lib/mail-recipients";
import { explainMailFailure, explainSendFailure } from "@/lib/mail/failures";
import { loadMessageExtras, markMailSeen, sendMail } from "@/lib/mail/ingest";
import type { MailAttachmentInfo, MailLink } from "@/types";
import { revalidatePath } from "next/cache";

/**
 * Re-reads how current the mail data is.
 *
 * Cheap and side-effect free: one indexed read plus a count. It exists so the
 * top bar can refresh its age without a full page render, and so each automatic
 * sync reports the state that actually resulted rather than an animation.
 */
export async function refreshMailFreshnessAction(): Promise<{
  newestReceivedAt: string | null;
  connected: boolean;
}> {
  await requireModule("mail");

  const { newestReceivedAt } = await readMailFreshness();
  return { newestReceivedAt, connected: await isMailboxConnected() };
}

export interface SendReplyState {
  sent: boolean;
  error: string | null;
}

/**
 * Sends one reply, over SMTP, from the connected mailbox.
 *
 * The browser supplies a message id and the text to send — nothing else. The
 * recipient and subject are read back from the tenant's own collection, so no
 * caller can redirect a reply to an address of their choosing, and a message
 * belonging to another business cannot be answered at all.
 *
 * Nothing here decides to send. A person read the draft and pressed the button;
 * this is the write that makes it true, which is the arrangement checklist item
 * 16 requires.
 */
export async function sendReplyAction(
  messageId: string,
  body: string,
  copies: { cc: string; bcc: string } = { cc: "", bcc: "" },
): Promise<SendReplyState> {
  await requireModule("mail");

  const text = body.trim();
  if (!text) return { sent: false, error: "Write something to send first." };

  const message = await findMessage(messageId.trim());
  if (!message) {
    return { sent: false, error: "That message is no longer in this inbox." };
  }
  if (!message.email) {
    return { sent: false, error: "That message has no reply address." };
  }

  // Cc and Bcc are the person's own choice; the reply itself still goes only
  // to the address the message came from.
  const read = readRecipients(
    { to: "", cc: typeof copies?.cc === "string" ? copies.cc : "", bcc: typeof copies?.bcc === "string" ? copies.bcc : "" },
    { requireTo: false },
  );
  if (!read.ok) return { sent: false, error: read.error };
  const sender = message.email.toLowerCase();
  const cc = read.recipients.cc.filter((address) => address !== sender);
  const bcc = read.recipients.bcc.filter((address) => address !== sender);

  const subject = message.subject.toLowerCase().startsWith("re:")
    ? message.subject
    : `Re: ${message.subject}`;

  const failure = await sendMail(message.email, subject, text, [], { cc, bcc });
  if (failure) {
    return { sent: false, error: explainSendFailure(failure) };
  }

  // Recorded only after the send succeeded, so the thread never shows a reply
  // that did not leave the building.
  await recordSentReply(message.id, text);
  revalidatePath("/mail");

  return { sent: true, error: null };
}

export interface SendEmailResult {
  sent: boolean;
  error: string | null;
  /** Everyone it went to, To, Cc and Bcc together, for the confirmation. */
  recipients: number;
}

/**
 * Sends a new email from the connected mailbox: the Compose window's Send.
 *
 * Every address is checked again here, whatever the browser sent; the
 * subject and body are plain text. Gmail keeps the copy in its Sent folder.
 * As with a reply, nothing decides to send but the person pressing Send.
 */
export async function sendEmailAction(input: {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
}): Promise<SendEmailResult> {
  await requireModule("mail");

  const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
  const read = readRecipients({ to: text(input?.to, 2000), cc: text(input?.cc, 2000), bcc: text(input?.bcc, 2000) });
  if (!read.ok) return { sent: false, error: read.error, recipients: 0 };

  const subject = text(input?.subject, 300).replace(/[\r\n]+/g, " ");
  const body = text(input?.body, 50_000);
  if (!subject && !body) return { sent: false, error: "Write a subject or a message first.", recipients: 0 };

  const { to, cc, bcc } = read.recipients;
  const failure = await sendMail(to.join(", "), subject || "(no subject)", body, [], { cc, bcc });
  if (failure) return { sent: false, error: explainSendFailure(failure), recipients: 0 };

  return { sent: true, error: null, recipients: to.length + cc.length + bcc.length };
}

export interface MailExtrasResult {
  attachments: MailAttachmentInfo[];
  links: MailLink[];
  /** Set when Gmail could not be read; the lists are then empty. */
  error: string | null;
}

/**
 * The attachments and links of a message stored before they were recorded:
 * read from Gmail the first time it is opened, then kept. Read-only on the
 * mailbox; nothing is marked read here.
 */
export async function loadMailExtrasAction(messageId: string): Promise<MailExtrasResult> {
  await requireModule("mail");
  const result = await loadMessageExtras(String(messageId ?? "").slice(0, 500));
  if (typeof result === "string") {
    return { attachments: [], links: [], error: explainMailFailure(result) };
  }
  return { ...result, error: null };
}

export interface ReadStateResult {
  read: boolean;
  /**
   * Whether the change reached the mailbox itself, or only AEGIS's own record.
   * The caller must not claim Gmail was updated when it was not.
   */
  mailboxUpdated: boolean;
  /** Set when the mailbox refused; the stored state is then left alone. */
  error: string | null;
}

/**
 * Marks one message read or unread, in Gmail and then in AEGIS.
 *
 * The order matters and is not interchangeable. Every sync re-reads the \Seen
 * flag from the server, so a state stored locally without the mailbox agreeing
 * would be silently reverted on the next retrieval — the badge would appear to
 * reset itself for no reason anyone could see. The mailbox is therefore the
 * thing that decides, and the local row only records what it accepted.
 */
export async function setMessageReadAction(
  messageId: string,
  read: boolean,
): Promise<ReadStateResult> {
  await requireModule("mail");

  const id = messageId.trim();
  const location = await readMessageLocation(id);

  /**
   * No UID stored, so there is nothing on the server this can safely address —
   * a message retrieved before UIDs were recorded.
   *
   * Falling back to a local-only change is safe here for a specific reason:
   * `fetchSince` only ever returns UIDs above the stored high-water mark, so a
   * message already below it is never re-fetched and its stored read state is
   * never overwritten. The consequence is real and worth knowing — reading such
   * a message in AEGIS does not mark it read in Gmail. Anything retrieved from
   * now on carries its UID and updates both.
   */
  if (!location) {
    await setMessageRead(id, read);
    revalidatePath("/", "layout");
    return { read, mailboxUpdated: false, error: null };
  }

  const failure = await markMailSeen(location.uid, location.uidValidity, read);
  if (failure) {
    return { read: !read, mailboxUpdated: false, error: explainMailFailure(failure) };
  }

  await setMessageRead(id, read);
  // Layout-wide: the unread badge lives in the sidebar, not on this page.
  revalidatePath("/", "layout");
  return { read, mailboxUpdated: true, error: null };
}
