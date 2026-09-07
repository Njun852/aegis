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
import { explainMailFailure } from "@/lib/mail/failures";
import { markMailSeen, sendMail } from "@/lib/mail/ingest";
import { revalidatePath } from "next/cache";

/**
 * Re-reads how current the mail data is.
 *
 * Cheap and side-effect free: one indexed read plus a count. It exists so the
 * top bar can refresh its age without a full page render, and so pressing
 * "Sync now" reports the state that actually resulted rather than an animation.
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

  const subject = message.subject.toLowerCase().startsWith("re:")
    ? message.subject
    : `Re: ${message.subject}`;

  const failure = await sendMail(message.email, subject, text);
  if (failure) {
    return { sent: false, error: explainMailFailure(failure) };
  }

  // Recorded only after the send succeeded, so the thread never shows a reply
  // that did not leave the building.
  await recordSentReply(message.id, text);
  revalidatePath("/mail");

  return { sent: true, error: null };
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
