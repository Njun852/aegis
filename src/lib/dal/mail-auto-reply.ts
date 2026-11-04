import "server-only";

import { manilaDateKey } from "@/lib/booking-slots";
import { MAIL_AUTO_REPLY_INDEXES } from "@/lib/data/mail-auto-reply";
import { formatStamp } from "@/lib/format";
import {
  AUTO_REPLY_MAX_AGE_MS,
  MAX_AUTO_REPLY_DAILY_LIMIT,
  autoReplyConfigOf,
} from "@/lib/mail/auto-reply";
import { businessesCollection, getDb } from "./db";
import { InputError, isDuplicateKey } from "./refs";
import { requireAdmin, verifySession } from "./session";
import { tenantScope } from "./tenant";
import type {
  MailAutoReplyConfig,
  MailAutoReplyDocument,
  MailAutoReplyPanelData,
  MailAutoReplyStatus,
  MailMessageDocument,
} from "@/types";

/**
 * Automatic mail replies: the setting, the record of every reply, and the two
 * limits that need the database — the daily cap and once per conversation.
 *
 * The sending path is session-bound (it runs inside the inbox sync) and goes
 * through `tenantScope`. The admin panel reports on a business by id, like
 * owner alerts, and is gated by `requireAdmin`.
 */

const LOG = "mailAutoReplies";

/**
 * Production databases are never seeded, and "once per conversation" rests on
 * the unique index, so the DAL makes sure it exists before the first claim.
 * `createIndex` is a no-op when the index is already there; this runs once per
 * server process.
 */
let indexesReady: Promise<void> | null = null;
function ensureIndexes(): Promise<void> {
  indexesReady ??= (async () => {
    const db = await getDb();
    for (const index of MAIL_AUTO_REPLY_INDEXES) {
      await db.collection(index.collection).createIndex(index.keys, index.options ?? {});
    }
  })().catch((error) => {
    indexesReady = null;
    throw error;
  });
  return indexesReady;
}

function manilaMidnight(now: Date): Date {
  return new Date(`${manilaDateKey(now)}T00:00:00+08:00`);
}

// ---- The setting ---------------------------------------------------------------

/** The active business's setting. Switched off unless an admin turned it on. */
export async function readAutoReplyConfig(): Promise<MailAutoReplyConfig> {
  const { activeBusinessId } = await verifySession();
  const businesses = await businessesCollection();
  const doc = await businesses.findOne(
    { businessId: activeBusinessId },
    { projection: { mailAutoReply: 1 } },
  );
  return autoReplyConfigOf(doc?.mailAutoReply);
}

export async function readAutoReplyPanel(businessId: string): Promise<MailAutoReplyPanelData> {
  await requireAdmin();
  const businesses = await businessesCollection();
  const doc = await businesses.findOne(
    { businessId },
    { projection: { mailAutoReply: 1, mailbox: 1 } },
  );
  const config = autoReplyConfigOf(doc?.mailAutoReply);
  const db = await getDb();
  const log = db.collection<MailAutoReplyDocument>(LOG);
  const [sentToday, recent] = await Promise.all([
    log.countDocuments({ businessId, createdAt: { $gte: manilaMidnight(new Date()) } }),
    log.find({ businessId }).sort({ createdAt: -1 }).limit(8).toArray(),
  ]);

  return {
    enabled: config.enabled,
    dailyLimit: config.dailyLimit,
    enabledAt: config.enabledAt ? config.enabledAt.toISOString() : null,
    mailboxConnected: Boolean(doc?.mailbox?.address),
    sentToday,
    recent: recent.map((entry) => ({
      to: entry.to,
      subject: entry.subject,
      status: entry.status,
      reason: entry.reason,
      at: formatStamp(entry.createdAt),
    })),
  };
}

/**
 * Saves the switch and the daily limit. `enabledAt` moves only when the switch
 * goes from off to on: mail that arrived while it was off is never answered,
 * and saving a new limit must not quietly widen or narrow that window.
 */
export async function saveAutoReply(
  businessId: string,
  raw: { enabled: boolean; dailyLimit: number },
): Promise<MailAutoReplyConfig> {
  await requireAdmin();
  const dailyLimit = raw.dailyLimit;
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > MAX_AUTO_REPLY_DAILY_LIMIT) {
    throw new InputError(`The daily limit must be 1 to ${MAX_AUTO_REPLY_DAILY_LIMIT} replies.`);
  }

  const businesses = await businessesCollection();
  const doc = await businesses.findOne(
    { businessId },
    { projection: { mailAutoReply: 1, mailbox: 1 } },
  );
  if (!doc) throw new InputError("That business is no longer on file.");
  const enabled = Boolean(raw.enabled);
  if (enabled && !doc.mailbox?.address) {
    throw new InputError("Connect a mailbox first; automatic replies are sent from it.");
  }

  const previous = autoReplyConfigOf(doc.mailAutoReply);
  const config: MailAutoReplyConfig = {
    enabled,
    dailyLimit,
    enabledAt: enabled ? (previous.enabled && previous.enabledAt ? previous.enabledAt : new Date()) : null,
  };
  await businesses.updateOne({ businessId }, { $set: { mailAutoReply: config } });
  return config;
}

// ---- Selecting and judging -----------------------------------------------------

/**
 * Analysed mail from the last day that automatic replies have not judged yet.
 * Each message is judged once: the verdict is written onto it, so a later sync
 * selects nothing it has already decided.
 */
export async function listAutoReplyCandidates(
  since: Date,
  limit: number,
): Promise<MailMessageDocument[]> {
  const collection = await tenantScope<MailMessageDocument>("messages");
  const floor = new Date(Math.max(since.getTime(), Date.now() - AUTO_REPLY_MAX_AGE_MS));
  return collection
    .find({
      receivedAt: { $gte: floor },
      aiPromptVersion: { $ne: null },
      autoReply: { $exists: false },
    })
    .sort({ receivedAt: -1 })
    .limit(limit)
    .toArray();
}

/** Whether anything in this conversation has already been answered, by a person or automatically. */
export async function isThreadAnswered(threadId: string): Promise<boolean> {
  const messages = await tenantScope<MailMessageDocument>("messages");
  const log = await tenantScope<MailAutoReplyDocument>(LOG);
  const [replied, auto] = await Promise.all([
    messages.countDocuments({ "signals.threadId": threadId, "sentReplies.0": { $exists: true } }),
    log.countDocuments({ threadId }),
  ]);
  return replied > 0 || auto > 0;
}

/** Automatic replies started today, sent or not: the daily limit counts attempts. */
export async function countAutoRepliesToday(now: Date): Promise<number> {
  const log = await tenantScope<MailAutoReplyDocument>(LOG);
  return log.countDocuments({ createdAt: { $gte: manilaMidnight(now) } });
}

export async function repliedToSenderSince(to: string, since: Date): Promise<boolean> {
  const log = await tenantScope<MailAutoReplyDocument>(LOG);
  return (await log.countDocuments({ to, createdAt: { $gte: since } })) > 0;
}

/** Records why a message waits for a person, so the mail screen can say so. */
export async function markAutoReplyHeld(messageId: string, reason: string): Promise<void> {
  const messages = await tenantScope<MailMessageDocument>("messages");
  await messages.updateOne(
    { messageId, autoReply: { $exists: false } },
    { $set: { autoReply: { status: "held" satisfies MailAutoReplyStatus, reason, at: new Date() } } },
  );
}

// ---- Sending -------------------------------------------------------------------

/**
 * Writes the reply's record before it is sent. Returns false when this
 * conversation already has one, which the unique index decides — that is what
 * holds "once per conversation" even when two syncs race.
 */
export async function claimAutoReply(
  entry: Omit<MailAutoReplyDocument, "businessId" | "status" | "reason" | "createdAt">,
): Promise<boolean> {
  await ensureIndexes();
  const log = await tenantScope<MailAutoReplyDocument>(LOG);
  try {
    await log.insertOne({ ...entry, status: "sending", reason: "", createdAt: new Date() });
    return true;
  } catch (error) {
    if (isDuplicateKey(error)) return false;
    throw error;
  }
}

/**
 * Records how the send went, on the log and on the message. A sent reply joins
 * the message's thread like one a person sent, marked as automatic; a failed
 * one is not retried — SMTP can fail after delivering, and a duplicate is worse
 * than a person answering — and the mail screen says it needs answering.
 */
export async function finishAutoReply(
  messageId: string,
  threadId: string,
  outcome: { sent: true; body: string } | { sent: false; reason: string },
): Promise<void> {
  const log = await tenantScope<MailAutoReplyDocument>(LOG);
  const messages = await tenantScope<MailMessageDocument>("messages");
  const now = new Date();

  if (outcome.sent) {
    await log.updateOne({ threadId }, { $set: { status: "sent", reason: "" } });
    await messages.updateOne(
      { messageId },
      {
        $push: { sentReplies: { body: outcome.body, sentAt: now, auto: true } },
        $set: { autoReply: { status: "sent" satisfies MailAutoReplyStatus, reason: "", at: now } },
      },
    );
    return;
  }

  await log.updateOne({ threadId }, { $set: { status: "failed", reason: outcome.reason } });
  await messages.updateOne(
    { messageId },
    { $set: { autoReply: { status: "failed" satisfies MailAutoReplyStatus, reason: outcome.reason, at: now } } },
  );
}
