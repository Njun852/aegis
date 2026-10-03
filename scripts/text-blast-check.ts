/**
 * Text Blast rehearsal.
 *
 *   npm run sms:check
 *
 * Part one proves the rules on fixed dates: when a car is due, what the lead
 * days and the 30-day catch-up window do, who is skipped and why, the daytime
 * window, the template and the segment count.
 *
 * Part two runs the real sweep against a throwaway business in the configured
 * database and reads back what it wrote. That is possible because the sweep is
 * addressed by business id and needs no session. It proves the properties that
 * make automatic sending safe: one text per car per due date however often it
 * runs, nothing at night, nothing with the switch off, nothing to someone who
 * opted out, and that with no provider connected a text is `queued` and never
 * `sent`. Everything it writes is removed.
 *
 * No text is sent to anyone: there is no provider to send through.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { TEXT_BLAST_INDEXES } from "@/lib/data/text-blast";
import {
  listReminderRows,
  listSmsMessages,
  queueManualReminder,
  runReminderSweep,
  saveTextBlastSettings,
} from "@/lib/dal/text-blast";
import { InputError } from "@/lib/dal/refs";
import clientPromise from "@/lib/db/mongodb";
import { getSmsProvider } from "@/lib/sms/provider";
import {
  DEFAULT_TEMPLATE,
  DEFAULT_TEMPLATE_WITH_LINK,
  countSegments,
  describeReminder,
  effectiveTemplate,
  isSendingHour,
  reminderDecision,
  renderTemplate,
  toE164,
  unknownPlaceholders,
} from "@/lib/text-blast";

// ---- Part one: the rules ----------------------------------------------------

const at = (iso: string) => new Date(iso);
const morning = at("2026-10-02T10:00:00+08:00");
const car = (lastService: string | null, extra: Partial<Parameters<typeof reminderDecision>[0]> = {}) => ({
  lastServiceAt: lastService ? at(lastService) : null,
  intervalMonths: 6,
  ownerPhone: "0917 123 4567",
  ownerOptedOut: false,
  leadDays: 0,
  ...extra,
});

assert.deepEqual(reminderDecision(car("2026-04-02T10:00:00+08:00"), morning), { kind: "send", dueKey: "2026-10-02" }, "due today is sent today");
assert.deepEqual(
  reminderDecision(car("2026-04-03T10:00:00+08:00"), morning),
  { kind: "wait", dueKey: "2026-10-03", sendOn: "2026-10-03" },
  "due tomorrow waits",
);
assert.equal(reminderDecision(car("2026-04-09T10:00:00+08:00", { leadDays: 7 }), morning).kind, "send", "seven days' notice sends a week early");
assert.equal(reminderDecision(car("2026-04-10T10:00:00+08:00", { leadDays: 7 }), morning).kind, "wait");
assert.equal(reminderDecision(car("2026-03-02T10:00:00+08:00", { intervalMonths: 7 }), morning).kind, "send", "a car's own interval is honoured");

// Due Sep 2, 30 days before Oct 2: still inside the catch-up window. Sep 1 is not.
assert.equal(reminderDecision(car("2026-03-02T10:00:00+08:00"), morning).kind, "send", "30 days overdue is still reminded");
assert.deepEqual(
  reminderDecision(car("2026-03-01T10:00:00+08:00"), morning),
  { kind: "skip", reason: "too-old", dueKey: "2026-09-01" },
  "31 days overdue is left for a person",
);

assert.deepEqual(reminderDecision(car(null), morning), { kind: "skip", reason: "no-history", dueKey: null });
assert.equal((reminderDecision(car("2026-04-02T10:00:00+08:00", { ownerOptedOut: true }), morning) as { reason: string }).reason, "opted-out");
assert.equal((reminderDecision(car("2026-04-02T10:00:00+08:00", { ownerPhone: "(082) 221 0000" }), morning) as { reason: string }).reason, "no-mobile");
assert.equal((reminderDecision(car("2026-04-02T10:00:00+08:00", { ownerPhone: "" }), morning) as { reason: string }).reason, "no-mobile");
assert.equal(
  (reminderDecision(car("2026-04-02T10:00:00+08:00", { ownerPhone: "", ownerOptedOut: true }), morning) as { reason: string }).reason,
  "opted-out",
  "the customer's wish is the reason shown first",
);

assert.equal(isSendingHour(at("2026-10-02T08:59:00+08:00")), false);
assert.equal(isSendingHour(at("2026-10-02T09:00:00+08:00")), true);
assert.equal(isSendingHour(at("2026-10-02T17:59:00+08:00")), true);
assert.equal(isSendingHour(at("2026-10-02T18:00:00+08:00")), false);
assert.equal(isSendingHour(at("2026-10-02T02:00:00Z")), true, "10am Manila, whatever this machine's timezone");

const values = { name: "Juan", vehicle: "Toyota Vios 2019", plate: "ABC 1234", due: "Oct 2, 2026", business: "AUTOBLITZ", link: "https://example.test/book/autoblitz" };
assert.equal(
  renderTemplate(DEFAULT_TEMPLATE_WITH_LINK, values),
  "Hi Juan, your Toyota Vios 2019 (ABC 1234) is due for service. Book at https://example.test/book/autoblitz or call us. AUTOBLITZ",
);
assert.equal(renderTemplate("Book at {link} today.", { ...values, link: "" }), "Book at today.", "an empty placeholder leaves no double space");
assert.deepEqual(unknownPlaceholders("Hi {nmae}, {plate} {nmae} {x}"), ["nmae", "x"]);
assert.deepEqual(unknownPlaceholders(DEFAULT_TEMPLATE_WITH_LINK), []);
assert.equal(effectiveTemplate("  ", true), DEFAULT_TEMPLATE_WITH_LINK);
assert.equal(effectiveTemplate(null, false), DEFAULT_TEMPLATE);
assert.equal(effectiveTemplate(" Custom ", false), "Custom");

assert.deepEqual(countSegments("a".repeat(160)), { segments: 1, characters: 160, unicode: false });
assert.equal(countSegments("a".repeat(161)).segments, 2, "161 plain characters is two texts");
assert.equal(countSegments("a".repeat(306)).segments, 2);
assert.equal(countSegments("a".repeat(307)).segments, 3);
assert.equal(countSegments("[]").characters, 4, "brackets cost two each");
assert.deepEqual(countSegments("a".repeat(69) + "ñ"), { segments: 1, characters: 70, unicode: false }, "ñ is in the GSM alphabet");
assert.equal(countSegments("a".repeat(70) + "’").unicode, true, "a curly quote forces Unicode");
assert.equal(countSegments("a".repeat(70) + "’").segments, 2, "…and 71 Unicode characters is two texts");
assert.equal(countSegments("").segments, 0);

assert.equal(toE164("0917 123 4567"), "+639171234567");
assert.equal(toE164("+63 917 123 4567"), "+639171234567");
assert.equal(toE164("(082) 221 0000"), null);

// How each outcome reads on the screen. With no provider, nothing may say "Sent".
const on = { automatic: true, providerConnected: false };
const off = { automatic: false, providerConnected: false };
const queuedStatus = describeReminder({ kind: "done", dueKey: "2026-10-02", status: "queued" }, on);
assert.equal(queuedStatus.label, "Not sent yet");
assert.match(queuedStatus.detail, /no SMS provider is connected/);
assert.equal(describeReminder({ kind: "done", dueKey: "2026-10-02", status: "sent" }, on).label, "Sent");
assert.equal(describeReminder({ kind: "send", dueKey: "2026-10-02" }, on).canSendByHand, false, "automatic will do it");
assert.equal(describeReminder({ kind: "send", dueKey: "2026-10-02" }, off).canSendByHand, true, "with automatic off a person can");
assert.match(describeReminder({ kind: "send", dueKey: "2026-10-02" }, off).detail, /automatic reminders are off/);
assert.equal(describeReminder({ kind: "wait", dueKey: "2026-10-12", sendOn: "2026-10-12" }, on).detail, "Will be texted on Oct 12, 2026.");
assert.equal(describeReminder({ kind: "wait", dueKey: "2026-10-12", sendOn: "2026-10-12" }, off).label, "Not due yet");
assert.equal(describeReminder({ kind: "skip", reason: "too-old", dueKey: "2026-06-01" }, on).canSendByHand, true);
for (const reason of ["opted-out", "no-mobile", "no-history"] as const) {
  const status = describeReminder({ kind: "skip", reason, dueKey: null }, on);
  assert.equal(status.label, "Won't be texted");
  assert.equal(status.canSendByHand, false);
  assert.ok(status.detail.length > 10, "every skip says why");
}

console.log("✓ rules: due dates, lead days, 30-day catch-up, skips, daytime window");
console.log("✓ status wording: one status and one reason per car");
console.log("✓ template, placeholders, segment counts, phone format");

// ---- Part two: the real sweep, on a throwaway business -----------------------

assert.equal(getSmsProvider(), null, "this rehearsal expects no provider; with one connected it would send real texts");

const mongo = await new MongoClient(process.env.MONGODB_URI!).connect();
const db = mongo.db(process.env.MONGODB_DB_NAME!);
const businessId = `SMS-CHECK-${randomUUID().slice(0, 8)}`;
const scoped = { businessId };

try {
  for (const index of TEXT_BLAST_INDEXES) {
    await db.collection(index.collection).createIndex(index.keys, index.options ?? {});
  }
  console.log(`✓ ${TEXT_BLAST_INDEXES.length} text blast indexes present on ${process.env.MONGODB_DB_NAME}`);

  await db.collection("businesses").insertOne({
    businessId,
    name: "Check Motors",
    meta: "Throwaway",
    onboarded: "",
    modules: ["bookings", "fleet", "sms"],
    status: "active",
  });

  const customer = (ref: string, phone: string, smsOptOut = false) => ({ ...scoped, ref, name: `Owner ${ref}`, phone, email: "", notes: "", smsOptOut, createdAt: new Date() });
  await db.collection("customers").insertMany([
    customer("CU-1", "0917 000 0001"),
    customer("CU-2", "0917 000 0002", true),
    customer("CU-3", "(082) 221 0000"),
  ]);

  const vehicle = (ref: string, customerRef: string) => ({ ...scoped, ref, customerRef, plate: `CHK ${ref}`, plateKey: `CHK${ref.replace("-", "")}`, make: "Test", model: "Car", year: 2020, colour: "", odometerKm: null, odometerAt: null, intervalMonths: 6, intervalKm: 5000, notes: "", createdAt: new Date() });
  await db.collection("vehicles").insertMany([
    vehicle("VH-1", "CU-1"), // due today
    vehicle("VH-2", "CU-2"), // due today, owner opted out
    vehicle("VH-3", "CU-3"), // due today, landline only
    vehicle("VH-4", "CU-1"), // due next month
    vehicle("VH-5", "CU-1"), // three months overdue
    vehicle("VH-6", "CU-1"), // no history
  ]);

  const service = (ref: string, vehicleRef: string, performedAt: string) => ({ ...scoped, ref, vehicleRef, performedAt: at(performedAt), odometerKm: null, work: "Check", source: "manual", createdAt: new Date() });
  await db.collection("serviceRecords").insertMany([
    service("SR-1", "VH-1", "2026-04-02T10:00:00+08:00"),
    service("SR-2", "VH-2", "2026-04-02T10:00:00+08:00"),
    service("SR-3", "VH-3", "2026-04-02T10:00:00+08:00"),
    service("SR-4", "VH-4", "2026-05-02T10:00:00+08:00"),
    service("SR-5", "VH-5", "2026-01-02T10:00:00+08:00"),
  ]);

  const count = (filter: object = {}) => db.collection("smsMessages").countDocuments({ ...scoped, ...filter });

  const off = await runReminderSweep(businessId, morning);
  assert.equal(off.ran, false, "nothing runs until the switch is on");
  assert.equal(await count(), 0);

  await saveTextBlastSettings(businessId, { enabled: true, template: DEFAULT_TEMPLATE, leadDays: 0 });
  await assert.rejects(saveTextBlastSettings(businessId, { enabled: true, template: "Hi {nmae}", leadDays: 0 }), InputError, "a misspelt placeholder is refused");
  await assert.rejects(saveTextBlastSettings(businessId, { enabled: true, template: DEFAULT_TEMPLATE, leadDays: 31 }), InputError);

  const night = await runReminderSweep(businessId, at("2026-10-02T22:00:00+08:00"));
  assert.equal(night.ran, true);
  assert.equal(night.created, 0, "nothing is written at night");
  assert.equal(await count(), 0);

  const first = await runReminderSweep(businessId, morning);
  assert.equal(first.created, 1, "only the one car that is due, reachable and willing");
  assert.equal(first.sent, 0);
  assert.match(first.note, /no SMS provider/i);

  const second = await runReminderSweep(businessId, morning);
  assert.equal(second.created, 0, "a second run writes nothing");
  assert.equal(await count(), 1);

  const [message] = await listSmsMessages(businessId);
  assert.equal(message.vehicleRef, "VH-1");
  assert.equal(message.to, "+639170000001");
  assert.equal(message.status, "queued", "with no provider a text is queued…");
  assert.equal(await count({ status: "sent" }), 0, "…and never recorded as sent");
  assert.match(message.statusNote, /No SMS provider connected/);
  assert.equal(message.body, "Hi Owner CU-1, your Test Car 2020 (CHK VH-1) is due for service. Call us to book your visit. Check Motors");
  assert.equal(message.segments, 1);
  console.log("✓ sweep: off, night, one text per car per due date, queued and not sent");

  const rows = new Map((await listReminderRows(businessId, morning)).map((row) => [row.vehicleRef, row.outcome]));
  assert.deepEqual(rows.get("VH-1"), { kind: "done", dueKey: "2026-10-02", status: "queued" });
  assert.equal((rows.get("VH-2") as { reason: string }).reason, "opted-out");
  assert.equal((rows.get("VH-3") as { reason: string }).reason, "no-mobile");
  assert.equal(rows.get("VH-4")?.kind, "wait");
  assert.equal((rows.get("VH-5") as { reason: string }).reason, "too-old");
  assert.equal((rows.get("VH-6") as { reason: string }).reason, "no-history");

  await queueManualReminder(businessId, "VH-5", morning);
  assert.equal(await count({ kind: "manual" }), 1, "a person can still remind a long-overdue car");
  await assert.rejects(queueManualReminder(businessId, "VH-5", morning), InputError, "…but only once per due date");
  await assert.rejects(queueManualReminder(businessId, "VH-2", morning), InputError, "never someone who opted out");
  await assert.rejects(queueManualReminder(businessId, "VH-3", morning), InputError, "never without a mobile");
  await assert.rejects(queueManualReminder(businessId, "VH-6", morning), InputError);
  console.log("✓ manual reminders obey the same limits");

  await db.collection("smsMessages").updateOne({ ...scoped, vehicleRef: "VH-1" }, { $set: { createdAt: at("2026-09-17T10:00:00+08:00") } });
  const later = await runReminderSweep(businessId, morning);
  assert.equal(later.expired, 1, "a text queued for more than 14 days is retired");
  assert.equal(later.created, 0, "…and is not written again for the same due date");
  assert.equal(await count({ status: "expired" }), 1);

  const business = await db.collection("businesses").findOne({ businessId });
  assert.ok(business?.textBlast?.lastRunAt, "each run records when it ran");
  assert.match(business?.textBlast?.lastRunNote ?? "", /expired/);
  console.log("✓ stale queued texts expire; each run is recorded");
} finally {
  for (const name of ["smsMessages", "serviceRecords", "vehicles", "customers", "businesses"]) {
    await db.collection(name).deleteMany(scoped);
  }
  await mongo.close();
  await (await clientPromise).close();
}

console.log("✓ test records removed; no text was sent to anyone");
