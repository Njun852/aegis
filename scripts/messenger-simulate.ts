/**
 * Messenger webhook rehearsal.
 *
 *   npm run messenger:simulate                  # against BIZ-1001 on localhost
 *   npm run messenger:simulate -- BIZ-1002
 *   npm run messenger:simulate -- BIZ-1001 https://your-tunnel.example
 *
 * Posts exactly what Meta posts — the same envelope, signed the same way with
 * META_APP_SECRET — at the running AEGIS server, then reads the database back
 * and asserts what was stored. It proves the whole path before Meta can reach
 * this machine, and it is the only way to test the failure cases (a wrong
 * signature, a retried delivery) without asking Meta to misbehave.
 *
 * Nothing is sent to Meta. The chats it writes are clearly marked as test
 * chats; delete them from MongoDB when you are done.
 */
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import type { AdRowDocument, BusinessDocument, MessengerConversationDocument } from "@/types";

const businessId = process.argv[2] ?? "BIZ-1001";
const base = (process.argv[3] ?? "http://localhost:3000").replace(/\/$/, "");
const endpoint = `${base}/api/meta/webhook`;

const appSecret = process.env.META_APP_SECRET?.trim();
if (!appSecret) {
  console.error("META_APP_SECRET is not set in .env.local. The webhook cannot be signed.");
  process.exit(1);
}

const mongo = await new MongoClient(process.env.MONGODB_URI!).connect();
const db = mongo.db(process.env.MONGODB_DB_NAME!);

const business = await db
  .collection<BusinessDocument>("businesses")
  .findOne({ businessId });
const pageId = business?.metaAds?.pageId;
if (!pageId) {
  console.error(
    `${businessId} has no Page connected. Connect one in Business Management → Messenger first.`,
  );
  await mongo.close();
  process.exit(1);
}

// A real ad from the synced account, so attribution resolves to a real campaign.
const ad = await db
  .collection<AdRowDocument>("adRows")
  .findOne({ businessId, source: "meta", level: "ads" }, { sort: { enabled: -1 } });
if (!ad) {
  console.error(`${businessId} has no synced Meta ads. Press Sync now on the Ads screen first.`);
  await mongo.close();
  process.exit(1);
}

const run = randomUUID().slice(0, 8);
const fromAd = `TEST-${run}-ad`;
const organic = `TEST-${run}-organic`;

function envelope(psid: string, text: string, mid: string, adId?: string) {
  return {
    object: "page",
    entry: [
      {
        id: pageId,
        time: Date.now(),
        messaging: [
          {
            sender: { id: psid },
            recipient: { id: pageId },
            timestamp: Date.now(),
            ...(adId ? { referral: { source: "ADS", type: "OPEN_THREAD", ad_id: adId } } : {}),
            message: { mid, text },
          },
        ],
      },
    ],
  };
}

async function deliver(body: unknown, { tamper = false } = {}) {
  const raw = JSON.stringify(body);
  const digest = createHmac("sha256", appSecret!).update(raw, "utf8").digest("hex");
  const signature = tamper ? `sha256=${"0".repeat(digest.length)}` : `sha256=${digest}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": signature },
    body: raw,
  });
  return response.status;
}

const conversations = db.collection<MessengerConversationDocument>("messengerConversations");
const read = (psid: string) => conversations.findOne({ businessId, psid });

console.log(`Posting to ${endpoint} as Page ${pageId}…\n`);

// 1. A chat started from a real ad.
const firstMid = `m_${run}_1`;
assert.equal(
  await deliver(
    envelope(fromAd, "Hi, can I book a PMS for my Fortuner this Saturday morning?", firstMid, ad.id),
    {},
  ),
  200,
  "a signed delivery is accepted",
);
const attributed = await read(fromAd);
assert.ok(attributed, "the chat was stored");
assert.equal(attributed.messages.length, 1, "one message");
assert.equal(attributed.adId, ad.id, "the ad that started the chat is remembered");
assert.ok(attributed.campaignId, "the ad resolved to a campaign");
console.log(`✓ ad-started chat stored · ad ${ad.id} → campaign ${attributed.campaignName}`);

// 2. The same delivery again: Meta retries, and a retry must not double it.
assert.equal(await deliver(envelope(fromAd, "ignored", firstMid, ad.id)), 200);
assert.equal((await read(fromAd))?.messages.length, 1, "a retried delivery is stored once");
console.log("✓ retried delivery stored once");

// 3. A second message in the same chat, with no referral: attribution holds.
assert.equal(await deliver(envelope(fromAd, "Around 9am if possible", `m_${run}_2`)), 200);
const second = await read(fromAd);
assert.equal(second?.messages.length, 2, "the follow-up was added");
assert.equal(second?.adId, ad.id, "a later message cannot overwrite the ad credit");
console.log("✓ follow-up added, ad credit unchanged");

// 4. An organic chat: stored, credited to nothing.
assert.equal(
  await deliver(envelope(organic, "Do you do aircon cleaning? How much?", `m_${run}_3`)),
  200,
);
const plain = await read(organic);
assert.equal(plain?.adId, null, "not from an ad");
console.log("✓ organic chat stored with no ad credit");

// 5. A wrong signature: refused, and nothing stored.
const forged = `TEST-${run}-forged`;
assert.equal(
  await deliver(envelope(forged, "should never be stored", `m_${run}_4`), { tamper: true }),
  401,
  "a bad signature is refused",
);
assert.equal(await read(forged), null, "nothing was stored from the refused delivery");
console.log("✓ wrongly signed delivery refused and not stored");

console.log(`\nTest chats written for ${businessId}: ${fromAd}, ${organic}`);
console.log("Delete them from messengerConversations when you are finished.");
await mongo.close();
