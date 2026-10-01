"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/dal/businesses";
import { createCustomer } from "@/lib/dal/customers";
import {
  FleetInputError,
  assertPlateFree,
  createVehicle,
  logService,
  setServiceOdometer,
  updateOdometer,
  updateVehicle,
} from "@/lib/dal/fleet";
import {
  DEFAULT_INTERVAL_KM,
  DEFAULT_INTERVAL_MONTHS,
  parseWholeNumber,
} from "@/lib/fleet";

/**
 * Drawer actions return their refusals rather than throwing them: a production
 * build replaces a thrown message with a generic one, and "that plate is
 * already on file" is exactly what the person needs to read. Faults still
 * throw, and the screen reports them as a failed save.
 */
export type FleetResult = { ok: true } | { ok: false; error: string };

async function attempt(work: () => Promise<void>): Promise<FleetResult> {
  try {
    await work();
    return { ok: true };
  } catch (error) {
    if (error instanceof FleetInputError) return { ok: false, error: error.message };
    throw error;
  }
}

function refresh() {
  revalidatePath("/fleet");
  // The New Booking form lists vehicles, so a new or renamed one shows there too.
  revalidatePath("/bookings");
}

type Parsed<T> = { value: T } | { error: string };

function readKm(text: string, label: string): Parsed<number | null> {
  const km = parseWholeNumber(text);
  if (km === undefined) return { error: `${label} must be a whole number of km, like 45200.` };
  if (km !== null && km > 2_000_000) return { error: `${label} looks too high to be right.` };
  return { value: km };
}

function readYear(text: string): Parsed<number | null> {
  const year = parseWholeNumber(text);
  const latest = new Date().getFullYear() + 1;
  if (year === undefined || (year !== null && (year < 1950 || year > latest))) {
    return { error: `Year must be between 1950 and ${latest}, or left blank.` };
  }
  return { value: year };
}

function readSchedule(
  monthsText: string,
  kmText: string,
): Parsed<{ intervalMonths: number; intervalKm: number }> {
  const months = parseWholeNumber(monthsText);
  const km = parseWholeNumber(kmText);
  if (months === undefined || (months !== null && (months < 1 || months > 60))) {
    return { error: "Service every … months must be between 1 and 60." };
  }
  if (km === undefined || (km !== null && (km < 500 || km > 100_000))) {
    return { error: "Service every … km must be between 500 and 100,000." };
  }
  return {
    value: {
      intervalMonths: months ?? DEFAULT_INTERVAL_MONTHS,
      intervalKm: km ?? DEFAULT_INTERVAL_KM,
    },
  };
}

// ---- New vehicle (a form, through useActionState) --------------------------

export interface VehicleFormState {
  error: string | null;
  createdRef?: string;
}

export async function createVehicleAction(
  _previous: VehicleFormState,
  formData: FormData,
): Promise<VehicleFormState> {
  await requireModule("fleet");

  const text = (key: string) => String(formData.get(key) ?? "").trim();

  const plate = text("plate").toUpperCase();
  const make = text("make");
  const model = text("model");
  if (!plate || !make || !model) {
    return { error: "Plate, make and model are all required." };
  }

  const year = readYear(text("year"));
  if ("error" in year) return { error: year.error };
  const odometer = readKm(text("odometerKm"), "Current odometer");
  if ("error" in odometer) return { error: odometer.error };
  const schedule = readSchedule(text("intervalMonths"), text("intervalKm"));
  if ("error" in schedule) return { error: schedule.error };

  const newOwner = text("ownerMode") === "new";
  const ownerName = text("ownerName");
  const ownerPhone = text("ownerPhone");
  if (newOwner && (!ownerName || !ownerPhone)) {
    return { error: "A new owner needs a name and a phone number to call about the car." };
  }
  if (!newOwner && !text("customerRef")) {
    return { error: "Choose the owner, or add a new one." };
  }

  try {
    // Checked before the owner is written, so a taken plate never leaves a
    // customer behind with no car.
    await assertPlateFree(plate);

    const customerRef = newOwner
      ? (await createCustomer({ name: ownerName, phone: ownerPhone, email: text("ownerEmail") })).ref
      : text("customerRef");

    const ref = await createVehicle({
      customerRef,
      plate,
      make,
      model,
      year: year.value,
      colour: text("colour"),
      odometerKm: odometer.value,
      ...schedule.value,
      notes: text("notes"),
    });

    refresh();
    return { error: null, createdRef: ref };
  } catch (error) {
    if (error instanceof FleetInputError) return { error: error.message };
    throw error;
  }
}

// ---- Drawer actions --------------------------------------------------------

export interface VehicleDetailsInput {
  plate: string;
  make: string;
  model: string;
  year: string;
  colour: string;
  intervalMonths: string;
  intervalKm: string;
  notes: string;
}

export async function updateVehicleAction(
  ref: string,
  input: VehicleDetailsInput,
): Promise<FleetResult> {
  await requireModule("fleet");

  const plate = input.plate.trim().toUpperCase();
  const make = input.make.trim();
  const model = input.model.trim();
  if (!plate || !make || !model) {
    return { ok: false, error: "Plate, make and model are all required." };
  }
  const year = readYear(input.year.trim());
  if ("error" in year) return { ok: false, error: year.error };
  const schedule = readSchedule(input.intervalMonths.trim(), input.intervalKm.trim());
  if ("error" in schedule) return { ok: false, error: schedule.error };

  const result = await attempt(() =>
    updateVehicle(ref, {
      plate,
      make,
      model,
      year: year.value,
      colour: input.colour.trim(),
      ...schedule.value,
      notes: input.notes.trim(),
    }),
  );
  if (result.ok) refresh();
  return result;
}

export async function updateOdometerAction(
  ref: string,
  kmText: string,
): Promise<FleetResult> {
  await requireModule("fleet");

  const km = readKm(kmText, "The reading");
  if ("error" in km) return { ok: false, error: km.error };
  if (km.value === null) return { ok: false, error: "Enter the reading from the odometer." };
  const reading = km.value;

  const result = await attempt(() => updateOdometer(ref, reading));
  if (result.ok) revalidatePath("/fleet");
  return result;
}

export interface ServiceLogInput {
  /** "2026-09-26", from a date input. */
  performedOn: string;
  odometerKm: string;
  work: string;
}

export async function logServiceAction(
  vehicleRef: string,
  input: ServiceLogInput,
): Promise<FleetResult> {
  await requireModule("fleet");

  const work = input.work.trim();
  if (!work) return { ok: false, error: "Say what work was done." };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.performedOn)) {
    return { ok: false, error: "Choose the date the service was done." };
  }
  // Midday, so the date cannot slip a day either side when shown in another
  // timezone.
  const performedAt = new Date(`${input.performedOn}T12:00:00`);
  if (Number.isNaN(performedAt.getTime())) {
    return { ok: false, error: "That date could not be read." };
  }
  if (performedAt.getTime() > Date.now() + 86_400_000) {
    return {
      ok: false,
      error: "A logged service has already happened. Book future work in Bookings.",
    };
  }

  const km = readKm(input.odometerKm, "The odometer reading");
  if ("error" in km) return { ok: false, error: km.error };
  const odometerKm = km.value;

  const result = await attempt(async () => {
    await logService({ vehicleRef, performedAt, odometerKm, work });
  });
  if (result.ok) revalidatePath("/fleet");
  return result;
}

export async function setServiceOdometerAction(
  recordRef: string,
  kmText: string,
): Promise<FleetResult> {
  await requireModule("fleet");

  const km = readKm(kmText, "The reading");
  if ("error" in km) return { ok: false, error: km.error };
  if (km.value === null) return { ok: false, error: "Enter the reading from the odometer." };
  const reading = km.value;

  const result = await attempt(() => setServiceOdometer(recordRef, reading));
  if (result.ok) revalidatePath("/fleet");
  return result;
}
