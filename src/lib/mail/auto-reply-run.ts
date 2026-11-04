import "server-only";

import { PROMPT_VERSION } from "@/lib/ai/mail-triage-prompt";
import { REPLY_PROMPT_VERSION } from "@/lib/ai/reply";
import {
  claimAutoReply,
  countAutoRepliesToday,
  finishAutoReply,
  isThreadAnswered,
  listAutoReplyCandidates,
  markAutoReplyHeld,
  readAutoReplyConfig,
  repliedToSenderSince,
} from "@/lib/dal/mail-auto-reply";
import { readMailIdentity } from "@/lib/dal/mailbox";
import { NO_DRAFT_CATEGORIES } from "@/lib/mail-reply-policy";
import {
  AUTO_REPLY_SENDER_GAP_MS,
  autoReplyFooter,
  autoReplySubject,
  autoReplyVerdict,
} from "./auto-reply";
import { explainMailFailure } from "./failures";
import { sendMail } from "./ingest";
import type { MailMessageDocument } from "@/types";

/**
 * Sends the automatic replies the rule allows, after triage and drafting have
 * run in the same sync.
 *
 * No model is called here. The decision reads the stored triage and the reply
 * text is the stored Suggested Reply, so this adds nothing to the AI bill — it
 * only spends what drafting already bought.
 */

/** Messages judged per sync. The daily limit is what bounds sending. */
const CANDIDATES_PER_RUN = 25;

export interface AutoReplyReport {
  sent: number;
  failed: number;
  held: number;
}

const IDLE: AutoReplyReport = { sent: 0, failed: 0, held: 0 };

export async function runAutoReplies(): Promise<AutoReplyReport> {
  const config = await readAutoReplyConfig();
  if (!config.enabled || !config.enabledAt) return IDLE;

  const identity = await readMailIdentity();
  if (!identity.address) return IDLE;

  const candidates = await listAutoReplyCandidates(config.enabledAt, CANDIDATES_PER_RUN);
  const report = { ...IDLE };

  for (const doc of candidates) {
    const now = new Date();
    const triaged = doc.aiPromptVersion === PROMPT_VERSION;
    const draftCurrent = doc.replyPromptVersion === REPLY_PROMPT_VERSION;

    // The drafting sweep is capped per run, so a message entitled to a draft
    // may simply not have reached the front of the queue. Judging it now would
    // hold it for want of a draft that the next sync writes.
    if (triaged && doc.aiSummary.trim() && !draftCurrent && !NO_DRAFT_CATEGORIES.includes(doc.category)) {
      continue;
    }

    const threadId = doc.signals?.threadId ?? doc.messageId;
    const verdict = autoReplyVerdict(
      {
        email: doc.email,
        subject: doc.subject,
        body: doc.body,
        category: doc.category,
        priority: doc.priority,
        aiSummary: doc.aiSummary,
        actionItems: doc.actionItems,
        deadline: doc.deadline,
        needsApproval: doc.needsApproval,
        triaged,
        suggestedReply: doc.suggestedReply,
        draftCurrent,
        signals: doc.signals ?? null,
        answered: (doc.sentReplies?.length ?? 0) > 0 || (await isThreadAnswered(threadId)),
        receivedAt: doc.receivedAt,
      },
      { mailbox: identity.address, enabledAt: config.enabledAt, now },
    );

    if (!verdict.send) {
      await markAutoReplyHeld(doc.messageId, verdict.reason);
      report.held += 1;
      continue;
    }

    const to = doc.email.trim().toLowerCase();
    if (await repliedToSenderSince(to, new Date(now.getTime() - AUTO_REPLY_SENDER_GAP_MS))) {
      await markAutoReplyHeld(doc.messageId, "This sender already had an automatic reply today");
      report.held += 1;
      continue;
    }
    if ((await countAutoRepliesToday(now)) >= config.dailyLimit) {
      await markAutoReplyHeld(doc.messageId, `Today's limit of ${config.dailyLimit} automatic replies was reached`);
      report.held += 1;
      continue;
    }

    const outcome = await send(doc, threadId, to, identity.businessName);
    if (outcome === "sent") report.sent += 1;
    else if (outcome === "failed") report.failed += 1;
    else report.held += 1;
  }

  return report;
}

async function send(
  doc: MailMessageDocument,
  threadId: string,
  to: string,
  businessName: string,
): Promise<"sent" | "failed" | "held"> {
  const subject = autoReplySubject(doc.subject);
  const body = `${doc.suggestedReply!.trim()}\n\n${autoReplyFooter(businessName)}`;

  if (!(await claimAutoReply({ messageId: doc.messageId, threadId, to, subject, body }))) {
    await markAutoReplyHeld(doc.messageId, "Already answered automatically in this conversation");
    return "held";
  }

  // Threaded only on a real Message-ID; the `uidValidity:uid` fallback is ours.
  const realId = doc.messageId.startsWith("<") ? doc.messageId : null;
  const references = [...(doc.signals?.references ?? []), ...(realId ? [realId] : [])];

  const failure = await sendMail(to, subject, body, [], {
    inReplyTo: realId ?? undefined,
    references,
    automatic: true,
  });

  if (failure) {
    await finishAutoReply(doc.messageId, threadId, { sent: false, reason: explainMailFailure(failure) });
    return "failed";
  }
  await finishAutoReply(doc.messageId, threadId, { sent: true, body });
  return "sent";
}
