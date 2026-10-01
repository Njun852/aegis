/**
 * CRM rehearsal.
 *
 *   npm run crm:check
 *
 * Part one proves the matching and the arithmetic: that one phone number typed
 * three ways is one key, and that booked value lands in the right month with
 * cancellations left out.
 *
 * Part two makes sure the CRM indexes exist on the configured database (a
 * no-op when they already do), then proves the duplicate lookup the New
 * customer form relies on finds a customer by either key and only within its
 * own business. It writes only under a throwaway business id and removes
 * everything it wrote.
 *
 * What this does not reach: the DAL functions need a signed-in session, so
 * linking bookings and the profile itself are checked in the browser.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { emailKey, monthlyBookedValue, phoneKey } from "@/lib/crm";
import { CRM_INDEXES } from "@/lib/data/crm";

// ---- Part one: matching and arithmetic --------------------------------------

assert.equal(phoneKey("0917 123 4567"), "09171234567");
assert.equal(phoneKey("+63 917 123 4567"), "09171234567");
assert.equal(phoneKey("639171234567"), "09171234567");
assert.equal(phoneKey("0917-123-4567"), phoneKey("+63 (917) 123 4567"));
assert.equal(phoneKey("(082) 221 0000"), "0822210000", "a landline keeps its own digits");
assert.equal(phoneKey(""), "", "no phone is no key, so blanks never match each other");
assert.equal(emailKey("  Juan@Example.COM "), "juan@example.com");

const today = new Date(2026, 8, 28, 12); // Sep 28, 2026
const at = (year: number, month: number, date: number) =>
  new Date(year, month - 1, date, 12).toISOString();

const months = monthlyBookedValue(
  [
    { startsAt: at(2026, 9, 1), valueCents: 10_000, status: "Completed" },
    { startsAt: at(2026, 9, 30), valueCents: 5_000, status: "Pending" },
    { startsAt: at(2026, 9, 15), valueCents: 99_999, status: "Cancelled" },
    { startsAt: at(2025, 10, 1), valueCents: 2_000, status: "Completed" },
    { startsAt: at(2025, 9, 30), valueCents: 7_000, status: "Completed" },
    { startsAt: at(2026, 11, 2), valueCents: 3_000, status: "Confirmed" },
  ],
  today,
);

assert.equal(months.length, 12, "always twelve months, empty ones included");
assert.equal(months[0].key, "2025-10", "oldest first, starting eleven months back");
assert.equal(months[11].key, "2026-09", "ending with the current month");
assert.equal(months[11].valueCents, 15_000, "a month's bookings add up; cancelled ones do not");
assert.equal(months[0].valueCents, 2_000);
assert.equal(
  months.reduce((sum, month) => sum + month.valueCents, 0),
  17_000,
  "bookings outside the twelve months, before or after, are left out",
);

console.log("✓ phone and email keys, monthly booked value");

// ---- Part two: the database -------------------------------------------------

const mongo = await new MongoClient(process.env.MONGODB_URI!).connect();
const db = mongo.db(process.env.MONGODB_DB_NAME!);
const businessId = `CRM-CHECK-${randomUUID().slice(0, 8)}`;
const otherBusinessId = `${businessId}-B`;

try {
  for (const index of CRM_INDEXES) {
    await db.collection(index.collection).createIndex(index.keys);
  }
  console.log(`✓ ${CRM_INDEXES.length} crm indexes present on ${process.env.MONGODB_DB_NAME}`);

  const customers = db.collection("customers");
  const base = { notes: "", company: "", createdAt: new Date() };
  await customers.insertMany([
    { ...base, businessId, ref: "CU-1", name: "Juan", phone: "0917 123 4567", phoneKey: phoneKey("0917 123 4567"), email: "", emailKey: "" },
    { ...base, businessId, ref: "CU-2", name: "Ana", phone: "", phoneKey: "", email: "Ana@Example.com", emailKey: emailKey("Ana@Example.com") },
    { ...base, businessId: otherBusinessId, ref: "CU-1", name: "Elsewhere", phone: "0917 123 4567", phoneKey: "09171234567", email: "", emailKey: "" },
  ]);

  // The same query `findDuplicates` runs, scoped the way `tenantScope` scopes it.
  const lookup = (phone: string, email: string) => {
    const either = [
      ...(phoneKey(phone) ? [{ phoneKey: phoneKey(phone) }] : []),
      ...(emailKey(email) ? [{ emailKey: emailKey(email) }] : []),
    ];
    return customers.find({ $or: either, businessId }).toArray();
  };

  assert.deepEqual((await lookup("+63 917 123 4567", "")).map((doc) => doc.ref), ["CU-1"]);
  assert.deepEqual((await lookup("", "ana@example.com")).map((doc) => doc.ref), ["CU-2"]);
  assert.equal((await lookup("0999 000 0000", "nobody@example.com")).length, 0);
  console.log("✓ duplicates found by either key, and only within the business");
} finally {
  await db.collection("customers").deleteMany({ businessId: { $in: [businessId, otherBusinessId] } });
  await mongo.close();
}

console.log("✓ test records removed");
