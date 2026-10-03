import "server-only";

import { formatStamp } from "@/lib/format";
import { vehicleLabel } from "@/lib/fleet";
import { getSmsProvider } from "@/lib/sms/provider";
import {
  MAX_LEAD_DAYS,
  MAX_TEMPLATE_LENGTH,
  QUEUE_EXPIRY_DAYS,
  countSegments,
  effectiveTemplate,
  formatKey,
  isSendingHour,
  reminderDecision,
  renderTemplate,
  toE164,
  unknownPlaceholders,
} from "@/lib/text-blast";
import { businessesCollection, getDb } from "./db";
import { InputError, isDuplicateKey } from "./refs";
import type {
  BusinessDocument,
  CustomerDocument,
  ReminderRow,
  ServiceRecordDocument,
  SmsKind,
  SmsMessage,
  SmsMessageDocument,
  SweepResult,
  TextBlastSettings,
  VehicleDocument,
} from "@/types";

/**
 * Text Blast's database access.
 *
 * Everything here takes an explicit `businessId` rather than going through
 * `tenantScope`, like `messenger.ts` and `public-booking.ts`: the sweep runs on
 * a timer, with no one signed in and so no session to scope by. The id comes
 * from the business list the timer walks, or, for the screen's actions, from
 * `requireModule("sms")`; never from anything a browser sent.
 */

const NO_PROVIDER = "No SMS provider connected";

async function messages() {
  const db = await getDb();
  return db.collection<SmsMessageDocument>("smsMessages");
}

async function findBusiness(businessId: string): Promise<BusinessDocument | null> {
  const businesses = await businessesCollection();
  return businesses.findOne({ businessId });
}

/**
 * The public booking page's address, for the `{link}` placeholder. Empty when
 * the page is closed or the app has not been told its public address: a job on
 * a timer has no request to read a host name from, so it comes from
 * `APP_PUBLIC_URL`.
 */
function bookingLink(business: BusinessDocument): string {
  const base = process.env.APP_PUBLIC_URL?.trim().replace(/\/$/, "");
  const page = business.onlineBooking;
  if (!base || !page?.enabled || !business.modules.includes("bookings")) return "";
  return `${base}/book/${page.slug}`;
}

function toMessage(doc: SmsMessageDocument): SmsMessage {
  return {
    ref: doc.ref,
    kind: doc.kind,
    vehicleRef: doc.vehicleRef,
    customerRef: doc.customerRef,
    to: doc.to,
    body: doc.body,
    segments: doc.segments,
    dueKey: doc.dueKey,
    status: doc.status,
    statusNote: doc.statusNote,
    created: formatStamp(doc.createdAt),
    sent: doc.sentAt ? formatStamp(doc.sentAt) : null,
  };
}

// ---- Settings ---------------------------------------------------------------

export async function readTextBlastSettings(
  businessId: string,
): Promise<TextBlastSettings & { hasLink: boolean; hasFleet: boolean }> {
  const business = await findBusiness(businessId);
  const config = business?.textBlast;
  const hasLink = business ? bookingLink(business) !== "" : false;
  return {
    enabled: config?.enabled ?? false,
    template: effectiveTemplate(config?.template, hasLink),
    leadDays: config?.leadDays ?? 0,
    lastRunAt: config?.lastRunAt ? config.lastRunAt.toISOString() : null,
    lastRunNote: config?.lastRunNote ?? null,
    hasLink,
    hasFleet: business?.modules.includes("fleet") ?? false,
  };
}

export async function saveTextBlastSettings(
  businessId: string,
  input: { enabled: boolean; template: string; leadDays: number },
): Promise<void> {
  const template = input.template.trim();
  if (!template) throw new InputError("The message cannot be empty.");
  if (template.length > MAX_TEMPLATE_LENGTH) {
    throw new InputError(`Keep the message under ${MAX_TEMPLATE_LENGTH} characters.`);
  }
  const unknown = unknownPlaceholders(template);
  if (unknown.length > 0) {
    throw new InputError(`Text Blast does not know {${unknown.join("}, {")}}. Check the spelling.`);
  }
  if (!Number.isInteger(input.leadDays) || input.leadDays < 0 || input.leadDays > MAX_LEAD_DAYS) {
    throw new InputError(`Days before due must be a whole number from 0 to ${MAX_LEAD_DAYS}.`);
  }

  const business = await findBusiness(businessId);
  if (!business) throw new InputError("That business is no longer on file.");
  if (input.enabled && !business.modules.includes("fleet")) {
    throw new InputError("Reminders are worked out from Fleet's service history. Grant Fleet first.");
  }

  const businesses = await businessesCollection();
  await businesses.updateOne(
    { businessId },
    {
      $set: {
        "textBlast.enabled": input.enabled,
        "textBlast.template": template,
        "textBlast.leadDays": input.leadDays,
        "textBlast.updatedAt": new Date(),
      },
    },
  );
}

// ---- Who is due -------------------------------------------------------------

/**
 * Every car with what Text Blast will do, or has done, about its next due
 * date. The same list drives the screen and the sweep, so what the screen
 * promises is what the sweep does.
 */
export async function listReminderRows(businessId: string, now = new Date()): Promise<ReminderRow[]> {
  const business = await findBusiness(businessId);
  if (!business) return [];

  const db = await getDb();
  const [vehicles, customers, latest, existing] = await Promise.all([
    db.collection<VehicleDocument>("vehicles").find({ businessId }).toArray(),
    db.collection<CustomerDocument>("customers").find({ businessId }).toArray(),
    db
      .collection<ServiceRecordDocument>("serviceRecords")
      .aggregate<{ _id: string; performedAt: Date }>([
        { $match: { businessId } },
        { $sort: { performedAt: -1, createdAt: -1 } },
        { $group: { _id: "$vehicleRef", performedAt: { $first: "$performedAt" } } },
      ])
      .toArray(),
    (await messages())
      .find({ businessId }, { projection: { _id: 0, vehicleRef: 1, dueKey: 1, status: 1 } })
      .toArray(),
  ]);

  const owners = new Map(customers.map((customer) => [customer.ref, customer]));
  const lastService = new Map(latest.map((row) => [row._id, row.performedAt]));
  const texted = new Map(existing.map((message) => [`${message.vehicleRef}|${message.dueKey}`, message.status]));

  const link = bookingLink(business);
  const template = effectiveTemplate(business.textBlast?.template, link !== "");
  const leadDays = business.textBlast?.leadDays ?? 0;

  return vehicles.map((vehicle) => {
    const owner = owners.get(vehicle.customerRef);
    let outcome = reminderDecision(
      {
        lastServiceAt: lastService.get(vehicle.ref) ?? null,
        intervalMonths: vehicle.intervalMonths,
        ownerPhone: owner?.phone ?? "",
        ownerOptedOut: owner?.smsOptOut ?? false,
        leadDays,
      },
      now,
    );

    // A text already written for this due date settles it, whatever the rules
    // would say now.
    const status = outcome.dueKey ? texted.get(`${vehicle.ref}|${outcome.dueKey}`) : undefined;
    if (status && outcome.dueKey) outcome = { kind: "done", dueKey: outcome.dueKey, status };

    const label = vehicleLabel(vehicle);
    return {
      vehicleRef: vehicle.ref,
      plate: vehicle.plate,
      vehicle: label,
      customerRef: vehicle.customerRef,
      ownerName: owner?.name ?? "",
      ownerPhone: owner?.phone ?? "",
      optedOut: owner?.smsOptOut ?? false,
      dueDay: outcome.dueKey ? formatKey(outcome.dueKey) : null,
      outcome,
      preview: renderTemplate(template, {
        name: owner?.name ?? "",
        vehicle: label,
        plate: vehicle.plate,
        due: outcome.dueKey ? formatKey(outcome.dueKey) : "",
        business: business.name,
        link,
      }),
    };
  });
}

// ---- Messages ---------------------------------------------------------------

export async function listSmsMessages(businessId: string, limit = 200): Promise<SmsMessage[]> {
  const collection = await messages();
  const docs = await collection.find({ businessId }).sort({ createdAt: -1 }).limit(limit).toArray();
  return docs.map(toMessage);
}

export async function countSentSince(businessId: string, since: Date): Promise<number> {
  const collection = await messages();
  return collection.countDocuments({ businessId, status: "sent", sentAt: { $gte: since } });
}

/**
 * Writes one text as queued. Returns false when one already exists for this
 * car and due date: the unique index refuses the second, which is what makes
 * the sweep safe to run as often as it likes.
 */
async function writeMessage(
  businessId: string,
  row: ReminderRow,
  dueKey: string,
  kind: SmsKind,
  now: Date,
): Promise<boolean> {
  const to = toE164(row.ownerPhone);
  if (!to) return false;
  const collection = await messages();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const refs = await collection.find({ businessId }, { projection: { _id: 0, ref: 1 } }).toArray();
    const highest = refs.reduce((max, doc) => {
      const parsed = Number.parseInt(doc.ref.replace("SM-", ""), 10);
      return Number.isFinite(parsed) && parsed > max ? parsed : max;
    }, 1000);

    try {
      await collection.insertOne({
        businessId,
        ref: `SM-${highest + 1}`,
        kind,
        vehicleRef: row.vehicleRef,
        customerRef: row.customerRef,
        to,
        body: row.preview,
        segments: countSegments(row.preview).segments,
        dueKey,
        status: "queued",
        statusNote: getSmsProvider() ? "Waiting to send" : NO_PROVIDER,
        provider: null,
        providerMessageId: null,
        createdAt: now,
        sentAt: null,
      });
      return true;
    } catch (error) {
      if (isDuplicateKey(error, "vehicleRef")) return false;
      // A lost race for the ref: take the next number.
      if (!isDuplicateKey(error, "ref")) throw error;
    }
  }
  throw new Error("Could not allocate a message reference; please retry.");
}

/**
 * A reminder a person asked for, for a car the sweep leaves alone because it
 * is long overdue. Still one per due date, still never to someone who opted
 * out or has no mobile.
 */
export async function queueManualReminder(
  businessId: string,
  vehicleRef: string,
  now = new Date(),
): Promise<void> {
  const rows = await listReminderRows(businessId, now);
  const row = rows.find((entry) => entry.vehicleRef === vehicleRef);
  if (!row) throw new InputError(`${vehicleRef} is no longer on file.`);

  const { outcome } = row;
  if (outcome.kind === "done") throw new InputError("A reminder for this due date already exists.");
  if (outcome.kind === "skip" && outcome.reason !== "too-old") {
    throw new InputError(
      outcome.reason === "opted-out"
        ? `${row.ownerName || "This customer"} has reminders switched off.`
        : outcome.reason === "no-mobile"
          ? "There is no mobile number on file for the owner."
          : "This car has no service on record, so there is no due date to remind about.",
    );
  }
  if (!outcome.dueKey) throw new InputError("This car has no due date yet.");

  const written = await writeMessage(businessId, row, outcome.dueKey, "manual", now);
  if (!written) throw new InputError("A reminder for this due date already exists.");
}

// ---- The sweep --------------------------------------------------------------

/** Businesses the timer should visit: the module granted and the switch on. */
export async function listSweepBusinessIds(): Promise<string[]> {
  const businesses = await businessesCollection();
  const docs = await businesses
    .find({ modules: "sms", "textBlast.enabled": true, status: "active" }, { projection: { businessId: 1 } })
    .toArray();
  return docs.map((doc) => doc.businessId);
}

/**
 * One pass for one business: write the texts that are due, hand queued ones to
 * the provider if there is one, retire the stale, and record what happened.
 *
 * Idempotent. Running it twice in a row, or from two timers at once, writes
 * nothing the first run did not: each car has at most one text per due date.
 */
export async function runReminderSweep(businessId: string, now = new Date()): Promise<SweepResult> {
  const business = await findBusiness(businessId);
  const idle = (note: string): SweepResult => ({ ran: false, created: 0, sent: 0, failed: 0, expired: 0, note });

  if (!business) return idle("Business not found.");
  if (!business.modules.includes("sms")) return idle("Text Blast is not enabled for this business.");
  if (!business.modules.includes("fleet")) return idle("Fleet is not enabled, so there are no due dates to work from.");
  if (!business.textBlast?.enabled) return idle("Automatic reminders are switched off.");

  const collection = await messages();

  // Retired before anything is sent, so connecting a provider later can never
  // release reminders that went stale while there was none.
  const cutoff = new Date(now.getTime() - QUEUE_EXPIRY_DAYS * 86_400_000);
  const expired = (
    await collection.updateMany(
      { businessId, status: "queued", createdAt: { $lt: cutoff } },
      { $set: { status: "expired", statusNote: `Not sent within ${QUEUE_EXPIRY_DAYS} days` } },
    )
  ).modifiedCount;

  let created = 0;
  let sent = 0;
  let failed = 0;
  let note: string;

  if (!isSendingHour(now)) {
    note = "Outside sending hours (9:00 AM to 6:00 PM); nothing written.";
  } else {
    const rows = await listReminderRows(businessId, now);
    for (const row of rows) {
      if (row.outcome.kind !== "send") continue;
      if (await writeMessage(businessId, row, row.outcome.dueKey, "service-due", now)) created += 1;
    }

    const provider = getSmsProvider();
    if (provider) {
      const queued = await collection.find({ businessId, status: "queued" }).sort({ createdAt: 1 }).toArray();
      for (const message of queued) {
        let result: Awaited<ReturnType<typeof provider.send>>;
        try {
          result = await provider.send(message.to, message.body);
        } catch (error) {
          result = { ok: false, error: error instanceof Error ? error.message : "The provider failed." };
        }
        // Recorded exactly as reported. A text is "sent" only when the provider
        // said it accepted it.
        await collection.updateOne(
          { businessId, ref: message.ref, status: "queued" },
          result.ok
            ? { $set: { status: "sent", statusNote: `Accepted by ${provider.name}`, provider: provider.name, providerMessageId: result.id, sentAt: new Date() } }
            : { $set: { status: "failed", statusNote: result.error, provider: provider.name } },
        );
        if (result.ok) sent += 1;
        else failed += 1;
      }
      note = `${created} written, ${sent} sent, ${failed} failed.`;
    } else {
      const waiting = await collection.countDocuments({ businessId, status: "queued" });
      note = `${created} written. ${waiting} queued, not sent: no SMS provider is connected.`;
    }
  }

  if (expired > 0) note += ` ${expired} expired.`;

  const businesses = await businessesCollection();
  await businesses.updateOne(
    { businessId },
    { $set: { "textBlast.lastRunAt": now, "textBlast.lastRunNote": note } },
  );

  return { ran: true, created, sent, failed, expired, note };
}
