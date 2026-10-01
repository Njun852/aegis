"use server";

import { headers } from "next/headers";
import {
  HEARD_FROM,
  formatManila,
  isOfferableSlot,
  isPhilippineMobile,
  formatCode,
  isWellFormedCode,
  normaliseCode,
  slotStart,
  type OpenDay,
} from "@/lib/booking-slots";
import {
  createRequest,
  findBookableBusiness,
  findRequest,
  readOpenDays,
  type RequestLookup,
} from "@/lib/dal/public-booking";
import { allow } from "@/lib/rate-limit";

/**
 * The public booking page's actions. Anyone can call these, with anything, so
 * each one resolves the business from the page's own link, checks every field
 * against the same rules the page shows, and is rate limited per address.
 * Nothing here needs or reads a session.
 */

const TEN_MINUTES = 10 * 60_000;

/**
 * The visitor's address. The cloudflared tunnel sets `cf-connecting-ip`; a
 * reverse proxy sets `x-forwarded-for`. Behind neither, every visitor shares
 * one bucket, which errs towards refusing rather than allowing.
 */
async function visitor(): Promise<string> {
  const list = await headers();
  return (
    list.get("cf-connecting-ip") ??
    list.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

const LIMITS = {
  name: 80,
  make: 40,
  model: 40,
  plate: 12,
  service: 120,
  notes: 1000,
};

export interface SubmitState {
  error: string | null;
  /** Set on success, as shown to the customer: "AB7K-3Q9P". */
  code?: string;
  /** "Wed, Sep 30, 2026 · 9:00 AM" */
  when?: string;
  /** Fresh availability after a slot was taken, so the form can re-offer. */
  openDays?: OpenDay[];
}

export async function submitBookingRequestAction(
  slug: string,
  _previous: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const business = await findBookableBusiness(slug);
  if (!business) return { error: "Online booking isn't available right now." };

  const text = (key: string) => String(formData.get(key) ?? "").trim();

  // A field people never see. A form-filling bot fills it; say nothing useful.
  if (text("website")) return { error: "Your request could not be sent. Please try again." };

  if (!allow(`submit:${await visitor()}`, 5, TEN_MINUTES)) {
    return {
      error: "Several requests have come from this connection. Please wait a few minutes, or call us.",
    };
  }

  const name = text("name");
  const mobile = text("mobile");
  const heardFrom = text("heardFrom");
  const make = text("make");
  const model = text("model");
  const plate = text("plate").toUpperCase();
  const yearText = text("year");
  const service = text("service");
  const date = text("date");
  const hour = Number(text("hour"));
  const notes = text("notes");

  if (!name || !mobile || !heardFrom || !make || !model || !service || !date || !text("hour")) {
    return { error: "Please fill in every field marked with *." };
  }
  for (const [key, max] of Object.entries(LIMITS)) {
    if (text(key).length > max) {
      return { error: `That ${key === "notes" ? "note" : key} is too long. Please shorten it.` };
    }
  }
  if (!isPhilippineMobile(mobile)) {
    return { error: "Enter a Philippine mobile number, like 0917 123 4567." };
  }
  if (!HEARD_FROM.includes(heardFrom)) {
    return { error: "Please choose how you heard about us." };
  }

  let year: number | null = null;
  if (yearText) {
    year = Number(yearText);
    const latest = new Date().getFullYear() + 1;
    if (!Number.isInteger(year) || year < 1950 || year > latest) {
      return { error: `Year should be between 1950 and ${latest}, or left blank.` };
    }
  }

  const now = new Date();
  if (!isOfferableSlot(date, hour, now)) {
    return {
      error: "That time can't be booked. Please choose another.",
      openDays: await readOpenDays(business.businessId, now),
    };
  }

  const startsAt = slotStart(date, hour);
  const result = await createRequest(business.businessId, {
    name,
    mobile,
    heardFrom,
    make,
    model,
    plate,
    year,
    service,
    notes,
    startsAt,
  });

  if (!result.ok) {
    return {
      error: "That time was just taken. Please pick another.",
      openDays: await readOpenDays(business.businessId, now),
    };
  }

  return {
    error: null,
    code: formatCode(result.code),
    when: formatManila(startsAt),
  };
}

export interface RetrieveState {
  error: string | null;
  booking?: RequestLookup & { displayCode: string };
}

export async function retrieveBookingAction(
  slug: string,
  _previous: RetrieveState,
  formData: FormData,
): Promise<RetrieveState> {
  const business = await findBookableBusiness(slug);
  if (!business) return { error: "Online booking isn't available right now." };

  if (!allow(`retrieve:${await visitor()}`, 10, TEN_MINUTES)) {
    return { error: "Too many lookups from this connection. Please wait a few minutes." };
  }

  const code = normaliseCode(String(formData.get("code") ?? ""));
  const mobile = String(formData.get("mobile") ?? "").trim();

  // One message for every miss, so a lookup never reveals which half was wrong.
  const miss = {
    error: "We couldn't find a booking with that code and mobile number. Check both and try again.",
  };
  if (!isWellFormedCode(code) || !isPhilippineMobile(mobile)) return miss;

  const booking = await findRequest(business.businessId, code, mobile);
  if (!booking) return miss;
  return {
    error: null,
    booking: { ...booking, displayCode: formatCode(code) },
  };
}
