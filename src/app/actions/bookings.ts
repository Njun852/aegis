"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/dal/businesses";
import {
  assertPlateFree,
  createVehicle,
  findVehicleOption,
} from "@/lib/dal/fleet";
import { createCustomer, findCustomer } from "@/lib/dal/customers";
import {
  createBooking,
  getBooking,
  linkBookingCustomer,
  linkBookingVehicle,
  rescheduleBooking,
  setBookingStatus,
  updateBookingDetails,
} from "@/lib/dal/bookings";
import { InputError } from "@/lib/dal/refs";
import { DEFAULT_INTERVAL_KM, DEFAULT_INTERVAL_MONTHS } from "@/lib/fleet";
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
  const business = await requireModule("bookings");

  const text = (key: string) => String(formData.get(key) ?? "").trim();

  // Checked against this business's vehicles rather than trusted from the
  // form, like the campaign below: completing the booking writes that car's
  // service history.
  const vehicleRef = text("vehicleRef");
  let vehicle: Awaited<ReturnType<typeof findVehicleOption>> = null;
  if (vehicleRef) {
    if (!business.modules.includes("fleet")) {
      return { error: "Fleet is not enabled for this business, so a vehicle cannot be attached." };
    }
    vehicle = await findVehicleOption(vehicleRef);
    if (!vehicle) {
      return { error: "That vehicle is no longer on file. Choose it again." };
    }
  }

  // Who the booking belongs to. A car decides it: a booking for a vehicle is
  // its owner's, and a different customer picked alongside it is a mistake.
  const crm = business.modules.includes("crm");
  const pickedRef = text("customerRef");
  let linked: Awaited<ReturnType<typeof findCustomer>> = null;
  if (vehicle) {
    if (pickedRef && pickedRef !== vehicle.customerRef) {
      return {
        error: `${vehicle.plate} belongs to ${vehicle.ownerName || vehicle.customerRef}. Choose that customer, or no vehicle.`,
      };
    }
    linked = await findCustomer(vehicle.customerRef);
  } else if (pickedRef) {
    if (!crm) {
      return { error: "CRM is not enabled for this business, so a customer cannot be linked." };
    }
    linked = await findCustomer(pickedRef);
    if (!linked) return { error: "That customer is no longer on file. Choose again." };
  }
  const addCustomer = crm && !vehicle && !pickedRef && text("newCustomer") === "1";

  // The linked customer fills a blank name and email, so picking them is enough.
  const customer = text("customer") || linked?.name || vehicle?.ownerName || "";
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

  const email = text("email") || linked?.email || vehicle?.ownerEmail || "";
  const company = text("company") || linked?.company || "";

  // Written last, once everything else has passed, so a refused booking never
  // leaves a customer behind.
  if (addCustomer) {
    linked = await createCustomer({ name: customer, email, company });
  }

  const booking = await createBooking({
    customer,
    company,
    email,
    service,
    startsAt: when.toISOString(),
    durationMinutes,
    staff,
    valueCents,
    channel: BOOKING_CHANNELS.includes(channel) ? channel : BOOKING_CHANNELS[0],
    notes: text("notes"),
    vehicleRef: vehicle?.ref ?? null,
    customerRef: linked?.ref ?? vehicle?.customerRef ?? null,
  });

  revalidatePath("/bookings");
  if (vehicle) revalidatePath("/fleet");
  if (linked || vehicle) revalidatePath("/crm");
  return { error: null, createdRef: booking.ref };
}

export async function setBookingStatusAction(
  ref: string,
  status: BookingStatus,
): Promise<void> {
  await requireModule("bookings");
  await setBookingStatus(ref, status);
  revalidatePath("/bookings");
  // A completed booking for a vehicle is a line in its service history.
  revalidatePath("/fleet");
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
  revalidatePath("/fleet");
}

/**
 * Links a booking to a customer, or unlinks it with null. Returns refusals
 * rather than throwing them, so the drawer can show the reason.
 */
export async function linkBookingCustomerAction(
  ref: string,
  customerRef: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireModule("bookings");
  await requireModule("crm");

  const booking = await getBooking(ref);
  if (!booking) return { ok: false, error: `${ref} is no longer on file.` };

  // A booking for a car is its owner's; relinking it would split the car's
  // history from the customer's.
  if (booking.vehicleRef) {
    return {
      ok: false,
      error: `${ref} is for vehicle ${booking.vehicleRef}, so it stays with that car's owner.`,
    };
  }

  if (customerRef) {
    const customer = await findCustomer(customerRef);
    if (!customer) return { ok: false, error: "That customer is no longer on file." };
  }

  await linkBookingCustomer(ref, customerRef);
  revalidatePath("/bookings");
  revalidatePath("/crm");
  return { ok: true };
}

type Result = { ok: true } | { ok: false; error: string };

/**
 * Who does the job, what it is worth and how long it takes. Every booking can
 * be corrected here; online requests need it, because they arrive unassigned
 * and at zero.
 */
export async function updateBookingDetailsAction(
  ref: string,
  input: { staff: string; value: string; durationMinutes: number },
): Promise<Result> {
  await requireModule("bookings");

  const staff = input.staff.trim();
  if (!staff) return { ok: false, error: "Say who the booking is assigned to." };
  const valueCents = parseCents(input.value.trim());
  if (valueCents === null) return { ok: false, error: "Value must be an amount like 240 or 240.00." };
  if (!Number.isFinite(input.durationMinutes) || input.durationMinutes <= 0 || input.durationMinutes > 24 * 60) {
    return { ok: false, error: "Duration must be a positive number of minutes." };
  }

  await updateBookingDetails(ref, { staff, valueCents, durationMinutes: Math.round(input.durationMinutes) });
  revalidatePath("/bookings");
  revalidatePath("/crm");
  return { ok: true };
}

/**
 * Makes a CRM customer from an online request's name and mobile, and links the
 * booking to it. Staff call this after reading the request; a request never
 * creates a customer by itself.
 */
export async function customerFromRequestAction(ref: string): Promise<Result> {
  await requireModule("bookings");
  await requireModule("crm");

  const booking = await getBooking(ref);
  if (!booking?.request) return { ok: false, error: `${ref} is not an online request.` };
  if (booking.customerRef) return { ok: false, error: `${ref} is already linked to ${booking.customerRef}.` };

  const customer = await createCustomer({ name: booking.customer, phone: booking.request.mobile });
  await linkBookingCustomer(ref, customer.ref);
  revalidatePath("/bookings");
  revalidatePath("/crm");
  return { ok: true };
}

/**
 * Adds the request's car to Fleet under the booking's customer, and attaches it
 * to the booking, so completing the job writes the car's service history. The
 * plate comes from staff, prefilled with what the customer typed, because a
 * vehicle cannot be kept without one.
 */
export async function vehicleFromRequestAction(ref: string, plateInput: string): Promise<Result> {
  await requireModule("bookings");
  await requireModule("fleet");

  const booking = await getBooking(ref);
  if (!booking?.request) return { ok: false, error: `${ref} is not an online request.` };
  if (booking.vehicleRef) return { ok: false, error: `${ref} already has vehicle ${booking.vehicleRef}.` };
  if (!booking.customerRef) return { ok: false, error: "Link the booking to a customer first; the car will be theirs." };

  const plate = plateInput.trim().toUpperCase();
  if (!plate) return { ok: false, error: "Enter the plate number; a vehicle is kept by its plate." };

  const { make, model, year } = booking.request.vehicle;
  try {
    await assertPlateFree(plate);
    const vehicleRef = await createVehicle({
      customerRef: booking.customerRef,
      plate,
      make,
      model,
      year,
      colour: "",
      odometerKm: null,
      intervalMonths: DEFAULT_INTERVAL_MONTHS,
      intervalKm: DEFAULT_INTERVAL_KM,
      notes: "",
    });
    await linkBookingVehicle(ref, vehicleRef);
  } catch (error) {
    if (error instanceof InputError) return { ok: false, error: error.message };
    throw error;
  }

  revalidatePath("/bookings");
  revalidatePath("/fleet");
  revalidatePath("/crm");
  return { ok: true };
}

/**
 * Attaches a car already on file. It must belong to the booking's customer:
 * a booking for a car is its owner's.
 */
export async function linkBookingVehicleAction(ref: string, vehicleRef: string): Promise<Result> {
  await requireModule("bookings");
  await requireModule("fleet");

  const booking = await getBooking(ref);
  if (!booking) return { ok: false, error: `${ref} is no longer on file.` };
  if (booking.vehicleRef) return { ok: false, error: `${ref} already has vehicle ${booking.vehicleRef}.` };

  const vehicle = await findVehicleOption(vehicleRef);
  if (!vehicle) return { ok: false, error: "That vehicle is no longer on file." };
  if (booking.customerRef && booking.customerRef !== vehicle.customerRef) {
    return {
      ok: false,
      error: `${vehicle.plate} belongs to ${vehicle.ownerName || vehicle.customerRef}, not this booking's customer.`,
    };
  }

  if (!booking.customerRef) await linkBookingCustomer(ref, vehicle.customerRef);
  await linkBookingVehicle(ref, vehicle.ref);
  revalidatePath("/bookings");
  revalidatePath("/fleet");
  revalidatePath("/crm");
  return { ok: true };
}
