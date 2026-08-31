import "server-only";

import { tenantScope } from "./tenant";
import type { MailMessage, MailMessageDocument, MailTriageResult } from "@/types";

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
  };
}

/** The whole inbox for the active business, newest first. */
export async function listMessages(): Promise<MailMessage[]> {
  const collection = await messages();
  const docs = await collection.find().sort({ receivedAt: -1 }).toArray();
  return docs.map(toMessage);
}

/** Just the badge count, without pulling every body across. */
export async function unreadCount(): Promise<number> {
  const collection = await messages();
  return collection.countDocuments({ unread: true });
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
export async function applyTriage(
  results: MailTriageResult[],
  promptVersion: number,
): Promise<number> {
  const collection = await messages();
  const now = new Date();
  let applied = 0;

  for (const result of results) {
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
