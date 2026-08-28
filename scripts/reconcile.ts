/**
 * Checks the ledger against the bookings that should have produced it, and
 * repairs any drift.
 *
 *   npm run reconcile          report only, changes nothing
 *   npm run reconcile -- --fix apply the repairs
 *
 * Unlike `npm run seed`, this never writes to the bookings collection, so it is
 * safe to run against real data. Drift happens because the local Mongo is a
 * standalone: without multi-document transactions a booking and its ledger
 * entry cannot be written atomically, and a booking deleted straight from the
 * database leaves its entry behind.
 */
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME;

if (!uri || !dbName) {
  console.error("Missing MONGODB_URI or MONGODB_DB_NAME.");
  console.error("Run with: npm run reconcile");
  process.exit(1);
}

const apply = process.argv.includes("--fix");

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

async function main() {
  const client = await new MongoClient(uri!).connect();
  const db = client.db(dbName);

  try {
    const bookings = await db.collection("bookings").find({}).toArray();
    const entries = await db
      .collection("transactions")
      .find({ source: "bookings" })
      .toArray();

    const liveRefs = new Set(
      bookings.map((booking) => `${booking.businessId}:${booking.ref}`),
    );
    const entryRefs = new Set(
      entries.map((entry) => `${entry.businessId}:${entry.sourceRef}`),
    );

    // An entry whose booking is gone. Still counts toward revenue until voided.
    const orphans = entries.filter(
      (entry) =>
        !liveRefs.has(`${entry.businessId}:${entry.sourceRef}`) &&
        entry.status !== "void",
    );

    // A booking whose entry never got written.
    const missing = bookings.filter(
      (booking) => !entryRefs.has(`${booking.businessId}:${booking.ref}`),
    );

    // An entry that disagrees with its booking's amount or cancellation.
    const byRef = new Map(
      entries.map((entry) => [`${entry.businessId}:${entry.sourceRef}`, entry]),
    );
    const stale = bookings.filter((booking) => {
      const entry = byRef.get(`${booking.businessId}:${booking.ref}`);
      if (!entry) return false;
      const expected = booking.status === "Cancelled" ? "void" : "recognised";
      return (
        entry.status !== expected ||
        entry.amountCents !== booking.valueCents ||
        entry.occurredAt?.getTime() !== booking.startsAt?.getTime()
      );
    });

    console.log(`bookings: ${bookings.length}   ledger entries: ${entries.length}`);
    console.log("");

    const overstated = orphans.reduce(
      (total, entry) => total + entry.amountCents,
      0,
    );

    if (!orphans.length && !missing.length && !stale.length) {
      console.log("✓ ledger matches bookings — nothing to repair");
      return;
    }

    if (orphans.length) {
      console.log(
        `orphaned entries (booking deleted) — overstating revenue by ${money(overstated)}:`,
      );
      for (const entry of orphans) {
        console.log(`  ${entry.sourceRef}  ${money(entry.amountCents)}  ${entry.description}`);
      }
      console.log("");
    }

    if (missing.length) {
      console.log("bookings with no ledger entry:");
      for (const booking of missing) {
        console.log(`  ${booking.ref}  ${money(booking.valueCents)}  ${booking.status}`);
      }
      console.log("");
    }

    if (stale.length) {
      console.log("entries out of step with their booking:");
      for (const booking of stale) {
        console.log(`  ${booking.ref}  ${money(booking.valueCents)}  ${booking.status}`);
      }
      console.log("");
    }

    if (!apply) {
      console.log("run `npm run reconcile -- --fix` to repair");
      return;
    }

    const now = new Date();

    for (const entry of orphans) {
      await db
        .collection("transactions")
        .updateOne(
          { _id: entry._id },
          { $set: { status: "void", updatedAt: now } },
        );
    }

    for (const booking of [...missing, ...stale]) {
      await db.collection("transactions").updateOne(
        {
          businessId: booking.businessId,
          source: "bookings",
          sourceRef: booking.ref,
        },
        {
          $set: {
            occurredAt: booking.startsAt,
            amountCents: booking.valueCents,
            description: `${booking.service} · ${booking.customer}`,
            status: booking.status === "Cancelled" ? "void" : "recognised",
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true },
      );
    }

    console.log(
      `✓ repaired — ${orphans.length} voided, ${missing.length} posted, ${stale.length} corrected`,
    );
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
