import "server-only";

import { tenantScope } from "./tenant";
import type {
  LedgerEntryDocument,
  LedgerSource,
  RevenueMonthBucket,
} from "@/types";

const COLLECTION = "transactions";

async function ledger() {
  return tenantScope<LedgerEntryDocument>(COLLECTION);
}

/**
 * Posting is an upsert keyed on `(source, sourceRef)`, which makes it safe to
 * call more than once for the same booking.
 *
 * That matters here: the local Mongo is a standalone, so there are no
 * multi-document transactions and a booking and its ledger entry cannot be
 * written atomically. The booking is the system of record; this entry is
 * derived from it, and `reconcileBookings` below repairs any entry that failed
 * to post.
 */
export async function postEntry(entry: {
  source: LedgerSource;
  sourceRef: string;
  occurredAt: Date;
  amountCents: number;
  description: string;
  status?: LedgerEntryDocument["status"];
}): Promise<void> {
  const collection = await ledger();
  const now = new Date();

  await collection.updateOne(
    { source: entry.source, sourceRef: entry.sourceRef },
    {
      $set: {
        occurredAt: entry.occurredAt,
        amountCents: entry.amountCents,
        description: entry.description,
        status: entry.status ?? "recognised",
        updatedAt: now,
      },
      // businessId, source and sourceRef are equality terms in the filter, so
      // Mongo seeds them onto an inserted document itself — repeating them here
      // would be a conflicting update path.
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
}

/** Voids rather than deletes, so the cancellation stays visible in the ledger. */
export async function setEntryStatus(
  source: LedgerSource,
  sourceRef: string,
  status: LedgerEntryDocument["status"],
): Promise<void> {
  const collection = await ledger();
  await collection.updateOne(
    { source, sourceRef },
    { $set: { status, updatedAt: new Date() } },
  );
}

/** Recognised revenue in a half-open window `[from, to)`. */
export async function revenueBetween(from: Date, to: Date): Promise<number> {
  const collection = await ledger();
  const [result] = await collection
    .aggregate([
      {
        $match: {
          status: "recognised",
          occurredAt: { $gte: from, $lt: to },
        },
      },
      { $group: { _id: null, total: { $sum: "$amountCents" } } },
    ])
    .toArray();

  return (result?.total as number | undefined) ?? 0;
}

/**
 * Recognised revenue bucketed by calendar month. One round trip answers every
 * range the dashboard offers, since all of them are month-aligned.
 */
export async function revenueByMonth(
  from: Date,
  to: Date,
): Promise<RevenueMonthBucket[]> {
  const collection = await ledger();
  const rows = await collection
    .aggregate([
      {
        $match: {
          status: "recognised",
          occurredAt: { $gte: from, $lt: to },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$occurredAt" },
            month: { $month: "$occurredAt" },
          },
          total: { $sum: "$amountCents" },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ])
    .toArray();

  return rows.map((row) => {
    const { year, month } = row._id as { year: number; month: number };
    const date = new Date(year, month - 1, 1);
    return {
      monthIso: date.toISOString(),
      label: date.toLocaleDateString("en-US", { month: "short" }),
      totalCents: row.total as number,
    };
  });
}

export interface ReconcileReport {
  bookings: number;
  /** Entries created or brought back in line with their booking. */
  posted: number;
  /** Entries whose booking no longer exists, so they were voided. */
  orphansVoided: number;
}

/**
 * Rebuilds ledger entries from the bookings that should have produced them,
 * and voids entries whose booking is gone.
 *
 * Both halves matter. Posting repairs an entry that failed to write; voiding
 * orphans catches the opposite drift — a booking deleted straight from the
 * database leaves an entry behind that would keep counting toward revenue for
 * ever. Orphans are voided rather than deleted so the record stays auditable.
 */
export async function reconcileBookings(): Promise<ReconcileReport> {
  const { listBookingDocuments } = await import("./bookings");
  const bookings = await listBookingDocuments();
  const collection = await ledger();

  for (const booking of bookings) {
    await postEntry({
      source: "bookings",
      sourceRef: booking.ref,
      occurredAt: booking.startsAt,
      amountCents: booking.valueCents,
      description: `${booking.service} · ${booking.customer}`,
      status: booking.status === "Cancelled" ? "void" : "recognised",
    });
  }

  const live = new Set(bookings.map((booking) => booking.ref));
  const entries = await collection.find({ source: "bookings" }).toArray();
  const orphans = entries.filter(
    (entry) => !live.has(entry.sourceRef) && entry.status !== "void",
  );

  for (const orphan of orphans) {
    await setEntryStatus("bookings", orphan.sourceRef, "void");
  }

  return {
    bookings: bookings.length,
    posted: bookings.length,
    orphansVoided: orphans.length,
  };
}
