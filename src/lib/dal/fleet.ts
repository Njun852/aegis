import "server-only";

import {
  computeDue,
  formatDate,
  formatKm,
  plateKey,
  vehicleLabel,
} from "@/lib/fleet";
import { customersCollection, toCustomer } from "./customers";
import { InputError, insertWithRef, isDuplicateKey, nextRef } from "./refs";
import { tenantScope } from "./tenant";
import type {
  Booking,
  Customer,
  ServiceRecord,
  ServiceRecordDocument,
  Vehicle,
  VehicleDocument,
  VehicleInput,
  VehicleOption,
} from "@/types";

/**
 * Vehicles and service history. Both are tenant-owned and go through
 * `tenantScope`, like bookings. A vehicle's owner lives in the shared
 * `customers` collection, which `./customers.ts` owns.
 */
const VEHICLES = "vehicles";
const SERVICE_RECORDS = "serviceRecords";

const customers = customersCollection;
const vehicles = () => tenantScope<VehicleDocument>(VEHICLES);
const serviceRecords = () => tenantScope<ServiceRecordDocument>(SERVICE_RECORDS);

/** Kept under its Fleet name for the actions that already catch it. */
export { InputError as FleetInputError };

function toServiceRecord(doc: ServiceRecordDocument): ServiceRecord {
  return {
    ref: doc.ref,
    vehicleRef: doc.vehicleRef,
    performedAt: doc.performedAt.toISOString(),
    day: formatDate(doc.performedAt),
    odometerKm: doc.odometerKm,
    work: doc.work,
    source: doc.source,
    bookingRef: doc.bookingRef ?? null,
  };
}

function toVehicle(
  doc: VehicleDocument,
  owner: Customer | null,
  last: ServiceRecordDocument | null,
  today: Date,
): Vehicle {
  return {
    ref: doc.ref,
    customerRef: doc.customerRef,
    owner,
    plate: doc.plate,
    make: doc.make,
    model: doc.model,
    year: doc.year,
    colour: doc.colour,
    odometerKm: doc.odometerKm,
    odometerDay: doc.odometerAt ? formatDate(doc.odometerAt) : null,
    intervalMonths: doc.intervalMonths,
    intervalKm: doc.intervalKm,
    notes: doc.notes,
    lastService: last ? toServiceRecord(last) : null,
    due: computeDue(
      {
        lastServiceAt: last?.performedAt ?? null,
        lastServiceKm: last?.odometerKm ?? null,
        currentKm: doc.odometerKm,
        intervalMonths: doc.intervalMonths,
        intervalKm: doc.intervalKm,
      },
      today,
    ),
  };
}

// ---- Vehicles --------------------------------------------------------------

/**
 * Every vehicle with its owner and latest service resolved. The whole list is
 * loaded and filtered in the client, as bookings are; a shop's customer cars
 * number in the hundreds, not the hundreds of thousands.
 */
export async function listVehicles(today = new Date()): Promise<Vehicle[]> {
  const [vehicleCollection, customerCollection, recordCollection] = await Promise.all([
    vehicles(),
    customers(),
    serviceRecords(),
  ]);

  const [docs, owners, latest] = await Promise.all([
    vehicleCollection.find().toArray(),
    customerCollection.find().toArray(),
    recordCollection
      .aggregate([
        { $sort: { performedAt: -1, createdAt: -1 } },
        { $group: { _id: "$vehicleRef", last: { $first: "$$ROOT" } } },
      ])
      .toArray(),
  ]);

  const ownerByRef = new Map(owners.map((doc) => [doc.ref, toCustomer(doc)]));
  const lastByVehicle = new Map(
    latest.map((row) => [String(row._id), row.last as ServiceRecordDocument]),
  );

  return docs.map((doc) =>
    toVehicle(
      doc,
      ownerByRef.get(doc.customerRef) ?? null,
      lastByVehicle.get(doc.ref) ?? null,
      today,
    ),
  );
}

/** One customer's cars, with their schedules resolved, for the CRM profile. */
export async function listVehiclesForCustomer(
  customerRef: string,
  today = new Date(),
): Promise<Vehicle[]> {
  const [vehicleCollection, recordCollection] = await Promise.all([vehicles(), serviceRecords()]);
  const docs = await vehicleCollection.find({ customerRef }).sort({ plateKey: 1 }).toArray();
  if (docs.length === 0) return [];

  const latest = await recordCollection
    .aggregate([
      { $match: { vehicleRef: { $in: docs.map((doc) => doc.ref) } } },
      { $sort: { performedAt: -1, createdAt: -1 } },
      { $group: { _id: "$vehicleRef", last: { $first: "$$ROOT" } } },
    ])
    .toArray();
  const lastByVehicle = new Map(
    latest.map((row) => [String(row._id), row.last as ServiceRecordDocument]),
  );

  const ownerDoc = await (await customers()).findOne({ ref: customerRef });
  const owner = ownerDoc ? toCustomer(ownerDoc) : null;
  return docs.map((doc) => toVehicle(doc, owner, lastByVehicle.get(doc.ref) ?? null, today));
}

/** How many cars each customer has on file, for the CRM list. */
export async function countVehiclesByCustomer(): Promise<Map<string, number>> {
  const collection = await vehicles();
  const rows = await collection
    .aggregate([{ $group: { _id: "$customerRef", count: { $sum: 1 } } }])
    .toArray();
  return new Map(rows.map((row) => [String(row._id), Number(row.count)]));
}

/** Every service record for the business, newest first, for the drawers. */
export async function listServiceRecords(): Promise<ServiceRecord[]> {
  const collection = await serviceRecords();
  const docs = await collection
    .find()
    .sort({ performedAt: -1, createdAt: -1 })
    .toArray();
  return docs.map(toServiceRecord);
}

/** The New Booking form's vehicle picker. */
export async function listVehicleOptions(): Promise<VehicleOption[]> {
  const [vehicleCollection, customerCollection] = await Promise.all([
    vehicles(),
    customers(),
  ]);
  const [docs, owners] = await Promise.all([
    vehicleCollection.find().sort({ plateKey: 1 }).toArray(),
    customerCollection.find().toArray(),
  ]);
  const ownerByRef = new Map(owners.map((doc) => [doc.ref, doc]));
  return docs.map((doc) => {
    const owner = ownerByRef.get(doc.customerRef);
    return {
      ref: doc.ref,
      plate: doc.plate,
      label: vehicleLabel(doc),
      customerRef: doc.customerRef,
      ownerName: owner?.name ?? "",
      ownerEmail: owner?.email ?? "",
    };
  });
}

/** One vehicle as a booking sees it, or null when the ref is not this business's. */
export async function findVehicleOption(ref: string): Promise<VehicleOption | null> {
  const vehicleCollection = await vehicles();
  const doc = await vehicleCollection.findOne({ ref });
  if (!doc) return null;
  const customerCollection = await customers();
  const owner = await customerCollection.findOne({ ref: doc.customerRef });
  return {
    ref: doc.ref,
    plate: doc.plate,
    label: vehicleLabel(doc),
    customerRef: doc.customerRef,
    ownerName: owner?.name ?? "",
    ownerEmail: owner?.email ?? "",
  };
}

/** The vehicle on file with this plate, however it was spelled, or null. */
export async function findVehicleByPlate(plate: string): Promise<VehicleOption | null> {
  const key = plateKey(plate);
  if (!key) return null;
  const collection = await vehicles();
  const doc = await collection.findOne({ plateKey: key });
  return doc ? findVehicleOption(doc.ref) : null;
}

/**
 * Refuses a plate already on file, and returns its key. Exported so a new
 * owner is only written once the plate is known to be free, rather than left
 * behind with no vehicle when the plate turns out to be taken.
 */
export async function assertPlateFree(plate: string, exceptRef?: string): Promise<string> {
  const key = plateKey(plate);
  if (!key) throw new InputError("The plate needs at least one letter or digit.");
  const collection = await vehicles();
  const taken = await collection.findOne({
    plateKey: key,
    ...(exceptRef ? { ref: { $ne: exceptRef } } : {}),
  });
  if (taken) {
    throw new InputError(`That plate is already on file as ${taken.ref}.`);
  }
  return key;
}

export async function createVehicle(input: VehicleInput): Promise<string> {
  const customerCollection = await customers();
  const owner = await customerCollection.findOne({ ref: input.customerRef });
  if (!owner) throw new InputError("That owner is no longer on file.");

  const key = await assertPlateFree(input.plate);
  const collection = await vehicles();
  const now = new Date();

  try {
    return await insertWithRef(collection, "VH-", 1001, (ref) =>
      collection.insertOne({
        ref,
        customerRef: input.customerRef,
        plate: input.plate,
        plateKey: key,
        make: input.make,
        model: input.model,
        year: input.year,
        colour: input.colour,
        odometerKm: input.odometerKm,
        odometerAt: input.odometerKm === null ? null : now,
        intervalMonths: input.intervalMonths,
        intervalKm: input.intervalKm,
        notes: input.notes,
        createdAt: now,
      }),
    );
  } catch (error) {
    // The check above passed, so someone added the same plate in between.
    if (isDuplicateKey(error, "plateKey")) {
      throw new InputError("That plate was just added by someone else.");
    }
    throw error;
  }
}

/** Details and schedule. The odometer has its own path because it only moves forward. */
export async function updateVehicle(
  ref: string,
  input: Omit<VehicleInput, "customerRef" | "odometerKm">,
): Promise<void> {
  const key = await assertPlateFree(input.plate, ref);
  const collection = await vehicles();
  try {
    const result = await collection.updateOne(
      { ref },
      {
        $set: {
          plate: input.plate,
          plateKey: key,
          make: input.make,
          model: input.model,
          year: input.year,
          colour: input.colour,
          intervalMonths: input.intervalMonths,
          intervalKm: input.intervalKm,
          notes: input.notes,
        },
      },
    );
    if (result.matchedCount === 0) throw new InputError(`${ref} is no longer on file.`);
  } catch (error) {
    if (isDuplicateKey(error, "plateKey")) {
      throw new InputError("That plate was just added by someone else.");
    }
    throw error;
  }
}

/**
 * A new reading. An odometer only counts up, so a lower number is almost always
 * a typo; refusing it keeps one slip from making an overdue car look fine.
 */
export async function updateOdometer(ref: string, km: number): Promise<void> {
  const collection = await vehicles();
  const doc = await collection.findOne({ ref });
  if (!doc) throw new InputError(`${ref} is no longer on file.`);
  if (doc.odometerKm !== null && km < doc.odometerKm) {
    throw new InputError(
      `Readings only go forward. The last one was ${formatKm(doc.odometerKm)}.`,
    );
  }
  await collection.updateOne(
    { ref },
    { $set: { odometerKm: km, odometerAt: new Date() } },
  );
}

/** Raises the vehicle's reading to `km` if it is higher; never lowers it. */
async function raiseOdometer(vehicleRef: string, km: number, at: Date): Promise<void> {
  const collection = await vehicles();
  await collection.updateOne(
    {
      ref: vehicleRef,
      $or: [{ odometerKm: null }, { odometerKm: { $lt: km } }],
    },
    { $set: { odometerKm: km, odometerAt: at } },
  );
}

// ---- Service history -------------------------------------------------------

/** A past or walk-in service, typed in by staff. */
export async function logService(input: {
  vehicleRef: string;
  performedAt: Date;
  odometerKm: number | null;
  work: string;
}): Promise<string> {
  const vehicleCollection = await vehicles();
  const vehicle = await vehicleCollection.findOne({ ref: input.vehicleRef });
  if (!vehicle) throw new InputError(`${input.vehicleRef} is no longer on file.`);

  const collection = await serviceRecords();
  const ref = await insertWithRef(collection, "SR-", 1001, (next) =>
    collection.insertOne({
      ref: next,
      vehicleRef: input.vehicleRef,
      performedAt: input.performedAt,
      odometerKm: input.odometerKm,
      work: input.work,
      source: "manual",
      createdAt: new Date(),
    }),
  );

  if (input.odometerKm !== null) {
    await raiseOdometer(input.vehicleRef, input.odometerKm, input.performedAt);
  }
  return ref;
}

/**
 * Adds the reading to a history line that has none, typically one mirrored
 * from a booking, which carries no km of its own.
 */
export async function setServiceOdometer(ref: string, km: number): Promise<void> {
  const collection = await serviceRecords();
  const record = await collection.findOne({ ref });
  if (!record) throw new InputError(`${ref} is no longer on file.`);
  await collection.updateOne({ ref }, { $set: { odometerKm: km } });
  await raiseOdometer(record.vehicleRef, km, record.performedAt);
}

/**
 * Mirrors one booking into its vehicle's history. A completed booking is one
 * history line, dated when the work was booked for; any other status has none.
 * Called on every status change and reschedule, so it is idempotent: the unique
 * `{ businessId, bookingRef }` index keeps it to one line whatever the order.
 *
 * A reading added to the line survives re-syncs, because only the date and the
 * work are overwritten.
 */
export async function syncBookingService(booking: Booking): Promise<void> {
  if (!booking.vehicleRef) return;
  const collection = await serviceRecords();

  if (booking.status !== "Completed") {
    await collection.deleteOne({ bookingRef: booking.ref, source: "booking" });
    return;
  }

  const performedAt = new Date(booking.startsAt);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const ref = await nextRef(collection, "SR-", 1001);
    try {
      await collection.updateOne(
        { bookingRef: booking.ref },
        {
          $set: { vehicleRef: booking.vehicleRef, performedAt, work: booking.service },
          $setOnInsert: {
            ref,
            odometerKm: null,
            source: "booking",
            createdAt: new Date(),
          },
        },
        { upsert: true },
      );
      return;
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      // Lost the race for the ref, or for the booking's line; either way the
      // next pass either takes a new number or finds the line and updates it.
    }
  }
  throw new Error(`Could not record ${booking.ref} in the service history; please retry.`);
}

/** The reading for a booking's history line, once the booking has written it. */
export async function setBookingServiceOdometer(bookingRef: string, km: number): Promise<void> {
  const collection = await serviceRecords();
  const record = await collection.findOne({ bookingRef, source: "booking" });
  if (record) await setServiceOdometer(record.ref, km);
}
