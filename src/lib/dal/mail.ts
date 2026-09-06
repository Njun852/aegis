import "server-only";

import { tenantScope } from "./tenant";
import { freshnessTone, relativeAge } from "@/lib/freshness";
import { NO_DRAFT_CATEGORIES } from "@/lib/mail-reply-policy";
import { isMailboxConnected } from "@/lib/integrations";
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
  };
}

/** The whole inbox for the active business, newest first. */
export async function listMessages(): Promise<MailMessage[]> {
  const collection = await messages();
  const docs = await collection.find().sort({ receivedAt: -1 }).toArray();
  return docs.map(toMessage);
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
  const { newestReceivedAt } = await readMailFreshness();
  const now = Date.now();

  return {
    newestReceivedAt,
    connected: isMailboxConnected(),
    label: relativeAge(newestReceivedAt, now),
    tone: freshnessTone(newestReceivedAt, now),
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
