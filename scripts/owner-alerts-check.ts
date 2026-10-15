/**
 * Owner text alerts rehearsal.
 *
 *   npm run alerts:check
 *
 * Part one proves the wording: every alert fits one plain SMS part, the
 * characters AEGIS uses on screen (the peso sign, the middle dot, curly
 * quotes) are swapped for ones SMS carries cheaply, and long names are cut
 * rather than split into a second billed part.
 *
 * Part two makes sure the indexes exist on the configured database, then
 * proves one event texts each person once. It writes only under a throwaway
 * business id and removes it.
 *
 * Not reached here: the DAL needs a signed-in session for most events, so
 * saving the settings and the alerts themselves are checked in the browser.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { OWNER_ALERT_INDEXES } from "@/lib/data/owner-alerts";
import {
  MAX_ALERT_CHARS,
  approvalNeededText,
  bookingText,
  fitSms,
  jobText,
  ownerAlertConfigOf,
  quoteAnsweredText,
  quoteSentText,
} from "@/lib/owner-alerts";
import { countSegments, toE164 } from "@/lib/text-blast";

// ---- Part one: wording --------------------------------------------------------

const samples = [
  quoteSentText("AUTOBLITZ", "QT-1004", "Juan Dela Cruz", 7_560_000),
  quoteAnsweredText("AUTOBLITZ", "QT-1004", "Partially Approved", "Juan Dela Cruz", 900_000),
  quoteAnsweredText("AUTOBLITZ", "QT-1004", "Declined", "", 0),
  approvalNeededText("AUTOBLITZ", "QT-1004", "It has a discount of ₱ 6,000.00 and 1 line priced below cost.", "Rosa Marin"),
  bookingText("AUTOBLITZ", "BK-8251", "Maria Santos", "Oct 16 · 09:00", "the booking page"),
  jobText("AUTOBLITZ", "JO-1001", "Completed", "Juan Dela Cruz"),
];
for (const body of samples) {
  const parts = countSegments(body);
  assert.equal(parts.unicode, false, `plain SMS characters only: ${body}`);
  assert.equal(parts.segments, 1, `one billed part: ${body}`);
}
assert.equal(samples[0], "AUTOBLITZ: QT-1004 sent to Juan Dela Cruz, PHP 75,600.00.");
assert.ok(samples[1].includes("partly approved") && samples[1].includes("PHP 9,000.00"));
assert.equal(samples[2], "AUTOBLITZ: The customer declined QT-1004.");
assert.ok(samples[3].includes("PHP 6,000.00"), "the peso sign becomes PHP");
assert.ok(samples[4].includes("Oct 16 - 09:00"), "the middle dot becomes a dash");

const long = fitSms(`AUTOBLITZ: ${"very long customer name ".repeat(12)}`);
assert.ok(countSegments(long).characters <= MAX_ALERT_CHARS && long.endsWith("..."), "long text is cut, not split");
assert.equal(fitSms("Juan 🚗 Cruz"), "Juan Cruz", "an emoji would triple the cost, so it goes");

assert.equal(toE164("0917 123 4567"), "+639171234567");
assert.equal(toE164("12345"), null, "only a Philippine mobile is texted");
assert.equal(ownerAlertConfigOf(undefined).enabled, false, "off until an admin switches it on");

console.log("✓ every alert is one plain SMS part; peso sign, dots and emoji handled; long text cut");

// ---- Part two: the database -------------------------------------------------

const mongo = await new MongoClient(process.env.MONGODB_URI!).connect();
const db = mongo.db(process.env.MONGODB_DB_NAME!);
const businessId = `ALERT-CHECK-${randomUUID().slice(0, 8)}`;

try {
  for (const index of OWNER_ALERT_INDEXES) {
    await db.collection(index.collection).createIndex(index.keys, index.options ?? {});
  }
  console.log(`✓ ${OWNER_ALERT_INDEXES.length} owner alert indexes present on ${process.env.MONGODB_DB_NAME}`);

  const alerts = db.collection("ownerAlerts");
  const one = { businessId, eventKey: "quote-answer:QT-1004:1:Approved", to: "+639171234567", status: "not-sent" };
  await alerts.insertOne({ ...one, createdAt: new Date() });
  await assert.rejects(
    alerts.insertOne({ ...one, createdAt: new Date() }),
    (error: { code?: number }) => error.code === 11000,
    "the same event cannot text the same person twice",
  );
  await alerts.insertOne({ ...one, to: "+639181234567", createdAt: new Date() });
  assert.equal(await alerts.countDocuments({ businessId }), 2, "but a second person gets their own");
  console.log("✓ one text per event per person");
} finally {
  await db.collection("ownerAlerts").deleteMany({ businessId });
  await mongo.close();
}

console.log("✓ test records removed");
