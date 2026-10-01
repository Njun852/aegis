import "server-only";

import { formatDay, formatDuration, formatTimeRange } from "@/lib/bookings";
import { dateKeyOf } from "@/lib/booking-calendar";
import { syncBookingService } from "./fleet";
import { postEntry, setEntryStatus } from "./ledger";
import { tenantScope } from "./tenant";
import { verifySession } from "./session";
import type {
  Booking,
  BookingDocument,
  BookingInput,
  BookingStatus,
} from "@/types";

const COLLECTION = "bookings";

/**
 * Bookings are tenant-owned, so every call here goes through `tenantScope` —
 * the wrapper merges the active business into the filter and stamps it onto
 * inserts, which is what keeps one business out of another's book.
 */
async function bookings() {
  return tenantScope<BookingDocument>(COLLECTION);
}

/**
 * Display strings are derived once, here on the server. Deriving them in the
 * client instead would format against the visitor's timezone and mismatch the
 * server-rendered HTML.
 */
function toBooking(doc: BookingDocument): Booking {
  return {
    ref: doc.ref,
    businessId: doc.businessId,
    customer: doc.customer,
    company: doc.company,
    email: doc.email,
    service: doc.service,
    startsAt: doc.startsAt.toISOString(),
    durationMinutes: doc.durationMinutes,
    dateKey: dateKeyOf(doc.startsAt),
    day: formatDay(doc.startsAt),
    time: formatTimeRange(doc.startsAt, doc.durationMinutes),
    duration: formatDuration(doc.durationMinutes),
    staff: doc.staff,
    valueCents: doc.valueCents,
    status: doc.status,
    channel: doc.channel,
    notes: doc.notes,
    vehicleRef: doc.vehicleRef ?? null,
    customerRef: doc.customerRef ?? null,
    // The stored lookup key and timestamp stay on the server.
    request: doc.request
      ? {
          code: doc.request.code,
          mobile: doc.request.mobile,
          heardFrom: doc.request.heardFrom,
          vehicle: doc.request.vehicle,
        }
      : null,
  };
}

/**
 * The whole book for the active business. Filtering by range, status and search
 * happens in the client so typing in the search box does not round-trip; the
 * tenant boundary is enforced here, which is the part that must not be client
 * side.
 */
export async function listBookings(): Promise<Booking[]> {
  const collection = await bookings();
  const docs = await collection.find().sort({ startsAt: 1 }).toArray();
  return docs.map(toBooking);
}

/** Raw documents, for the ledger reconciler. Still tenant-scoped. */
export async function listBookingDocuments(): Promise<BookingDocument[]> {
  const collection = await bookings();
  return collection.find().sort({ startsAt: 1 }).toArray();
}

/**
 * Mirrors one booking into the ledger. Revenue is recognised at creation, so a
 * booking posts as soon as it exists; only a cancellation voids it.
 */
async function syncLedger(booking: Booking): Promise<void> {
  await postEntry({
    source: "bookings",
    sourceRef: booking.ref,
    occurredAt: new Date(booking.startsAt),
    amountCents: booking.valueCents,
    description: `${booking.service} · ${booking.customer}`,
    status: booking.status === "Cancelled" ? "void" : "recognised",
  });
}

export async function getBooking(ref: string): Promise<Booking | null> {
  const collection = await bookings();
  const doc = await collection.findOne({ ref });
  return doc ? toBooking(doc) : null;
}

/**
 * Refs are per-business and sequential. Two simultaneous creates could race for
 * the same number; the unique index on `{ businessId, ref }` turns that into a
 * write error rather than a duplicate, and this retries.
 */
async function nextRef(): Promise<string> {
  const collection = await bookings();
  const [latest] = await collection
    .find()
    .sort({ ref: -1 })
    .limit(1)
    .toArray();

  const current = latest ? Number(latest.ref.replace(/\D/g, "")) : 8240;
  return `BK-${current + 1}`;
}

export async function createBooking(input: BookingInput): Promise<Booking> {
  const collection = await bookings();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const ref = await nextRef();
    try {
      await collection.insertOne({
        ref,
        customer: input.customer,
        company: input.company,
        email: input.email,
        service: input.service,
        startsAt: new Date(input.startsAt),
        durationMinutes: input.durationMinutes,
        staff: input.staff,
        valueCents: input.valueCents,
        // New bookings start unconfirmed; staff confirm from the drawer.
        status: "Pending",
        channel: input.channel,
        notes: input.notes,
        ...(input.vehicleRef ? { vehicleRef: input.vehicleRef } : {}),
        ...(input.customerRef ? { customerRef: input.customerRef } : {}),
        createdAt: new Date(),
      });

      const created = await getBooking(ref);
      // The insert succeeded, so a missing read is a fault to surface, not a
      // reason to loop — retrying here would insert the booking a second time
      // under the next ref.
      if (!created) {
        throw new Error(`Booking ${ref} was written but could not be read back.`);
      }

      await syncLedger(created);
      return created;
    } catch (error) {
      const duplicate =
        typeof error === "object" &&
        error !== null &&
        (error as { code?: number }).code === 11000;
      if (!duplicate) throw error;
      // Someone else took this ref — loop and take the next one.
    }
  }

  throw new Error("Could not allocate a booking reference; please retry.");
}

/** One customer's bookings, newest first, for the CRM profile. */
export async function listBookingsForCustomer(customerRef: string): Promise<Booking[]> {
  const collection = await bookings();
  const docs = await collection.find({ customerRef }).sort({ startsAt: -1 }).toArray();
  return docs.map(toBooking);
}

export interface CustomerBookingTotals {
  bookingCount: number;
  bookedValueCents: number;
  lastActivityAt: Date | null;
  lastVisitAt: Date | null;
}

/**
 * What each customer's linked bookings add up to, for the CRM list. A cancelled
 * booking still counts as a booking but adds no value and is not activity: it
 * did not happen.
 */
export async function totalBookingsByCustomer(): Promise<Map<string, CustomerBookingTotals>> {
  const collection = await bookings();
  const rows = await collection
    .aggregate([
      { $match: { customerRef: { $type: "string" } } },
      {
        $group: {
          _id: "$customerRef",
          bookingCount: { $sum: 1 },
          bookedValueCents: {
            $sum: { $cond: [{ $eq: ["$status", "Cancelled"] }, 0, "$valueCents"] },
          },
          lastActivityAt: {
            $max: { $cond: [{ $eq: ["$status", "Cancelled"] }, null, "$startsAt"] },
          },
          lastVisitAt: {
            $max: { $cond: [{ $eq: ["$status", "Completed"] }, "$startsAt", null] },
          },
        },
      },
    ])
    .toArray();

  return new Map(
    rows.map((row) => [
      String(row._id),
      {
        bookingCount: Number(row.bookingCount),
        bookedValueCents: Number(row.bookedValueCents),
        lastActivityAt: row.lastActivityAt ?? null,
        lastVisitAt: row.lastVisitAt ?? null,
      },
    ]),
  );
}

/**
 * Who does the work, what it is worth and how long it takes. Online requests
 * arrive unassigned at zero, so staff set these when they review one; the
 * ledger entry follows the new value.
 */
export async function updateBookingDetails(
  ref: string,
  details: { staff: string; valueCents: number; durationMinutes: number },
): Promise<void> {
  const collection = await bookings();
  const result = await collection.updateOne({ ref }, { $set: details });
  if (result.matchedCount === 0) throw new Error(`Booking ${ref} is no longer on file.`);
  const updated = await getBooking(ref);
  if (updated) await syncLedger(updated);
}

/**
 * Attaches a vehicle to a booking after the fact, for an online request whose
 * car staff have just added to Fleet. A completed booking gets its history
 * line at once.
 */
export async function linkBookingVehicle(ref: string, vehicleRef: string): Promise<void> {
  const collection = await bookings();
  const result = await collection.updateOne({ ref }, { $set: { vehicleRef } });
  if (result.matchedCount === 0) throw new Error(`Booking ${ref} is no longer on file.`);
  const linked = await getBooking(ref);
  if (linked) await syncBookingService(linked);
}

/** Sets or clears which customer a booking belongs to. */
export async function linkBookingCustomer(
  ref: string,
  customerRef: string | null,
): Promise<void> {
  const collection = await bookings();
  const result = await collection.updateOne(
    { ref },
    customerRef ? { $set: { customerRef } } : { $unset: { customerRef: "" } },
  );
  if (result.matchedCount === 0) throw new Error(`Booking ${ref} is no longer on file.`);
}

export async function setBookingStatus(
  ref: string,
  status: BookingStatus,
): Promise<void> {
  const collection = await bookings();
  await collection.updateOne({ ref }, { $set: { status } });

  // Cancelling voids the sale; every other status still counts as recognised.
  await setEntryStatus(
    "bookings",
    ref,
    status === "Cancelled" ? "void" : "recognised",
  );

  // Completing a booking for a vehicle writes its service history line;
  // moving it off Completed takes the line away again.
  const changed = await getBooking(ref);
  if (changed) await syncBookingService(changed);
}

export async function rescheduleBooking(
  ref: string,
  startsAt: string,
  durationMinutes: number,
): Promise<void> {
  const collection = await bookings();
  await collection.updateOne(
    { ref },
    { $set: { startsAt: new Date(startsAt), durationMinutes } },
  );

  // Moving the appointment moves which period the revenue belongs to.
  const moved = await getBooking(ref);
  if (moved) {
    await syncLedger(moved);
    // A completed booking's history line is dated by the booking, so it moves too.
    await syncBookingService(moved);
  }
}

/** Which business the current request is scoped to — handy for page headers. */
export async function activeBusinessId(): Promise<string> {
  const { activeBusinessId: id } = await verifySession();
  return id;
}
