import "server-only";

import { randomInt } from "node:crypto";
import { cache } from "react";
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  SLOT_CAPACITY,
  SLOT_MINUTES,
  formatManila,
  openDays,
  type OpenDay,
} from "@/lib/booking-slots";
import { phoneKey } from "@/lib/crm";
import { vehicleLabel } from "@/lib/fleet";
import { businessesCollection, getDb } from "./db";
import { postEntryFor } from "./ledger";
import { isDuplicateKey } from "./refs";
import type { BookingDocument, BookingStatus } from "@/types";

/**
 * The public booking page's only way into the database.
 *
 * Nobody is signed in on this path, so there is no session for `tenantScope`
 * to read. Every function takes the business id explicitly, and that id only
 * ever comes from `findBookableBusiness`, which resolves it from the page's own
 * link. Nothing a visitor submits names a business, and nothing returned here
 * carries another customer's name, notes, value or contact details.
 */

async function bookingsCollection() {
  const db = await getDb();
  return db.collection<BookingDocument>("bookings");
}

/**
 * The business behind `/book/<slug>`, or null. Only an active business with
 * the page switched on and the Bookings module granted is bookable; any other
 * slug gets the same "not available" page, so the page cannot be used to learn
 * which businesses exist.
 */
export async function findBookableBusiness(
  slug: string,
): Promise<{ businessId: string; name: string } | null> {
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return null;
  const businesses = await businessesCollection();
  const doc = await businesses.findOne({
    "onlineBooking.slug": slug,
    "onlineBooking.enabled": true,
    modules: "bookings",
    status: "active",
  });
  return doc ? { businessId: doc.businessId, name: doc.name } : null;
}

/** `findBookableBusiness`, read once per request by the layout and page together. */
export const bookableBusiness = cache(findBookableBusiness);

/**
 * Which times are still free. Reads only each booking's start and status,
 * staff-made bookings included, so a slot filled by phone is not offered.
 */
export async function readOpenDays(businessId: string, now = new Date()): Promise<OpenDay[]> {
  const collection = await bookingsCollection();
  const docs = await collection
    .find(
      {
        businessId,
        status: { $ne: "Cancelled" },
        startsAt: { $gte: new Date(now.getTime() - 3_600_000), $lt: new Date(now.getTime() + 62 * 86_400_000) },
      },
      { projection: { _id: 0, startsAt: 1, status: 1 } },
    )
    .toArray();
  return openDays(now, docs);
}

function newCode(): string {
  let code = "";
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

export interface RequestInput {
  name: string;
  mobile: string;
  heardFrom: string;
  make: string;
  model: string;
  plate: string;
  year: number | null;
  service: string;
  notes: string;
  startsAt: Date;
}

export type CreateRequestResult =
  | { ok: true; code: string }
  | { ok: false; reason: "slot-full" };

/**
 * Writes one request as a Pending booking and posts its zero-value ledger
 * entry, as every booking has one.
 *
 * The slot is counted again immediately before the insert. Two submissions in
 * the same instant can still both pass that count, because the local Mongo is a
 * standalone with no transactions; the worst case is one booking over capacity
 * in a slot, which staff see and move when they confirm.
 */
export async function createRequest(
  businessId: string,
  input: RequestInput,
): Promise<CreateRequestResult> {
  const collection = await bookingsCollection();
  const slotEnd = new Date(input.startsAt.getTime() + SLOT_MINUTES * 60_000);
  const inSlot = await collection.countDocuments({
    businessId,
    status: { $ne: "Cancelled" },
    startsAt: { $gte: input.startsAt, $lt: slotEnd },
  });
  if (inSlot >= SLOT_CAPACITY) return { ok: false, reason: "slot-full" };

  for (let attempt = 0; attempt < 6; attempt += 1) {
    // The same max-plus-one allocation as `nextRef` in ./bookings.ts, scoped by
    // the explicit id instead of a session.
    const [latest] = await collection
      .find({ businessId }, { projection: { ref: 1 } })
      .sort({ ref: -1 })
      .limit(1)
      .toArray();
    const ref = `BK-${(latest ? Number(latest.ref.replace(/\D/g, "")) : 8240) + 1}`;
    const code = newCode();
    const now = new Date();

    try {
      await collection.insertOne({
        businessId,
        ref,
        customer: input.name,
        company: "",
        email: "",
        service: input.service,
        startsAt: input.startsAt,
        durationMinutes: SLOT_MINUTES,
        staff: "Unassigned",
        valueCents: 0,
        status: "Pending",
        channel: "Website form",
        notes: input.notes,
        request: {
          code,
          mobile: input.mobile,
          mobileKey: phoneKey(input.mobile),
          heardFrom: input.heardFrom,
          vehicle: {
            make: input.make,
            model: input.model,
            plate: input.plate,
            year: input.year,
          },
          submittedAt: now,
        },
        createdAt: now,
      });
    } catch (error) {
      // A lost race for the ref, or (very rarely) a repeated code: try again
      // with fresh ones.
      if (isDuplicateKey(error)) continue;
      throw error;
    }

    await postEntryFor(businessId, {
      source: "bookings",
      sourceRef: ref,
      occurredAt: input.startsAt,
      amountCents: 0,
      description: `${input.service} · ${input.name}`,
    });
    return { ok: true, code };
  }

  throw new Error("Could not allocate a booking reference; please retry.");
}

export interface RequestLookup {
  code: string;
  status: BookingStatus;
  service: string;
  /** "Wed, Sep 30, 2026 · 9:00 AM", Manila time. */
  when: string;
  vehicle: string;
  plate: string;
}

/**
 * A request, found only by its code and the mobile it was made with. Returns
 * what the customer needs to see about their own appointment and nothing else:
 * no name, notes or price.
 */
export async function findRequest(
  businessId: string,
  code: string,
  mobile: string,
): Promise<RequestLookup | null> {
  const mobileKey = phoneKey(mobile);
  if (!mobileKey) return null;
  const collection = await bookingsCollection();
  const doc = await collection.findOne({
    businessId,
    "request.code": code,
    "request.mobileKey": mobileKey,
  });
  if (!doc?.request) return null;
  return {
    code: doc.request.code,
    status: doc.status,
    service: doc.service,
    when: formatManila(doc.startsAt),
    vehicle: vehicleLabel(doc.request.vehicle),
    plate: doc.request.vehicle.plate,
  };
}
