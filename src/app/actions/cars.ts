"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/dal/businesses";
import {
  FleetInputError,
  assertPlateFree,
  createVehicle,
  updateOdometer,
  updateVehicle,
} from "@/lib/dal/fleet";
import { DEFAULT_INTERVAL_KM, DEFAULT_INTERVAL_MONTHS, parseWholeNumber } from "@/lib/fleet";

/**
 * Customers' cars, kept in CRM. A car holds the basics staff need (plate, make,
 * model, year, colour, odometer, notes); its service history and next due date
 * are still worked out behind the scenes from completed bookings, which is what
 * Text Blast reminders and the overdue alert read.
 *
 * Refusals are returned rather than thrown: a production build replaces a
 * thrown message with a generic one, and "that plate is already on file" is
 * exactly what the person needs to read.
 */
export type CarResult = { ok: true; ref: string } | { ok: false; error: string };

export interface CarInput {
  plate: string;
  make: string;
  model: string;
  year: string;
  colour: string;
  odometerKm: string;
  notes: string;
}

function refresh() {
  revalidatePath("/crm");
  // The booking and quotation car pickers list these too.
  revalidatePath("/bookings");
  revalidatePath("/quotations");
}

/** Adds a car to a customer (`ref` null) or saves one already on file. */
export async function saveCarAction(customerRef: string, ref: string | null, input: CarInput): Promise<CarResult> {
  await requireModule("crm");

  const plate = input.plate.trim().toUpperCase();
  const make = input.make.trim();
  const model = input.model.trim();
  if (!plate || !make || !model) return { ok: false, error: "Plate, make and model are all required." };

  const year = parseWholeNumber(input.year.trim());
  const latest = new Date().getFullYear() + 1;
  if (year === undefined || (year !== null && (year < 1950 || year > latest))) {
    return { ok: false, error: `Year must be between 1950 and ${latest}, or left blank.` };
  }
  const km = parseWholeNumber(input.odometerKm.trim());
  if (km === undefined) return { ok: false, error: "Odometer must be a whole number of km, like 45200." };
  if (km !== null && km > 2_000_000) return { ok: false, error: "That odometer reading looks too high to be right." };

  const details = {
    plate,
    make,
    model,
    year,
    colour: input.colour.trim().slice(0, 40),
    notes: input.notes.trim().slice(0, 600),
  };

  try {
    if (ref === null) {
      await assertPlateFree(plate);
      const created = await createVehicle({
        customerRef,
        ...details,
        odometerKm: km,
        // New cars start on the shop's usual schedule; nobody has to set it.
        intervalMonths: DEFAULT_INTERVAL_MONTHS,
        intervalKm: DEFAULT_INTERVAL_KM,
      });
      refresh();
      return { ok: true, ref: created };
    }

    await updateVehicle(ref, details);
    if (km !== null) await updateOdometer(ref, km);
    refresh();
    return { ok: true, ref };
  } catch (error) {
    if (error instanceof FleetInputError) return { ok: false, error: error.message };
    throw error;
  }
}
