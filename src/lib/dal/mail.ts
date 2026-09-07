import "server-only";

import { tenantScope } from "./tenant";
import { freshnessTone, relativeAge } from "@/lib/freshness";
import { NO_DRAFT_CATEGORIES } from "@/lib/mail-reply-policy";
import { formatDay, formatStamp } from "@/lib/format";
import type { FetchedMessage } from "@/lib/mail/source";
import { isMailboxConnected } from "@/lib/integrations";
import { readActiveMailSync } from "./mailbox";
import { verifySession } from "./session";
import type {
  MailFreshnessState,
  MailMessage,
  MailMessageDocument,
  MailTriageResult,
} from "@/types";

const COLLECTION = "messages";

/**
 * Mail is tenant-owned, so every call goes through `tenantScope`. This matters
 * more here than anywhere else in the app: these documents hold correspondence,
 * and they hold model-generated summaries of it.
 *
 * Gmail is not connected yet — `scripts/seed.ts` loads the sample inbox into
 * this collection. When the integration lands it replaces the seed, and nothing
 * above this file changes.
 */
async function messages() {
  return tenantScope<MailMessageDocument>(COLLECTION);
}

function toMessage(doc: MailMessageDocument): MailMessage {
  return {
    id: doc.messageId,
    from: doc.from,
    email: doc.email,
    category: doc.category,
    subject: doc.subject,
    time: doc.time,
    date: doc.date,
    priority: doc.priority,
    unread: doc.unread,
    aiSummary: doc.aiSummary,
    actionItems: doc.actionItems,
    body: doc.body,
    replies: doc.replies,
    deadline: doc.deadline,
    needsApproval: doc.needsApproval,
    approvalReason: doc.approvalReason,
    aiGeneratedAt: doc.aiGeneratedAt ? doc.aiGeneratedAt.toISOString() : null,
    // Absent on documents seeded before reply drafting existed.
    suggestedReply: doc.suggestedReply ?? null,
    sentReplies: (doc.sentReplies ?? []).map((reply) => ({
      body: reply.body,
      sentAt: reply.sentAt.toISOString(),
    })),
  };
}

/** The whole inbox for the active business, newest first. */
export async function listMessages(): Promise<MailMessage[]> {
  const collection = await messages();
  const docs = await collection.find().sort({ receivedAt: -1 }).toArray();
  return docs.map(toMessage);
}

/**
 * Writes retrieved mail into the inbox.
 *
 * Idempotent by construction: the upsert is keyed on `messageId`, and
 * `{ businessId: 1, messageId: 1 }` is unique, so re-polling a mailbox updates
 * what is already there instead of duplicating it. Only the delivered fields
 * are written — everything a model assigns goes in with `$setOnInsert`, so a
 * message that has already been triaged never loses its analysis to a re-fetch,
 * and never gets re-billed for one.
 *
 * The display strings are derived here, on the server, for the reason
 * `src/lib/dal/bookings.ts` sets out: formatting them in the browser would use
 * the visitor's timezone and mismatch the server-rendered HTML.
 *
 * Returns how many messages were new, which is what decides whether the caller
 * needs to revalidate anything.
 */
export async function upsertFetchedMessages(
  fetched: FetchedMessage[],
): Promise<number> {
  const collection = await messages();
  const now = new Date();
  let inserted = 0;

  for (const message of fetched) {
    const result = await collection.updateOne(
      { messageId: message.messageId },
      {
        $set: {
          from: message.from,
          email: message.email,
          subject: message.subject,
          body: message.body,
          receivedAt: message.receivedAt,
          unread: message.unread,
          uid: message.uid,
          uidValidity: message.uidValidity,
          time: formatStamp(message.receivedAt),
          date: formatDay(message.receivedAt),
        },
        $setOnInsert: {
          messageId: message.messageId,
          // Deliberately unanalysed: `listUntriaged` is a set difference on
          // these two fields, so a newly arrived message is picked up by the
          // existing triage sweep with no further wiring.
          category: "Other",
          priority: "Normal",
          aiSummary: "",
          actionItems: [],
          replies: [],
          deadline: null,
          needsApproval: false,
          approvalReason: "",
          aiGeneratedAt: null,
          aiPromptVersion: null,
          suggestedReply: null,
          replyPromptVersion: null,
          createdAt: now,
        },
      },
      { upsert: true },
    );

    if (result.upsertedCount > 0) inserted += 1;
  }

  return inserted;
}

/**
 * Where the mail server keeps this message, so its flags can be addressed.
 *
 * Returns null when the message predates retrieval and has no UID — there is
 * nothing on the server to mark, and pretending otherwise would write a flag
 * onto whichever message happens to hold that number now.
 */
export async function readMessageLocation(
  messageId: string,
): Promise<{ uid: number; uidValidity: string } | null> {
  const collection = await messages();
  const doc = await collection.findOne({ messageId });
  if (!doc?.uid || !doc.uidValidity) return null;
  return { uid: doc.uid, uidValidity: doc.uidValidity };
}

/** Records the read state locally, after the mail server has accepted it. */
export async function setMessageRead(
  messageId: string,
  read: boolean,
): Promise<void> {
  const collection = await messages();
  await collection.updateOne({ messageId }, { $set: { unread: !read } });
}

/**
 * Appends a reply that has already been accepted by the mail server.
 *
 * Called only after SMTP confirms; the thread must never show a reply that did
 * not actually go out.
 */
export async function recordSentReply(
  messageId: string,
  body: string,
): Promise<void> {
  const collection = await messages();
  await collection.updateOne(
    { messageId },
    { $push: { sentReplies: { body, sentAt: new Date() } } },
  );
}

/** One message by its id, or null. Tenant-scoped like every other mail read. */
export async function findMessage(
  messageId: string,
): Promise<MailMessage | null> {
  const collection = await messages();
  const doc = await collection.findOne({ messageId });
  return doc ? toMessage(doc) : null;
}

/** Just the badge count, without pulling every body across. */
export async function unreadCount(): Promise<number> {
  const collection = await messages();
  return collection.countDocuments({ unread: true });
}

/**
 * How current the mail data is: the newest message AEGIS holds, and how many it
 * holds at all.
 *
 * This is a real read, not a display string. Nothing may report freshness from
 * a timer or a remembered value — an old inbox reading as current is exactly
 * the failure the status line exists to prevent.
 */
export async function readMailFreshness(): Promise<{
  newestReceivedAt: string | null;
  count: number;
}> {
  const collection = await messages();
  const [newest, count] = await Promise.all([
    collection.find().sort({ receivedAt: -1 }).limit(1).next(),
    collection.countDocuments(),
  ]);

  return {
    newestReceivedAt: newest ? newest.receivedAt.toISOString() : null,
    count,
  };
}

/**
 * The freshness the app shell renders: the age of the newest message, whether
 * a mailbox is feeding it, and the wording for both.
 *
 * Worded here rather than in the layout so a single `now` produces the label
 * and the verdict together, and so the render path stays free of clock reads.
 */
export async function readMailFreshnessState(): Promise<MailFreshnessState> {
  const [{ newestReceivedAt }, connected, sync, session] = await Promise.all([
    readMailFreshness(),
    isMailboxConnected(),
    readActiveMailSync(),
    verifySession(),
  ]);
  const now = Date.now();

  /**
   * Once a mailbox is connected the pill reports the last *retrieval*, not the
   * age of the newest message: a quiet inbox is not a stale one, and only the
   * retrieval time can tell the owner whether AEGIS is still reading their
   * mail. With no mailbox connected there is nothing to report but the age of
   * the sample data, which is what it says.
   */
  const reference = connected
    ? (sync?.lastSyncAt?.toISOString() ?? null)
    : newestReceivedAt;

  return {
    businessId: session.activeBusinessId,
    newestReceivedAt: reference,
    connected,
    label: relativeAge(reference, now),
    tone: freshnessTone(reference, now),
  };
}

/**
 * Messages a model has not yet analysed at the current prompt version.
 *
 * This is the whole token-control story for mail: triage is a set difference,
 * not a sweep. Re-running it after every message has been analysed selects
 * nothing and costs nothing, so the sync button is safe to press repeatedly.
 */
export async function listUntriaged(
  promptVersion: number,
  limit: number,
): Promise<MailMessageDocument[]> {
  const collection = await messages();
  return collection
    .find({ aiPromptVersion: { $ne: promptVersion } })
    .sort({ receivedAt: -1 })
    .limit(limit)
    .toArray();
}

/**
 * Writes one batch of triage results back onto their messages. Results are
 * validated by the caller; an id the model invented simply matches nothing,
 * because the filter is tenant-scoped.
 */
/**
 * Messages that should have a full draft reply and do not have a current one.
 *
 * The same set difference triage uses, with two extra conditions. A message is
 * only drafted once it has been triaged — the draft depends on the category and
 * the approval flag, so drafting first would mean paying twice. And categories
 * `replyPolicy` says not to reply to are excluded in the query rather than
 * filtered afterwards, so they never reach the model at all.
 */
export async function listNeedingReply(
  promptVersion: number,
  limit: number,
): Promise<MailMessage[]> {
  const collection = await messages();
  const docs = await collection
    .find({
      aiPromptVersion: { $ne: null },
      category: { $nin: NO_DRAFT_CATEGORIES },
      replyPromptVersion: { $ne: promptVersion },
    })
    .sort({ receivedAt: -1 })
    .limit(limit)
    .toArray();

  return docs.map(toMessage);
}

export async function applyReplyDraft(
  messageId: string,
  body: string,
  promptVersion: number,
): Promise<void> {
  const collection = await messages();
  await collection.updateOne(
    { messageId },
    { $set: { suggestedReply: body, replyPromptVersion: promptVersion } },
  );
}

/**
 * Records that drafting was tried and produced nothing usable, so the sweep
 * does not pay to fail on the same message on every future sync.
 */
export async function markReplyAttempted(
  messageIds: string[],
  promptVersion: number,
): Promise<void> {
  const collection = await messages();
  for (const messageId of messageIds) {
    await collection.updateOne(
      { messageId },
      { $set: { replyPromptVersion: promptVersion } },
    );
  }
}

export async function applyTriage(
  results: MailTriageResult[],
  promptVersion: number,
): Promise<number> {
  const collection = await messages();
  const now = new Date();
  let applied = 0;

  for (const result of results) {
    const previous = await collection.findOne({ messageId: result.id });

    /**
     * A stored reply draft was written from the category, the deadline and the
     * approval flag as they stood. If re-triage changes any of those, the draft
     * no longer follows from its inputs, so it is marked for rewriting on the
     * next sweep.
     *
     * A change to the approval flag itself also clears the draft outright: a
     * message that has just become approval-required must not keep a reply
     * composed while it was not, because that draft was written without the
     * guardrail that forbids accepting on the company's behalf.
     */
    const inputsChanged =
      previous !== null &&
      (previous.category !== result.category ||
        previous.deadline !== result.deadline ||
        previous.needsApproval !== result.needsApproval ||
        previous.approvalReason !== result.approvalReason);
    const approvalChanged =
      previous !== null && previous.needsApproval !== result.needsApproval;

    await collection.updateOne(
      { messageId: result.id },
      {
        $set: {
          priority: result.priority,
          category: result.category,
          aiSummary: result.summary,
          actionItems: result.actionItems,
          replies: result.replies,
          deadline: result.deadline,
          needsApproval: result.needsApproval,
          approvalReason: result.approvalReason,
          aiGeneratedAt: now,
          aiPromptVersion: promptVersion,
          ...(inputsChanged ? { replyPromptVersion: null } : {}),
          ...(approvalChanged ? { suggestedReply: null } : {}),
        },
      },
    );
    applied += 1;
  }

  return applied;
}

/**
 * Marks a batch as analysed without changing its content. Used when a batch is
 * unusable, so a message that the model consistently fails on does not get
 * retried — and re-billed — on every sync.
 */
export async function markTriageAttempted(
  messageIds: string[],
  promptVersion: number,
): Promise<void> {
  const collection = await messages();
  for (const messageId of messageIds) {
    await collection.updateOne(
      { messageId },
      { $set: { aiPromptVersion: promptVersion } },
    );
  }
}
