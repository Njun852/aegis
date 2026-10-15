import "server-only";

import type { IncomingMessage } from "@/lib/meta/webhook";
import {
  businessesCollection,
  getDb,
  messengerConversationsCollection,
  messengerStateCollection,
} from "./db";
import { formatStamp } from "@/lib/format";
import { listBookingsForChats } from "./bookings";
import { tenantScope } from "./tenant";
import type { AdRowDocument, MessengerConversation, MessengerConversationDocument } from "@/types";

/**
 * Messenger chats, written by the webhook.
 *
 * Everything here takes an explicit `businessId` rather than going through
 * `tenantScope`: a webhook delivery has no session to scope by. The business is
 * resolved from the Page id Meta names, and nothing is written for a Page no
 * business has claimed — an unknown Page id is dropped, so a stray delivery
 * cannot create records under someone else's tenant.
 *
 * Reads for the screens are tenant-scoped in the usual way.
 */

/** How much of a long chat is kept. Enough for the AI to read the request. */
const MAX_MESSAGES = 40;

/** Which business owns the Page Meta is talking about, if any. */
export async function findBusinessIdByPageId(pageId: string): Promise<string | null> {
  const businesses = await businessesCollection();
  const business = await businesses.findOne(
    { "metaAds.pageId": pageId },
    { projection: { businessId: 1 } },
  );
  return business?.businessId ?? null;
}

/**
 * The campaign an ad belongs to, from the rows the ads sync already stored.
 * Null when the ad is not in the synced account, or the account has not been
 * synced since campaign ids were recorded — the chat is still stored, just
 * without credit to a campaign.
 */
async function campaignForAd(
  businessId: string,
  adId: string,
): Promise<{ campaignId: string; campaignName: string } | null> {
  const db = await getDb();
  const rows = db.collection<AdRowDocument>("adRows");
  const ad = await rows.findOne({ businessId, id: adId, source: "meta" });
  if (!ad) return null;

  if (ad.campaignId) {
    const campaign = await rows.findOne({
      businessId,
      id: ad.campaignId,
      level: "campaigns",
    });
    return { campaignId: ad.campaignId, campaignName: campaign?.name ?? ad.parent ?? "" };
  }

  /**
   * Rows synced before campaign ids were recorded carry only names: an ad
   * names its ad set, and an ad set names its campaign. Walking that is less
   * certain than an id — two campaigns could share a name — but it is far
   * better than dropping the credit, and the next sync replaces it with the id.
   */
  const adset = await rows.findOne({ businessId, name: ad.parent, level: "adsets" });
  const campaignName = adset?.parent;
  if (!campaignName) return null;

  const campaign = await rows.findOne({ businessId, name: campaignName, level: "campaigns" });
  return campaign ? { campaignId: campaign.id, campaignName: campaign.name } : null;
}

export interface StoreOutcome {
  /** False when this exact message had already been stored. */
  stored: boolean;
  conversation: MessengerConversationDocument | null;
}

/**
 * Stores one message against its chat, creating the chat on first contact.
 *
 * Idempotent on Meta's message id: Meta retries a delivery it thinks failed, and
 * a retry must not double a customer's message. Attribution is written once,
 * from the first message that carries a referral, so a later message in the same
 * chat cannot overwrite which ad brought the customer in.
 */
export async function storeMessage(
  businessId: string,
  message: IncomingMessage,
): Promise<StoreOutcome> {
  const conversations = await messengerConversationsCollection();
  const existing = await conversations.findOne({ businessId, psid: message.psid });

  if (existing?.messages.some((entry) => entry.mid === message.mid)) {
    return { stored: false, conversation: existing };
  }

  const attribution =
    message.adId && !existing?.adId
      ? {
          adId: message.adId,
          referralSource: message.referralSource,
          ...((await campaignForAd(businessId, message.adId)) ?? {
            campaignId: null,
            campaignName: null,
          }),
        }
      : {};

  await conversations.updateOne(
    { businessId, psid: message.psid },
    {
      $set: { lastMessageAt: message.at, ...attribution },
      $setOnInsert: {
        businessId,
        psid: message.psid,
        pageId: message.pageId,
        name: null,
        firstSeenAt: message.at,
        ...(message.adId
          ? {}
          : { adId: null, campaignId: null, campaignName: null, referralSource: null }),
      },
      $push: {
        messages: {
          $each: [
            {
              mid: message.mid,
              text: message.text,
              at: message.at,
              fromPage: message.fromPage,
            },
          ],
          $slice: -MAX_MESSAGES,
        },
      },
    },
    { upsert: true },
  );

  const conversation = await conversations.findOne({ businessId, psid: message.psid });
  return { stored: true, conversation };
}

/** Records that Meta reached us, for the admin panel and System Status. */
export async function recordWebhookEvent(businessId: string, at = new Date()): Promise<void> {
  const state = await messengerStateCollection();
  await state.updateOne(
    { businessId },
    { $set: { lastEventAt: at }, $setOnInsert: { lastSignatureFailureAt: null } },
    { upsert: true },
  );
}

/**
 * Records a delivery whose signature did not match. Kept per business where the
 * Page is known, and against every business otherwise — a stream of these is
 * either a misconfigured app secret or someone posting at the endpoint, and in
 * both cases it has to be visible rather than silent.
 */
export async function recordSignatureFailure(
  businessId: string | null,
  at = new Date(),
): Promise<void> {
  const state = await messengerStateCollection();
  if (businessId) {
    await state.updateOne(
      { businessId },
      { $set: { lastSignatureFailureAt: at }, $setOnInsert: { lastEventAt: null } },
      { upsert: true },
    );
    return;
  }
  await state.updateMany({}, { $set: { lastSignatureFailureAt: at } });
}

export interface MessengerHealth {
  lastEventAt: Date | null;
  lastSignatureFailureAt: Date | null;
  conversationCount: number;
}

export async function readMessengerHealth(businessId: string): Promise<MessengerHealth> {
  const [state, conversations] = await Promise.all([
    messengerStateCollection(),
    messengerConversationsCollection(),
  ]);
  const [doc, conversationCount] = await Promise.all([
    state.findOne({ businessId }),
    conversations.countDocuments({ businessId }),
  ]);

  return {
    lastEventAt: doc?.lastEventAt ?? null,
    lastSignatureFailureAt: doc?.lastSignatureFailureAt ?? null,
    conversationCount,
  };
}

// ---- Reads for the screens (tenant-scoped) ----------------------------------------

const scopedConversations = () => tenantScope<MessengerConversationDocument>("messengerConversations");

/** "Messenger customer · 4821": the page-scoped id is all Meta gives without a profile lookup. */
function chatLabel(psid: string): string {
  return `Messenger customer · ${psid.slice(-4)}`;
}

/**
 * The chats for the inbox, newest activity first, each with the bookings
 * already made from it so staff can see a request exists before making one.
 */
export async function listConversations(limit = 200): Promise<MessengerConversation[]> {
  const collection = await scopedConversations();
  const docs = await collection.find().sort({ lastMessageAt: -1 }).limit(limit).toArray();
  const made = await listBookingsForChats(docs.map((doc) => doc.psid));
  return docs.map((doc) => {
    const own = made.filter((booking) => booking.messengerPsid === doc.psid);
    const named = own.find((booking) => booking.customer.trim());
    const last = doc.messages[doc.messages.length - 1];
    return {
      psid: doc.psid,
      label: named ? `${named.customer} · Messenger` : chatLabel(doc.psid),
      campaignId: doc.campaignId,
      campaignName: doc.campaignName,
      adId: doc.adId,
      firstSeen: formatStamp(doc.firstSeenAt),
      lastMessage: last?.text ?? "",
      lastMessageAt: doc.lastMessageAt.toISOString(),
      messages: doc.messages.map((message) => ({
        mid: message.mid,
        text: message.text,
        at: formatStamp(message.at),
        fromPage: message.fromPage,
      })),
      bookings: own.map((booking) => ({ ref: booking.ref, status: booking.status, day: booking.day })),
    };
  });
}

/** One chat, read on the server when a request is made from it: the attribution is taken from here, never from the browser. */
export async function findConversation(psid: string): Promise<MessengerConversationDocument | null> {
  const collection = await scopedConversations();
  return collection.findOne({ psid });
}

/** Chats started from each campaign's ads within the window, for the funnel's audit figure. */
export async function countChatsByCampaign(from: Date | null, to: Date | null): Promise<Record<string, number>> {
  const collection = await scopedConversations();
  const firstSeenAt: Record<string, Date> = {};
  if (from) firstSeenAt.$gte = from;
  if (to) firstSeenAt.$lt = to;
  const rows = await collection
    .aggregate([
      { $match: { campaignId: { $ne: null }, ...(from || to ? { firstSeenAt } : {}) } },
      { $group: { _id: "$campaignId", count: { $sum: 1 } } },
    ])
    .toArray();
  return Object.fromEntries(rows.map((row) => [String(row._id), Number(row.count)]));
}
