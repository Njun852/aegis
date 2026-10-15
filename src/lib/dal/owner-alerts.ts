import "server-only";

import { manilaDateKey } from "@/lib/booking-slots";
import { formatStamp } from "@/lib/format";
import {
  MAX_DAILY_LIMIT,
  MAX_RECIPIENTS,
  OWNER_ALERT_GROUPS,
  ownerAlertConfigOf,
  testText,
} from "@/lib/owner-alerts";
import { getSmsProvider } from "@/lib/sms/provider";
import { toE164 } from "@/lib/text-blast";
import { businessesCollection, getDb } from "./db";
import { InputError, isDuplicateKey } from "./refs";
import { requireAdmin, verifySession } from "./session";
import type {
  OwnerAlertConfig,
  OwnerAlertDocument,
  OwnerAlertGroup,
  OwnerAlertPanelData,
  OwnerAlertRecipient,
} from "@/types";

/**
 * Owner text alerts. Addressed by business id rather than through
 * `tenantScope`, because one of the events (a request from the public booking
 * page) arrives with no session; the session-bound callers pass the active
 * business explicitly through `notifyOwner`.
 *
 * Sending never gets in the way of the work that raised it: whatever happens
 * here is recorded and logged, and the caller carries on.
 */
async function alerts() {
  const db = await getDb();
  return db.collection<OwnerAlertDocument>("ownerAlerts");
}

/** Texts that count against the daily limit: every one that was, or would have been, sent today. */
async function countToday(businessId: string, now: Date): Promise<number> {
  const collection = await alerts();
  const midnight = new Date(`${manilaDateKey(now)}T00:00:00+08:00`);
  return collection.countDocuments({ businessId, status: { $ne: "skipped" }, createdAt: { $gte: midnight } });
}

async function deliver(
  businessId: string,
  group: OwnerAlertGroup,
  eventKey: string,
  body: string,
  recipients: OwnerAlertRecipient[],
  dailyLimit: number,
): Promise<number> {
  const collection = await alerts();
  const provider = getSmsProvider();
  let written = 0;

  for (const recipient of recipients) {
    const to = toE164(recipient.mobile);
    if (!to) continue;
    const now = new Date();
    const overLimit = (await countToday(businessId, now)) >= dailyLimit;
    const doc: OwnerAlertDocument = {
      businessId,
      group,
      eventKey,
      to,
      recipientName: recipient.name,
      body,
      status: overLimit ? "skipped" : "not-sent",
      reason: overLimit
        ? `Daily limit of ${dailyLimit} texts reached.`
        : provider
          ? "Sending."
          : "No SMS provider is connected yet.",
      provider: provider?.name ?? null,
      providerId: null,
      createdAt: now,
    };

    // Written before sending, so a repeat of the same event finds it and is
    // refused by the unique index instead of texting the owner twice.
    try {
      await collection.insertOne(doc);
    } catch (error) {
      if (isDuplicateKey(error)) continue;
      throw error;
    }
    written += 1;
    if (overLimit || !provider) continue;

    try {
      const result = await provider.send(to, body);
      await collection.updateOne(
        { businessId, eventKey, to },
        result.ok
          ? { $set: { status: "sent", reason: "", providerId: result.id } }
          : { $set: { status: "failed", reason: result.error } },
      );
    } catch (error) {
      await collection.updateOne(
        { businessId, eventKey, to },
        { $set: { status: "failed", reason: "The SMS provider could not be reached." } },
      );
      console.error("[owner-alerts] send failed", error instanceof Error ? error.message : error);
    }
  }
  return written;
}

/**
 * Texts the business's chosen people about one event, if they asked for that
 * kind. `eventKey` names the event exactly ("quote-answered:QT-1004:2"), which
 * is what keeps a repeated event from texting twice.
 */
export async function notifyOwnerFor(
  businessId: string,
  group: OwnerAlertGroup,
  eventKey: string,
  body: string,
): Promise<void> {
  try {
    const businesses = await businessesCollection();
    const doc = await businesses.findOne({ businessId }, { projection: { ownerAlerts: 1 } });
    const config = ownerAlertConfigOf(doc?.ownerAlerts);
    if (!config.enabled || !config.groups.includes(group) || config.recipients.length === 0) return;
    await deliver(businessId, group, eventKey, body, config.recipients, config.dailyLimit);
  } catch (error) {
    console.error("[owner-alerts]", error instanceof Error ? error.message : error);
  }
}

/** The same, for the signed-in business. */
export async function notifyOwner(group: OwnerAlertGroup, eventKey: string, body: string): Promise<void> {
  const { activeBusinessId } = await verifySession();
  await notifyOwnerFor(activeBusinessId, group, eventKey, body);
}

// ---- Business Management ---------------------------------------------------------

export async function readOwnerAlertPanel(businessId: string): Promise<OwnerAlertPanelData> {
  await requireAdmin();
  const businesses = await businessesCollection();
  const doc = await businesses.findOne({ businessId }, { projection: { ownerAlerts: 1 } });
  const collection = await alerts();
  const recent = await collection.find({ businessId }).sort({ createdAt: -1 }).limit(8).toArray();
  return {
    config: ownerAlertConfigOf(doc?.ownerAlerts),
    provider: getSmsProvider()?.name ?? null,
    sentToday: await countToday(businessId, new Date()),
    recent: recent.map((entry) => ({
      group: entry.group,
      recipientName: entry.recipientName,
      body: entry.body,
      status: entry.status,
      reason: entry.reason,
      at: formatStamp(entry.createdAt),
    })),
  };
}

const GROUP_KEYS = OWNER_ALERT_GROUPS.map((group) => group.key);

export async function saveOwnerAlerts(businessId: string, raw: OwnerAlertConfig): Promise<void> {
  await requireAdmin();
  const recipients: OwnerAlertRecipient[] = [];
  for (const entry of Array.isArray(raw.recipients) ? raw.recipients : []) {
    const name = typeof entry?.name === "string" ? entry.name.trim().slice(0, 60) : "";
    const mobile = typeof entry?.mobile === "string" ? entry.mobile.trim().slice(0, 20) : "";
    if (!name && !mobile) continue;
    if (!name) throw new InputError("Give each number a name, so the log says who was texted.");
    if (!toE164(mobile)) throw new InputError(`${name}: enter a Philippine mobile number, such as 0917 123 4567.`);
    recipients.push({ name, mobile });
  }
  if (recipients.length > MAX_RECIPIENTS) throw new InputError(`Up to ${MAX_RECIPIENTS} numbers.`);
  const groups = Array.isArray(raw.groups)
    ? GROUP_KEYS.filter((key) => raw.groups.includes(key))
    : [];
  const dailyLimit = raw.dailyLimit;
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > MAX_DAILY_LIMIT) {
    throw new InputError(`The daily limit must be 1 to ${MAX_DAILY_LIMIT} texts.`);
  }
  if (raw.enabled && recipients.length === 0) throw new InputError("Add a number to text before switching alerts on.");
  if (raw.enabled && groups.length === 0) throw new InputError("Choose at least one kind of alert.");

  const businesses = await businessesCollection();
  const result = await businesses.updateOne(
    { businessId },
    { $set: { ownerAlerts: { enabled: Boolean(raw.enabled), recipients, groups, dailyLimit } } },
  );
  if (result.matchedCount === 0) throw new InputError("That business is no longer on file.");
}

/** One test text to each saved number, whatever kinds are chosen. Counts against the daily limit like any other. */
export async function sendTestAlert(businessId: string): Promise<{ written: number; provider: string | null }> {
  await requireAdmin();
  const businesses = await businessesCollection();
  const doc = await businesses.findOne({ businessId }, { projection: { ownerAlerts: 1, name: 1 } });
  if (!doc) throw new InputError("That business is no longer on file.");
  const config = ownerAlertConfigOf(doc.ownerAlerts);
  if (config.recipients.length === 0) throw new InputError("Save a number first.");
  const written = await deliver(
    businessId,
    "quotes",
    `test:${Date.now()}`,
    testText(doc.name),
    config.recipients,
    config.dailyLimit,
  );
  return { written, provider: getSmsProvider()?.name ?? null };
}
