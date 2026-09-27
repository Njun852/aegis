/**
 * Fleet rehearsal.
 *
 *   npm run fleet:check
 *
 * Part one proves the due rules on fixed dates and readings, at the edges
 * where an off-by-one would put a car in the wrong list: exactly 30 days out,
 * exactly 500 km left, a month end that does not exist six months later.
 *
 * Part two makes sure the Fleet indexes exist on the configured database (a
 * no-op when they already do), then proves the guarantees the screens lean on:
 * one car per plate whatever its spelling, and one history line per booking.
 * It writes only under a throwaway business id and removes everything it wrote.
 *
 * What this does not reach: the DAL functions themselves need a signed-in
 * session, so booking-to-history sync and the odometer refusal are checked in
 * the browser.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import {
  addMonths,
  computeDue,
  describeDays,
  parseWholeNumber,
  plateKey,
} from "@/lib/fleet";
import { FLEET_INDEXES } from "@/lib/data/fleet";

// ---- Part one: the rules ----------------------------------------------------

const day = (year: number, month: number, date: number) => new Date(year, month - 1, date, 12);
const sameDate = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

assert.ok(sameDate(addMonths(day(2026, 8, 31), 6), day(2027, 2, 28)), "Aug 31 + 6 months is Feb 28");
assert.ok(sameDate(addMonths(day(2027, 8, 31), 6), day(2028, 2, 29)), "…or Feb 29 in a leap year");
assert.ok(sameDate(addMonths(day(2026, 1, 15), 12), day(2027, 1, 15)), "a year is twelve months");

const schedule = { intervalMonths: 6, intervalKm: 5000 };

const none = computeDue(
  { lastServiceAt: null, lastServiceKm: null, currentKm: 30000, ...schedule },
  day(2026, 9, 26),
);
assert.equal(none.status, "No service on record");
assert.equal(none.dueAt, null);

// Last service Mar 1, 2026, so due Sep 1, 2026.
const byDate = (today: Date) =>
  computeDue({ lastServiceAt: day(2026, 3, 1), lastServiceKm: null, currentKm: null, ...schedule }, today);

assert.equal(byDate(day(2026, 9, 26)).status, "Overdue");
assert.equal(byDate(day(2026, 9, 26)).daysLeft, -25);
assert.equal(byDate(day(2026, 9, 1)).status, "Due soon", "due today is due, not overdue");
assert.equal(byDate(day(2026, 9, 1)).daysLeft, 0);
assert.equal(byDate(day(2026, 8, 2)).status, "Due soon", "30 days out is due soon");
assert.equal(byDate(day(2026, 8, 1)).status, "OK", "31 days out is fine");
assert.equal(byDate(day(2026, 8, 1)).dueKm, null, "no reading at the service, no km basis");
assert.equal(byDate(day(2026, 8, 1)).kmLeft, null);

// Date comfortably fine; the km basis decides.
const byKm = (currentKm: number | null) =>
  computeDue({ lastServiceAt: day(2026, 9, 1), lastServiceKm: 40000, currentKm, ...schedule }, day(2026, 9, 10));

assert.equal(byKm(44499).status, "OK");
assert.equal(byKm(44499).kmLeft, 501);
assert.equal(byKm(44500).status, "Due soon", "500 km left is due soon");
assert.equal(byKm(45000).status, "Due soon", "at the due reading is due, not overdue");
assert.equal(byKm(45001).status, "Overdue", "past the km is overdue even inside the months");
assert.equal(byKm(null).dueKm, 45000, "the due reading is known from the service alone…");
assert.equal(byKm(null).kmLeft, null, "…but not how close the car is without a current one");
assert.equal(byKm(null).status, "OK", "and a missing reading never makes a car look due");

assert.equal(plateKey("abc-1234"), plateKey("ABC 1234"));
assert.equal(plateKey(" a b c 1 2 3 4 "), "ABC1234");
assert.equal(plateKey("—"), "");

assert.equal(parseWholeNumber("45,200"), 45200);
assert.equal(parseWholeNumber("45200 km"), 45200);
assert.equal(parseWholeNumber(""), null);
assert.equal(parseWholeNumber("4.5"), undefined);
assert.equal(parseWholeNumber("-3"), undefined);

assert.equal(describeDays(0), "today");
assert.equal(describeDays(1), "in 1 day");
assert.equal(describeDays(-9), "9 days ago");

console.log("✓ due rules: month ends, the 30-day and 500 km edges, missing readings");

// ---- Part two: the database guarantees --------------------------------------

const mongo = await new MongoClient(process.env.MONGODB_URI!).connect();
const db = mongo.db(process.env.MONGODB_DB_NAME!);
const businessId = `FLEET-CHECK-${randomUUID().slice(0, 8)}`;

const isDuplicate = (error: unknown) => (error as { code?: number })?.code === 11000;

try {
  for (const index of FLEET_INDEXES) {
    await db.collection(index.collection).createIndex(index.keys, index.options ?? {});
  }
  console.log(`✓ ${FLEET_INDEXES.length} fleet indexes present on ${process.env.MONGODB_DB_NAME}`);

  const vehicles = db.collection("vehicles");
  const base = { businessId, customerRef: "CU-1", make: "Test", model: "Check", createdAt: new Date() };

  await vehicles.insertOne({ ...base, ref: "VH-1", plate: "ABC 1234", plateKey: plateKey("ABC 1234") });
  await assert.rejects(
    vehicles.insertOne({ ...base, ref: "VH-2", plate: "abc-1234", plateKey: plateKey("abc-1234") }),
    isDuplicate,
    "a second spelling of a plate must be refused",
  );
  await assert.rejects(
    vehicles.insertOne({ ...base, ref: "VH-1", plate: "XYZ 1", plateKey: "XYZ1" }),
    isDuplicate,
    "a ref is used once",
  );
  // The same plate at another business is a different car.
  await vehicles.insertOne({ ...base, businessId: `${businessId}-B`, ref: "VH-1", plate: "ABC 1234", plateKey: "ABC1234" });
  console.log("✓ one car per plate per business, whatever the spelling");

  const records = db.collection("serviceRecords");
  const record = { businessId, vehicleRef: "VH-1", performedAt: new Date(), odometerKm: null, work: "Check", createdAt: new Date() };

  await records.insertOne({ ...record, ref: "SR-1", source: "booking", bookingRef: "BK-1" });
  await assert.rejects(
    records.insertOne({ ...record, ref: "SR-2", source: "booking", bookingRef: "BK-1" }),
    isDuplicate,
    "a booking gives one history line",
  );
  await records.insertOne({ ...record, ref: "SR-3", source: "manual" });
  await records.insertOne({ ...record, ref: "SR-4", source: "manual" });
  console.log("✓ one history line per booking; manual lines are not held to it");
} finally {
  await db.collection("vehicles").deleteMany({ businessId: { $in: [businessId, `${businessId}-B`] } });
  await db.collection("serviceRecords").deleteMany({ businessId });
  await mongo.close();
}

console.log("✓ test records removed");
