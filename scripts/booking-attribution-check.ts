/**
 * Meta-to-Bookings rehearsal.
 *
 *   npm run attribution:check
 *
 * Part one proves the funnel maths on the owner's own example from the
 * acceptance checklist (PMS Campaign: ₱12,400, 510 conversations, 43
 * confirmed bookings → ₱288 per booking, 8.4% conversion), that Meta's
 * conversations are never invented for a campaign optimised for something
 * else, that only confirmed bookings count, the exception flags, and the
 * printed reporting dates.
 *
 * Part two runs the same queries the Ads screen and the Messenger inbox run,
 * against a throwaway business: confirmed bookings per campaign in a window
 * (pending, cancelled and out-of-window bookings left out), the uncredited
 * count, and the one-request-per-chat lookup. It removes everything it wrote.
 *
 * What this does not reach: the DAL needs a signed-in session, so creating a
 * request from a chat is checked in the browser; the webhook's signature,
 * idempotency and locked attribution are proven by \`npm run messenger:simulate\`.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { buildFunnel, conversionPercent, costPer, periodLabel } from "@/lib/ad-funnel";
import { CONFIRMED_STATUSES, isConfirmed } from "@/lib/bookings";
import { windowForRange } from "@/lib/meta/ranges";

// ---- Part one: the maths ----------------------------------------------------------

const pms = { id: "c1", name: "PMS Campaign", enabled: true, spendCents: 1_240_000, results: 510, resultLabel: "conversations" };
const traffic = { id: "c2", name: "Brand traffic", enabled: true, spendCents: 300_000, results: 900, resultLabel: "link clicks" };
const quiet = { id: "c3", name: "Aircon promo", enabled: true, spendCents: 900_000, results: 120, resultLabel: "conversations" };

const funnel = buildFunnel({
  campaigns: [pms, traffic, quiet],
  confirmedByCampaign: { c1: 43, c2: 4 },
  chatsByCampaign: { c1: 61 },
  bookings: [],
  uncreditedConfirmed: 7,
  periodLabel: "Sep 1 – Sep 30, 2026",
});
const row = (id: string) => funnel.rows.find((entry) => entry.campaignId === id)!;

assert.equal(row("c1").costPerBookingCents, 28_837, "₱12,400 ÷ 43 is ₱288.37, shown as ₱288");
assert.equal(row("c1").conversionPercent, 8.4, "43 ÷ 510 is 8.4%, the checklist's example");
assert.equal(row("c1").costPerConversationCents, 2_431, "₱12,400 ÷ 510 conversations");
assert.equal(row("c1").chatsReceived, 61, "AEGIS's own chat count is kept beside Meta's, not mixed into it");
assert.equal(row("c2").conversations, null, "a traffic campaign reports link clicks, never conversations");
assert.equal(row("c2").conversionPercent, null, "so it has no conversion rate rather than a made-up one");
assert.equal(row("c2").costPerBookingCents, 75_000, "but its bookings still have a cost");
assert.equal(row("c3").costPerBookingCents, null, "no bookings, no cost per booking");

assert.equal(funnel.totals.confirmedBookings, 47);
assert.equal(funnel.totals.conversations, 630, "conversations total only over campaigns that report them");
assert.equal(funnel.totals.conversionPercent, 6.8, "conversion: 43 bookings from 630 conversations; the traffic bookings are not counted against them");
assert.equal(funnel.uncreditedConfirmed, 7);

assert.equal(row("c3").flag?.text, "Spending with no confirmed bookings", "money spent with nothing back is flagged first");
assert.equal(row("c1").flag?.tone, "positive", "a campaign well below the average cost per booking is pointed out");
assert.equal(costPer(100, 0), null);
assert.equal(conversionPercent(5, 0), null);

assert.deepEqual(CONFIRMED_STATUSES, ["Confirmed", "In progress", "Completed"]);
assert.ok(!isConfirmed("Pending"), "an unconfirmed request is not a booking");
assert.ok(!isConfirmed("Cancelled"), "a cancelled booking is not a booking");

const tz = "Asia/Manila";
const now = new Date("2026-10-04T10:00:00+08:00");
const window30 = windowForRange("last_30d", tz, now);
assert.equal(periodLabel(window30.from, window30.to, tz), "Sep 4 – Oct 3, 2026", "the printed dates are Meta's: 30 whole days ending yesterday");
const across = windowForRange("last_7d", tz, new Date("2027-01-03T10:00:00+08:00"));
assert.equal(periodLabel(across.from, across.to, tz), "Dec 27, 2026 – Jan 2, 2027", "a period across New Year names both years");
assert.equal(periodLabel(null, null, tz), "All time");

console.log("✓ the checklist's example: ₱288 per booking, 8.4% conversion; no invented conversations; confirmed only; flags; dates");

// ---- Part two: the queries --------------------------------------------------------

const mongo = await new MongoClient(process.env.MONGODB_URI!).connect();
const db = mongo.db(process.env.MONGODB_DB_NAME!);
const businessId = `ATTRIBUTION-CHECK-${randomUUID().slice(0, 8)}`;
const bookings = db.collection("bookings");

try {
  const inside = new Date("2026-09-15T10:00:00+08:00");
  const before = new Date("2026-08-20T10:00:00+08:00");
  const source = (campaignId: string, origin = "messenger") => ({ campaignId, campaignName: campaignId, adId: null, origin });
  await bookings.insertMany([
    { businessId, ref: "BK-1", status: "Confirmed", source: source("c1"), messengerPsid: "p1", createdAt: inside },
    { businessId, ref: "BK-2", status: "Completed", source: source("c1", "manual"), createdAt: inside },
    { businessId, ref: "BK-3", status: "Pending", source: source("c1"), messengerPsid: "p2", createdAt: inside },
    { businessId, ref: "BK-4", status: "Cancelled", source: source("c1"), createdAt: inside },
    { businessId, ref: "BK-5", status: "Confirmed", source: source("c1"), createdAt: before },
    { businessId, ref: "BK-6", status: "Confirmed", createdAt: inside },
    { businessId: `${businessId}-B`, ref: "BK-1", status: "Confirmed", source: source("c1"), createdAt: inside },
  ]);

  const window = { createdAt: { $gte: new Date("2026-09-04T00:00:00+08:00"), $lt: new Date("2026-10-04T00:00:00+08:00") } };
  // The match `countConfirmedByCampaign` runs, scoped as `tenantScope` scopes it.
  const [counted] = await bookings
    .aggregate([
      { $match: { businessId } },
      { $match: { "source.campaignId": { $exists: true, $ne: "" }, status: { $in: CONFIRMED_STATUSES }, ...window } },
      { $group: { _id: "$source.campaignId", count: { $sum: 1 } } },
    ])
    .toArray();
  assert.equal(counted.count, 2, "confirmed and completed in the window count; pending, cancelled, earlier and other businesses' do not");

  const uncredited = await bookings.countDocuments({
    businessId,
    $or: [{ source: { $exists: false } }, { source: null }],
    status: { $in: CONFIRMED_STATUSES },
    ...window,
  });
  assert.equal(uncredited, 1, "a confirmed walk-in with no campaign is counted apart");

  // The one-request-per-chat lookup the create action runs before writing.
  assert.equal(await bookings.countDocuments({ businessId, messengerPsid: { $in: ["p2"] } }), 1, "a chat with a request is found, so a second needs staff to say so");
  assert.equal(await bookings.countDocuments({ businessId, messengerPsid: { $in: ["p9"] } }), 0);
  console.log("✓ confirmed bookings per campaign in the window; uncredited apart; a chat's existing request is found");
} finally {
  await bookings.deleteMany({ businessId: { $in: [businessId, `${businessId}-B`] } });
  await mongo.close();
}

console.log("✓ test records removed");
