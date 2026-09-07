"use server";

import { requireModule } from "@/lib/dal/businesses";
import { findMessage, readMailFreshness, recordSentReply } from "@/lib/dal/mail";
import { isMailboxConnected } from "@/lib/integrations";
import { explainMailFailure } from "@/lib/mail/failures";
import { sendMail } from "@/lib/mail/ingest";
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
