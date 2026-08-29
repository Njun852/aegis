"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/dal/businesses";
import {
  createBooking,
  rescheduleBooking,
  setBookingStatus,
} from "@/lib/dal/bookings";
import { BOOKING_CHANNELS } from "@/lib/data/bookings";
import { parseCents } from "@/lib/format";
import type { BookingStatus } from "@/types";

export interface BookingFormState {
  error: string | null;
  createdRef?: string;
}

export async function createBookingAction(
  _previous: BookingFormState,
  formData: FormData,
): Promise<BookingFormState> {
  await requireModule("bookings");

  const text = (key: string) => String(formData.get(key) ?? "").trim();

  const customer = text("customer");
  const service = text("service");
  const startsAt = text("startsAt");
  const staff = text("staff");

  if (!customer || !service || !startsAt || !staff) {
    return { error: "Customer, service, date and assignee are all required." };
  }

  const when = new Date(startsAt);
  if (Number.isNaN(when.getTime())) {
    return { error: "That date and time could not be read." };
  }

  const durationMinutes = Number(text("durationMinutes"));
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return { error: "Duration must be a positive number of minutes." };
  }

  const valueCents = parseCents(text("valueCents"));
  if (valueCents === null) {
    return { error: "Value must be an amount like 240 or 240.00." };
  }

  const channel = text("channel");

  const booking = await createBooking({
    customer,
    company: text("company"),
    email: text("email"),
    service,
    startsAt: when.toISOString(),
    durationMinutes,
    staff,
    valueCents,
    channel: BOOKING_CHANNELS.includes(channel) ? channel : BOOKING_CHANNELS[0],
    notes: text("notes"),
  });

  revalidatePath("/bookings");
  return { error: null, createdRef: booking.ref };
}

export async function setBookingStatusAction(
  ref: string,
  status: BookingStatus,
): Promise<void> {
  await requireModule("bookings");
  await setBookingStatus(ref, status);
  revalidatePath("/bookings");
}

export async function rescheduleBookingAction(
  ref: string,
  startsAt: string,
  durationMinutes: number,
): Promise<void> {
  await requireModule("bookings");

  const when = new Date(startsAt);
  if (Number.isNaN(when.getTime())) {
    throw new Error("That date and time could not be read.");
  }
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error("Duration must be a positive number of minutes.");
  }

  await rescheduleBooking(ref, when.toISOString(), durationMinutes);
  revalidatePath("/bookings");
}
