"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/dal/businesses";
import {
  assertPlateFree,
  createVehicle,
  findVehicleByPlate,
  findVehicleOption,
} from "@/lib/dal/fleet";
import { createCustomer, findCustomer, findDuplicates } from "@/lib/dal/customers";
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
import { phoneKey } from "@/lib/crm";
import { DEFAULT_INTERVAL_KM, DEFAULT_INTERVAL_MONTHS } from "@/lib/fleet";
import { BOOKING_CHANNELS, DEFAULT_STAFF_CHANNEL } from "@/lib/data/bookings";
import { parseCents } from "@/lib/format";
import type { BookingStatus } from "@/types";

export interface BookingFormState {
  error: string | null;
  createdRef?: string;
  /** What else the save wrote, for the confirmation: "Juan Dela Cruz added to CRM". */
  createdNote?: string;
}

/** "juan  dela cruz" and "Juan Dela Cruz" are the same person for matching. */
function sameName(left: string, right: string) {
  const key = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");
  return key(left) === key(right);
}

/**
 * A booking typed in by staff. It asks for what the public booking page asks
 * for, and turns it into records straight away, because here staff have already
 * read what they are typing: the customer is linked or added to CRM, and the car
 * is linked or added to Fleet under them.
 */
export async function createBookingAction(
  _previous: BookingFormState,
  formData: FormData,
): Promise<BookingFormState> {
  const business = await requireModule("bookings");
  const crm = business.modules.includes("crm");
  const fleet = business.modules.includes("fleet");

  const text = (key: string) => String(formData.get(key) ?? "").trim();

  const customer = text("customer");
  const mobile = text("mobile");
  const service = text("service");
  const startsAt = text("startsAt");
  const staff = text("staff");

  if (!customer || !mobile || !service || !startsAt || !staff) {
    return { error: "Customer, mobile number, service, date and assignee are all required." };
  }
  if (phoneKey(mobile).length < 7) {
    return { error: "Enter the number the customer can be reached on." };
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

  // The car, as typed. A plate already on file is that car; a new plate needs
  // a make and model to be kept.
  const plate = fleet ? text("plate").toUpperCase() : "";
  const make = fleet ? text("make") : "";
  const model = fleet ? text("model") : "";
  const yearText = fleet ? text("year") : "";
  let year: number | null = null;
  if (yearText) {
    year = Number(yearText);
    const latest = new Date().getFullYear() + 1;
    if (!Number.isInteger(year) || year < 1950 || year > latest) {
      return { error: `Year should be between 1950 and ${latest}, or left blank.` };
    }
  }
  const onFile = plate ? await findVehicleByPlate(plate) : null;
  const newCar = plate !== "" && !onFile;
  if (newCar && (!make || !model)) {
    return { error: `${plate} is not on file yet. Enter its make and model to add it.` };
  }

  // Who the booking belongs to: the customer picked from the matches, else the
  // car's owner, else someone on file with this name and number.
  const pickedRef = text("customerRef");
  let linked: Awaited<ReturnType<typeof findCustomer>> = null;
  if (pickedRef) {
    linked = await findCustomer(pickedRef);
    if (!linked) return { error: "That customer is no longer on file. Choose again." };
  }
  if (onFile) {
    // A booking for a car is its owner's.
    if (linked && linked.ref !== onFile.customerRef) {
      return {
        error: `${onFile.plate} is on file under ${onFile.ownerName || onFile.customerRef}. Pick that customer, or check the plate.`,
      };
    }
    linked ??= await findCustomer(onFile.customerRef);
  }
  if (!linked && crm) {
    const matches = await findDuplicates({ phone: mobile, email: "" });
    const same = matches.find((match) => sameName(match.name, customer));
    if (same) linked = await findCustomer(same.ref);
  }

  // The form no longer asks for a company; a booking carries the one on the
  // linked customer's record, which is edited in CRM.
  const company = linked?.company ?? "";
  const notes = [
    text("notes"),
    // A car with no plate cannot be kept in Fleet, so what was typed stays here.
    !plate && (make || model) ? `Car: ${[make, model, year ?? ""].filter(Boolean).join(" ")} (no plate given)` : "",
  ]
    .filter(Boolean)
    .join("\n");

  // Written last, once everything else has passed, so a refused booking never
  // leaves a customer or a car behind. A new car needs an owner even without
  // CRM, as it does in Fleet.
  const written: string[] = [];
  let vehicleRef = onFile?.ref ?? null;
  try {
    if (newCar) await assertPlateFree(plate);
    if (!linked && (crm || newCar)) {
      linked = await createCustomer({ name: customer, phone: mobile, company });
      written.push(`${linked.name} added to CRM`);
    }
    if (newCar && linked) {
      vehicleRef = await createVehicle({
        customerRef: linked.ref,
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
      written.push(`${plate} added to Fleet`);
    }
  } catch (error) {
    if (error instanceof InputError) return { error: error.message };
    throw error;
  }

  const channel = text("channel");
  const booking = await createBooking({
    customer,
    company,
    email: linked?.email ?? "",
    phone: mobile,
    service,
    startsAt: when.toISOString(),
    durationMinutes,
    staff,
    valueCents,
    channel: BOOKING_CHANNELS.includes(channel) ? channel : DEFAULT_STAFF_CHANNEL,
    notes,
    vehicleRef,
    customerRef: linked?.ref ?? null,
  });

  revalidatePath("/bookings");
  if (vehicleRef) revalidatePath("/fleet");
  if (linked) revalidatePath("/crm");
  return { error: null, createdRef: booking.ref, createdNote: written.join(" · ") || undefined };
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

