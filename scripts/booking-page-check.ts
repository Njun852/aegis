/**
 * Public booking page rehearsal.
 *
 *   npm run booking:check                         # against http://localhost:3000
 *   npm run booking:check -- https://your-tunnel.example
 *
 * Part one proves the slot rules on fixed instants: Sundays closed, started
 * slots gone, 4pm the last start, the 60-day edge, two to a slot with
 * cancellations not counting, and Manila time whatever this machine's
 * timezone. Also the code alphabet and the mobile check.
 *
 * Part two makes sure the page's indexes exist (a no-op when they do), then
 * proves codes and links cannot repeat, using throwaway ids it removes.
 *
 * Part three asks the running server, with no session cookie, for an unknown
 * booking link and for a signed-in screen, to prove the page is public and the
 * app is not. It is skipped, and says so, when no server is answering.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import {
  CODE_ALPHABET,
  bookingWindow,
  formatCode,
  isOfferableSlot,
  isPhilippineMobile,
  isWellFormedCode,
  manilaDateKey,
  normaliseCode,
  openDays,
  slotStart,
} from "@/lib/booking-slots";
import { BOOKING_PAGE_INDEXES } from "@/lib/data/booking-page";

// ---- Part one: the rules ----------------------------------------------------

// Wed Sep 30, 2026, 10:30 in Manila (02:30 UTC).
const now = new Date("2026-09-30T10:30:00+08:00");

assert.equal(manilaDateKey(new Date("2026-09-30T23:30:00+08:00")), "2026-09-30", "late evening stays the same Manila day");
assert.equal(manilaDateKey(new Date("2026-09-30T16:30:00Z")), "2026-10-01", "00:30 Manila is the next day");
assert.equal(slotStart("2026-10-01", 9).toISOString(), "2026-10-01T01:00:00.000Z", "9am Manila is 01:00 UTC");

const empty = openDays(now, []);
assert.equal(empty[0].date, "2026-09-30", "today is offered while slots remain");
assert.deepEqual(empty[0].hours, [11, 12, 13, 14, 15, 16], "slots already started are gone; 4pm is the last start");
assert.ok(!empty.some((day) => day.date === "2026-10-04"), "Sunday Oct 4 is closed");
assert.ok(empty.some((day) => day.date === "2026-10-03"), "Saturday is open");
assert.deepEqual(empty[1].hours, [8, 9, 10, 11, 12, 13, 14, 15, 16], "a whole day has nine starts");

const { min, max } = bookingWindow(now);
assert.equal(min, "2026-09-30");
assert.equal(max, "2026-11-28", "sixty days including today");
assert.ok(empty.every((day) => day.date <= max));
assert.ok(isOfferableSlot("2026-11-28", 9, now), "the last day is bookable (a Saturday)");
assert.ok(!isOfferableSlot("2026-11-30", 9, now), "a day past the window is not");
assert.ok(!isOfferableSlot("2026-10-04", 9, now), "Sunday is not");
assert.ok(!isOfferableSlot("2026-09-30", 10, now), "a slot that has started is not");
assert.ok(!isOfferableSlot("2026-10-01", 17, now), "5pm is not a start");
assert.ok(!isOfferableSlot("2026-10-01", 7, now), "7am is not a start");
assert.ok(!isOfferableSlot("not-a-date", 9, now));

const nine = slotStart("2026-10-01", 9);
const oneIn = openDays(now, [{ startsAt: nine, status: "Pending" }]);
assert.ok(oneIn[1].hours.includes(9), "one booking leaves room");
const twoIn = openDays(now, [
  { startsAt: nine, status: "Pending" },
  { startsAt: new Date(nine.getTime() + 30 * 60_000), status: "Confirmed" },
]);
assert.ok(!twoIn[1].hours.includes(9), "two bookings fill a slot, a 9:30 staff booking included");
const cancelled = openDays(now, [
  { startsAt: nine, status: "Pending" },
  { startsAt: nine, status: "Cancelled" },
]);
assert.ok(cancelled[1].hours.includes(9), "a cancelled booking does not hold a place");

assert.ok(isPhilippineMobile("0917 123 4567"));
assert.ok(isPhilippineMobile("+63 917 123 4567"));
assert.ok(!isPhilippineMobile("(082) 221 0000"), "a landline is not a mobile");
assert.ok(!isPhilippineMobile("0917 123 456"), "too short");

assert.ok(!/[01OI]/.test(CODE_ALPHABET), "no characters people misread");
assert.equal(formatCode("AB7K3Q9P"), "AB7K-3Q9P");
assert.equal(normaliseCode(" ab7k-3q9p "), "AB7K3Q9P");
assert.ok(isWellFormedCode("AB7K3Q9P"));
assert.ok(!isWellFormedCode("AB7K3Q9O"), "O is not in the alphabet");
assert.ok(!isWellFormedCode("AB7K3Q9"), "seven characters is not a code");

console.log("✓ slots: Manila time, Sundays, started slots, 4pm last start, 60 days, capacity");
console.log("✓ mobile check and booking codes");

// ---- Part two: the database -------------------------------------------------

const mongo = await new MongoClient(process.env.MONGODB_URI!).connect();
const db = mongo.db(process.env.MONGODB_DB_NAME!);
const businessId = `BOOKING-CHECK-${randomUUID().slice(0, 8)}`;
const slug = `check-${randomUUID().slice(0, 8)}`;
const isDuplicate = (error: unknown) => (error as { code?: number })?.code === 11000;

try {
  for (const index of BOOKING_PAGE_INDEXES) {
    await db.collection(index.collection).createIndex(index.keys, index.options);
  }
  console.log(`✓ ${BOOKING_PAGE_INDEXES.length} booking page indexes present on ${process.env.MONGODB_DB_NAME}`);

  const bookings = db.collection("bookings");
  const base = { businessId, status: "Pending", startsAt: nine, createdAt: new Date() };
  await bookings.insertOne({ ...base, ref: "BK-CHECK-1", request: { code: "AAAA2222" } });
  await assert.rejects(
    bookings.insertOne({ ...base, ref: "BK-CHECK-2", request: { code: "AAAA2222" } }),
    isDuplicate,
    "two requests at one business cannot share a code",
  );
  await bookings.insertOne({ ...base, ref: "BK-CHECK-3" });
  await bookings.insertOne({ ...base, ref: "BK-CHECK-4" });
  console.log("✓ a code is used once per business; bookings made in the app are not held to it");

  const businesses = db.collection("businesses");
  await businesses.insertOne({ businessId, name: "Check A", onlineBooking: { enabled: false, slug } });
  await assert.rejects(
    businesses.insertOne({ businessId: `${businessId}-B`, name: "Check B", onlineBooking: { enabled: false, slug } }),
    isDuplicate,
    "two businesses cannot share a link",
  );
  console.log("✓ one business per booking link");
} finally {
  await db.collection("bookings").deleteMany({ businessId });
  await db.collection("businesses").deleteMany({ businessId: { $in: [businessId, `${businessId}-B`] } });
  await mongo.close();
}
console.log("✓ test records removed");

// ---- Part three: the running server -----------------------------------------

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
let reachable = true;
try {
  await fetch(`${base}/login`, { redirect: "manual" });
} catch {
  reachable = false;
}

if (!reachable) {
  console.log(`– server checks skipped: nothing answering at ${base}`);
} else {
  const page = await fetch(`${base}/book/${slug}`, { redirect: "manual" });
  assert.equal(page.status, 200, "the booking page answers without a session instead of redirecting to login");
  const html = await page.text();
  assert.ok(html.includes("Online booking isn"), "an unknown or closed link reads as unavailable");

  const app = await fetch(`${base}/bookings`, { redirect: "manual" });
  assert.ok([302, 303, 307, 308].includes(app.status), "a signed-in screen still redirects without a session");
  assert.ok((app.headers.get("location") ?? "").includes("/login"));

  const lookalike = await fetch(`${base}/bookings-public`, { redirect: "manual" });
  assert.notEqual(lookalike.status, 200, "only /book/ is public, not paths that merely start with 'book'");

  console.log(`✓ server at ${base}: /book/<link> is public, the app is not`);
}
