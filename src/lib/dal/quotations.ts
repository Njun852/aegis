import "server-only";

import { formatStamp } from "@/lib/format";
import {
  DEFAULT_VALID_DAYS,
  addDays,
  approvedLinesOf,
  belowCostLines,
  descriptionKey,
  effectiveStatus,
  formatManilaStamp,
  formatPeso,
  formatQuoteDay,
  hasLeftShop,
  isBlankLine,
  manilaDateKey,
  quoteSettingsOf,
  quoteTotals,
  specialPricingKey,
} from "@/lib/quotations";
import { businessesCollection } from "./db";
import { InputError, insertWithRef, isDuplicateKey } from "./refs";
import { verifySession } from "./session";
import { tenantScope } from "./tenant";
import { findUserById } from "./users";
import type {
  BookingQuoteLink,
  JobOrderDocument,
  Quotation,
  QuotationConfig,
  QuotationDocument,
  QuotationInput,
  QuotationRevisionDocument,
  QuotationRevisionSummary,
  QuotationSettings,
  QuotationSummary,
  QuoteActor,
  QuoteContent,
  QuoteEvent,
  QuoteEventDocument,
  QuoteEventKind,
  QuoteLine,
  QuotePriceItem,
  QuotePhotoDocument,
  QuotePhotoKind,
  QuotePhotoView,
  QuotePriceItemDocument,
  QuoteResponseDocument,
  QuoteSection,
  QuoteSource,
  UserRole,
} from "@/types";

/**
 * Quotations and the price list they feed. Both are tenant collections reached
 * only through `tenantScope`; the letterhead lives on the business record,
 * like the Text Blast settings.
 *
 * Nothing a customer could have seen is overwritten. A Draft is edited in
 * place, with each save logged; once a quotation has left the shop, changing
 * it first copies the version the customer holds into `quotationRevisions`,
 * then carries on as the next revision, a Draft again.
 */
const quotations = () => tenantScope<QuotationDocument>("quotations");
const revisions = () => tenantScope<QuotationRevisionDocument>("quotationRevisions");
const events = () => tenantScope<QuoteEventDocument>("quoteEvents");
const jobOrders = () => tenantScope<JobOrderDocument>("jobOrders");
const priceItems = () => tenantScope<QuotePriceItemDocument>("quotePriceItems");
const photos = () => tenantScope<QuotePhotoDocument>("quotePhotos");

/** The signed-in person, by the name they have now, for the log and the records that name them. */
export async function currentQuoteActor(): Promise<QuoteActor & { role: UserRole }> {
  const { userId, role } = await verifySession();
  const user = await findUserById(userId);
  return { userId, name: user?.name || user?.username || "Unknown user", role };
}

function actorOf(actor: QuoteActor): QuoteActor {
  return { userId: actor.userId, name: actor.name };
}

/** Quotations made before validity was recorded run from their date for the default period. */
function validUntilOf(doc: Pick<QuotationDocument, "validUntil" | "quoteDate">): string {
  return doc.validUntil ?? addDays(doc.quoteDate, DEFAULT_VALID_DAYS);
}

function todayKey(): string {
  return manilaDateKey(new Date());
}

function toQuotation(doc: QuotationDocument): Quotation {
  const validUntil = validUntilOf(doc);
  return {
    ref: doc.ref,
    revision: doc.revision ?? 1,
    status: effectiveStatus(doc.status, validUntil, todayKey()),
    quoteDate: doc.quoteDate,
    quoteDay: formatQuoteDay(doc.quoteDate),
    validUntil,
    drNumber: doc.drNumber,
    bookingRef: doc.bookingRef ?? null,
    billTo: doc.billTo,
    vehicle: doc.vehicle,
    serviceAdvisor: doc.serviceAdvisor,
    technician: doc.technician,
    lines: doc.lines,
    discountCents: doc.discountCents,
    discountReason: doc.discountReason ?? "",
    notes: doc.notes,
    source: doc.source,
    photoRef: doc.photoRef ?? null,
    totals: quoteTotals(doc.lines, doc.discountCents),
    sent: doc.sentAt ? formatStamp(doc.sentAt) : null,
    sentTo: doc.sentTo ?? null,
    preparedBy: doc.preparedBy ?? null,
    pricingApproval: doc.pricingApproval
      ? { ...doc.pricingApproval, at: formatStamp(doc.pricingApproval.at) }
      : null,
    response: doc.response
      ? {
          ...doc.response,
          at: formatManilaStamp(doc.response.at),
          recordedAt: formatStamp(doc.response.recordedAt),
        }
      : null,
    jobOrderRef: doc.jobOrderRef ?? null,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function toSummary(doc: QuotationDocument): QuotationSummary {
  const totals = quoteTotals(doc.lines, doc.discountCents);
  return {
    ref: doc.ref,
    revision: doc.revision ?? 1,
    status: effectiveStatus(doc.status, validUntilOf(doc), todayKey()),
    quoteDay: formatQuoteDay(doc.quoteDate),
    quoteDate: doc.quoteDate,
    customer: doc.billTo.name,
    company: doc.billTo.company,
    plate: doc.vehicle.plate,
    makeModel: doc.vehicle.makeModel,
    totalCents: totals.totalCents,
    unpricedCount: totals.unpricedCount,
    source: doc.source,
    sent: doc.sentAt ? formatStamp(doc.sentAt) : null,
    bookingRef: doc.bookingRef ?? null,
    jobOrderRef: doc.jobOrderRef ?? null,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export async function listQuotationSummaries(): Promise<QuotationSummary[]> {
  const collection = await quotations();
  const docs = await collection.find().sort({ updatedAt: -1 }).toArray();
  return docs.map(toSummary);
}

/** One quotation, or null when the ref is not this business's. */
export async function findQuotation(ref: string): Promise<Quotation | null> {
  const collection = await quotations();
  const doc = await collection.findOne({ ref });
  return doc ? toQuotation(doc) : null;
}

async function requireDocument(ref: string): Promise<QuotationDocument> {
  const collection = await quotations();
  const doc = await collection.findOne({ ref });
  if (!doc) throw new InputError(`${ref} is no longer on file.`);
  return doc;
}

/**
 * Matches the revision a change was based on. Older quotations have no
 * revision field, and read as 1.
 */
function atRevision(doc: QuotationDocument) {
  return doc.revision ? { ref: doc.ref, revision: doc.revision } : { ref: doc.ref, revision: { $exists: false } };
}

const RACE = "Someone else changed this quotation at the same moment. Reload it and try again.";

/** Blank rows the editor keeps for typing into are not part of the document. */
function storedLines(lines: QuoteLine[]): QuoteLine[] {
  return lines.filter((line) => !isBlankLine(line));
}

function contentOf(doc: QuotationDocument): QuoteContent {
  return {
    quoteDate: doc.quoteDate,
    validUntil: validUntilOf(doc),
    drNumber: doc.drNumber,
    bookingRef: doc.bookingRef ?? null,
    billTo: doc.billTo,
    vehicle: doc.vehicle,
    serviceAdvisor: doc.serviceAdvisor,
    technician: doc.technician,
    lines: doc.lines,
    discountCents: doc.discountCents,
    discountReason: doc.discountReason ?? "",
    notes: doc.notes,
  };
}

function contentFromInput(input: QuotationInput, lines: QuoteLine[]): QuoteContent {
  return {
    quoteDate: input.quoteDate,
    validUntil: input.validUntil,
    drNumber: input.drNumber,
    bookingRef: input.bookingRef,
    billTo: input.billTo,
    vehicle: input.vehicle,
    serviceAdvisor: input.serviceAdvisor,
    technician: input.technician,
    lines,
    discountCents: input.discountCents,
    discountReason: input.discountReason,
    notes: input.notes,
  };
}

// ---- The change log ------------------------------------------------------------

async function logEvent(
  quotationRef: string,
  revision: number,
  kind: QuoteEventKind,
  detail: string,
  by: QuoteActor,
): Promise<void> {
  const collection = await events();
  await collection.insertOne({ quotationRef, revision, kind, detail, by: actorOf(by), at: new Date() });
}

export async function listQuoteEvents(quotationRef: string): Promise<QuoteEvent[]> {
  const collection = await events();
  const docs = await collection.find({ quotationRef }).sort({ at: -1 }).limit(200).toArray();
  return docs.map((doc) => ({
    revision: doc.revision,
    kind: doc.kind,
    detail: doc.detail,
    by: doc.by.name,
    at: formatStamp(doc.at),
  }));
}

/** "Discount set to ₱500.00 (loyal customer)", or null when neither the amount nor the reason moved. */
function describeDiscountChange(
  before: { cents: number; reason: string },
  after: { cents: number; reason: string },
): string | null {
  const why = after.reason ? ` (${after.reason})` : "";
  if (before.cents === after.cents) {
    if (after.cents === 0 || before.reason === after.reason) return null;
    return `Discount reason changed to “${after.reason || "none"}”.`;
  }
  if (after.cents === 0) return `Discount of ${formatPeso(before.cents)} removed.`;
  if (before.cents === 0) return `Discount set to ${formatPeso(after.cents)}${why}.`;
  return `Discount changed from ${formatPeso(before.cents)} to ${formatPeso(after.cents)}${why}.`;
}

function totalChange(beforeCents: number, afterCents: number): string {
  return beforeCents === afterCents
    ? `total unchanged at ${formatPeso(afterCents)}`
    : `total ${formatPeso(beforeCents)} → ${formatPeso(afterCents)}`;
}

// ---- Writing quotations --------------------------------------------------------

export async function createQuotation(
  input: QuotationInput,
  options: { source?: QuoteSource; photoRef?: string } = {},
): Promise<string> {
  const actor = await currentQuoteActor();
  const collection = await quotations();
  const now = new Date();
  const lines = storedLines(input.lines);

  const ref = await insertWithRef(collection, "QT-", 1001, (next) =>
    collection.insertOne({
      ref: next,
      revision: 1,
      status: "Draft",
      quoteDate: input.quoteDate,
      validUntil: input.validUntil,
      drNumber: input.drNumber,
      bookingRef: input.bookingRef,
      billTo: input.billTo,
      vehicle: input.vehicle,
      serviceAdvisor: input.serviceAdvisor,
      technician: input.technician,
      lines,
      discountCents: input.discountCents,
      discountReason: input.discountReason,
      notes: input.notes,
      source: options.source ?? "manual",
      ...(options.photoRef ? { photoRef: options.photoRef } : {}),
      createdBy: actor.userId,
      preparedBy: actorOf(actor),
      createdAt: now,
      updatedAt: now,
    }),
  );

  const total = quoteTotals(lines, input.discountCents).totalCents;
  await logEvent(
    ref,
    1,
    "created",
    `Prepared by ${actor.name}${options.source === "photo" ? " from a photo" : ""}${
      input.bookingRef ? ` for booking ${input.bookingRef}` : ""
    }; total ${formatPeso(total)}.`,
    actor,
  );
  const discount = describeDiscountChange({ cents: 0, reason: "" }, { cents: input.discountCents, reason: input.discountReason });
  if (discount) await logEvent(ref, 1, "discount", discount, actor);

  if ((options.source ?? "manual") === "manual") await rememberLines(lines);
  return ref;
}

/**
 * Saves the editor. A Draft is changed in place. A quotation that has left
 * the shop keeps the version the customer holds as a revision of its own,
 * and this becomes the next one, a Draft until it is sent again. Once a job
 * order has been made from it, it does not change at all.
 */
export async function updateQuotation(
  ref: string,
  input: QuotationInput,
): Promise<{ revision: number; revised: boolean }> {
  const actor = await currentQuoteActor();
  const doc = await requireDocument(ref);
  if (doc.jobOrderRef) {
    throw new InputError(`${ref} became job order ${doc.jobOrderRef} and can no longer be changed.`);
  }

  const collection = await quotations();
  const lines = storedLines(input.lines);
  const content = contentFromInput(input, lines);
  const now = new Date();
  const revision = doc.revision ?? 1;
  const before = quoteTotals(doc.lines, doc.discountCents).totalCents;
  const after = quoteTotals(lines, input.discountCents).totalCents;

  // Saving what is already stored changes nothing and logs nothing.
  if (JSON.stringify(contentOf(doc)) === JSON.stringify(content)) {
    return { revision, revised: false };
  }

  let next = revision;
  if (hasLeftShop(doc.status)) {
    const history = await revisions();
    try {
      await history.insertOne({
        quotationRef: ref,
        revision,
        content: contentOf(doc),
        status: doc.status,
        ...(doc.sentAt ? { sentAt: doc.sentAt } : {}),
        ...(doc.sentTo ? { sentTo: doc.sentTo } : {}),
        ...(doc.preparedBy ? { preparedBy: doc.preparedBy } : {}),
        pricingApproval: doc.pricingApproval ?? null,
        response: doc.response ?? null,
        supersededAt: now,
        supersededBy: actorOf(actor),
      });
    } catch (error) {
      if (isDuplicateKey(error)) throw new InputError(RACE);
      throw error;
    }
    next = revision + 1;
    const result = await collection.updateOne(atRevision(doc), {
      $set: { ...content, revision: next, status: "Draft", updatedAt: now },
      // The answer and the sending belong to the version they were given for,
      // which the revision just written keeps. The pricing approval stays: it
      // is tied to exact figures and lapses by itself if they changed.
      $unset: { sentAt: "", sentTo: "", response: "" },
    });
    if (result.matchedCount === 0) throw new InputError(RACE);
    await logEvent(
      ref,
      next,
      "revised",
      `Revision ${next} started; revision ${revision} (${doc.status}) kept as it was. ${capitalise(totalChange(before, after))}.`,
      actor,
    );
  } else {
    const result = await collection.updateOne(atRevision(doc), { $set: { ...content, updatedAt: now } });
    if (result.matchedCount === 0) throw new InputError(RACE);
    await logEvent(ref, revision, "saved", `Draft saved; ${totalChange(before, after)}.`, actor);
  }

  const discount = describeDiscountChange(
    { cents: doc.discountCents, reason: doc.discountReason ?? "" },
    { cents: input.discountCents, reason: input.discountReason },
  );
  if (discount) await logEvent(ref, next, "discount", discount, actor);

  await rememberLines(lines);
  return { revision: next, revised: next !== revision };
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Only a first draft nobody outside the shop has seen can be deleted. Anything
 * sent is part of the record; a quotation that is no longer wanted is left
 * Declined or to expire.
 */
export async function deleteQuotation(ref: string): Promise<void> {
  const doc = await requireDocument(ref);
  if (doc.status !== "Draft" || (doc.revision ?? 1) > 1 || doc.sentAt || doc.jobOrderRef) {
    throw new InputError(`${ref} has been sent, so it stays on file. Record it as declined instead.`);
  }
  const collection = await quotations();
  const result = await collection.deleteOne({ ref, status: "Draft" });
  if (result.deletedCount === 0) throw new InputError(`${ref} is no longer on file.`);
  await (await events()).deleteMany({ quotationRef: ref });
}

/**
 * Recorded only after the mail server accepted the message, or when a person
 * says they handed it over. A quotation the customer has already answered
 * keeps its answer: sending them a copy does not reopen it.
 */
export async function markQuotationSent(ref: string, to: string, how: "email" | "hand"): Promise<void> {
  const actor = await currentQuoteActor();
  const doc = await requireDocument(ref);
  const collection = await quotations();
  const now = new Date();
  await collection.updateOne(
    { ref },
    { $set: { status: doc.status === "Draft" ? "Sent" : doc.status, sentAt: now, sentTo: to, updatedAt: now } },
  );
  const total = formatPeso(quoteTotals(doc.lines, doc.discountCents).totalCents);
  await logEvent(
    ref,
    doc.revision ?? 1,
    "sent",
    how === "email" ? `Emailed to ${to} with the PDF; total ${total}.` : `Given to the customer: ${to}; total ${total}.`,
    actor,
  );
}

// ---- Special pricing -------------------------------------------------------------

/**
 * An administrator signs off the discount and any line below cost. `seenKey`
 * is the pricing the approver was looking at: if it changed under them, they
 * approve nothing.
 */
export async function approveSpecialPricing(ref: string, seenKey: string): Promise<void> {
  const actor = await currentQuoteActor();
  const doc = await requireDocument(ref);
  if (doc.jobOrderRef) throw new InputError(`${ref} is already job order ${doc.jobOrderRef}.`);
  const key = specialPricingKey(doc.lines, doc.discountCents);
  if (!key) throw new InputError("There is no discount or below-cost line to approve. Save the quotation first.");
  if (key !== seenKey) throw new InputError("The pricing changed since this screen was loaded. Reload it and check again.");
  if (doc.pricingApproval?.key === key) return;

  const below = belowCostLines(doc.lines);
  const collection = await quotations();
  const result = await collection.updateOne(atRevision(doc), {
    $set: {
      pricingApproval: {
        key,
        by: actorOf(actor),
        at: new Date(),
        discountCents: doc.discountCents,
        belowCostLines: below.length,
      },
    },
  });
  if (result.matchedCount === 0) throw new InputError(RACE);

  const parts = [
    doc.discountCents > 0
      ? `discount of ${formatPeso(doc.discountCents)}${doc.discountReason ? ` (${doc.discountReason})` : ""}`
      : "",
    ...below.map((line) => `“${line.description}” at ${formatPeso(line.unitPriceCents ?? 0)}, below its cost of ${formatPeso(line.costCents ?? 0)}`),
  ].filter(Boolean);
  await logEvent(ref, doc.revision ?? 1, "pricing-approved", `Special pricing approved: ${parts.join("; ")}.`, actor);
}

// ---- The customer's answer -------------------------------------------------------

export interface ResponseInput {
  outcome: QuoteResponseDocument["outcome"];
  at: Date;
  customerName: string;
  method: QuoteResponseDocument["method"];
  note: string;
  approvedLineIds: string[];
  approvedDiscountCents: number;
}

/**
 * Records what the customer said to the version they were given. The
 * approved amount is worked out here from the stored lines, not taken from
 * the browser.
 */
export async function recordQuoteResponse(ref: string, input: ResponseInput): Promise<void> {
  const actor = await currentQuoteActor();
  const doc = await requireDocument(ref);
  if (doc.jobOrderRef) throw new InputError(`${ref} is already job order ${doc.jobOrderRef}.`);
  if (doc.status === "Draft") {
    throw new InputError("Email the quotation or mark it as given to the customer before recording their answer.");
  }
  if (doc.status !== "Sent") {
    throw new InputError(`The answer to this revision is already recorded as ${doc.status}. Clear it first to change it.`);
  }

  const priced = doc.lines.filter((line) => line.unitPriceCents !== null);
  const pricedIds = new Set(priced.map((line) => line.id));
  const chosen = [...new Set(input.approvedLineIds)].filter((id) => pricedIds.has(id));
  if (chosen.length !== new Set(input.approvedLineIds).size) {
    throw new InputError("A ticked line is no longer on this quotation. Reload it and try again.");
  }

  let approvedIds: string[];
  let discount: number;
  if (input.outcome === "Approved") {
    approvedIds = priced.map((line) => line.id);
    discount = doc.discountCents;
  } else if (input.outcome === "Declined") {
    approvedIds = [];
    discount = 0;
  } else {
    if (chosen.length === 0) throw new InputError("Tick the lines the customer agreed to.");
    if (chosen.length === priced.length) {
      throw new InputError("Every line is ticked. Record it as Approved instead.");
    }
    approvedIds = chosen;
    discount = input.approvedDiscountCents;
    if (discount > doc.discountCents) {
      throw new InputError(`The discount on the approved work cannot be more than the quotation's ${formatPeso(doc.discountCents)}.`);
    }
  }
  const approved = quoteTotals(approvedLinesOf(doc.lines, approvedIds), 0);
  if (discount > approved.subtotalCents) {
    throw new InputError("The discount is larger than the approved work.");
  }
  const approvedTotal = approved.subtotalCents - discount;

  if (input.at.getTime() > Date.now() + 5 * 60_000) {
    throw new InputError("The time the customer answered cannot be in the future.");
  }
  if (manilaDateKey(input.at) < doc.quoteDate) {
    throw new InputError("The customer cannot have answered before the quotation's date.");
  }

  const now = new Date();
  const response: QuoteResponseDocument = {
    outcome: input.outcome,
    at: input.at,
    customerName: input.customerName,
    method: input.method,
    note: input.note,
    approvedLineIds: approvedIds,
    approvedDiscountCents: discount,
    approvedTotalCents: approvedTotal,
    recordedBy: actorOf(actor),
    recordedAt: now,
  };
  const collection = await quotations();
  const result = await collection.updateOne(
    { ...atRevision(doc), status: "Sent" },
    { $set: { status: input.outcome, response, updatedAt: now } },
  );
  if (result.matchedCount === 0) throw new InputError(RACE);

  const full = quoteTotals(doc.lines, doc.discountCents).totalCents;
  const verb =
    input.outcome === "Approved" ? "approved" : input.outcome === "Declined" ? "declined" : "partly approved";
  const amount =
    input.outcome === "Declined"
      ? `Quoted ${formatPeso(full)}.`
      : `Approved ${formatPeso(approvedTotal)} of ${formatPeso(full)} (${approvedIds.length} of ${priced.length} lines${
          discount ? `, ${formatPeso(discount)} discount` : ""
        }).`;
  await logEvent(
    ref,
    doc.revision ?? 1,
    "response",
    `${input.customerName} ${verb} on ${formatManilaStamp(input.at)}, ${input.method.toLowerCase()}. ${amount}${
      input.note ? ` Note: ${input.note}` : ""
    }`,
    actor,
  );
}

/** Undoes an answer recorded by mistake, while nothing has been made from it. */
export async function clearQuoteResponse(ref: string): Promise<void> {
  const actor = await currentQuoteActor();
  const doc = await requireDocument(ref);
  if (doc.jobOrderRef) throw new InputError(`${ref} is already job order ${doc.jobOrderRef}; its approval stands.`);
  if (!doc.response) throw new InputError("No answer is recorded for this revision.");
  const collection = await quotations();
  const result = await collection.updateOne(atRevision(doc), {
    $set: { status: "Sent", updatedAt: new Date() },
    $unset: { response: "" },
  });
  if (result.matchedCount === 0) throw new InputError(RACE);
  await logEvent(
    ref,
    doc.revision ?? 1,
    "response-cleared",
    `Recorded answer cleared (was ${doc.response.outcome} by ${doc.response.customerName}, recorded by ${doc.response.recordedBy.name}).`,
    actor,
  );
}

// ---- Revisions -------------------------------------------------------------------

export async function listRevisionSummaries(quotationRef: string): Promise<QuotationRevisionSummary[]> {
  const collection = await revisions();
  const docs = await collection.find({ quotationRef }).sort({ revision: -1 }).toArray();
  return docs.map((doc) => ({
    revision: doc.revision,
    status: doc.status,
    totalCents: quoteTotals(doc.content.lines, doc.content.discountCents).totalCents,
    sent: doc.sentAt ? formatStamp(doc.sentAt) : null,
    sentTo: doc.sentTo ?? null,
    response: doc.response?.outcome ?? null,
    superseded: formatStamp(doc.supersededAt),
    supersededBy: doc.supersededBy.name,
  }));
}

/**
 * An earlier revision as a quotation, for its PDF. The current record lends
 * only what never changes between revisions (the ref, the source, the photo).
 */
export async function findQuotationRevision(ref: string, revision: number): Promise<Quotation | null> {
  const doc = await (await quotations()).findOne({ ref });
  if (!doc) return null;
  if ((doc.revision ?? 1) === revision) return toQuotation(doc);
  const old = await (await revisions()).findOne({ quotationRef: ref, revision });
  if (!old) return null;
  return toQuotation({
    ...doc,
    ...old.content,
    revision: old.revision,
    status: old.status,
    sentAt: old.sentAt,
    sentTo: old.sentTo,
    preparedBy: old.preparedBy ?? doc.preparedBy,
    pricingApproval: old.pricingApproval ?? null,
    response: old.response ?? null,
    jobOrderRef: null,
  });
}

// ---- Bookings --------------------------------------------------------------------

/** The quotations made for each booking, for the bookings screen. */
export async function listQuotationsByBooking(): Promise<Record<string, BookingQuoteLink[]>> {
  const collection = await quotations();
  const docs = await collection
    .find({ bookingRef: { $type: "string" } })
    .sort({ createdAt: -1 })
    .toArray();
  const today = todayKey();
  const byBooking: Record<string, BookingQuoteLink[]> = {};
  for (const doc of docs) {
    const key = doc.bookingRef as string;
    (byBooking[key] ??= []).push({
      ref: doc.ref,
      status: effectiveStatus(doc.status, validUntilOf(doc), today),
      jobOrderRef: doc.jobOrderRef ?? null,
    });
  }
  return byBooking;
}

// ---- Job orders ------------------------------------------------------------------

/**
 * Makes the job order from the approved lines of the current revision. Safe
 * to repeat: the unique index allows one job order per quotation, and a
 * second request gets the first one back.
 */
export async function convertToJobOrder(ref: string): Promise<{ jobOrderRef: string; created: boolean; doc: QuotationDocument }> {
  const actor = await currentQuoteActor();
  const doc = await requireDocument(ref);
  const orders = await jobOrders();

  const existing = doc.jobOrderRef ? { ref: doc.jobOrderRef } : await orders.findOne({ quotationRef: ref });
  if (existing) {
    if (!doc.jobOrderRef) await (await quotations()).updateOne({ ref }, { $set: { jobOrderRef: existing.ref } });
    return { jobOrderRef: existing.ref, created: false, doc };
  }

  if (doc.status !== "Approved" && doc.status !== "Partially Approved") {
    throw new InputError("Only a quotation the customer approved, in full or in part, becomes a job order.");
  }
  const response = doc.response;
  if (!response) throw new InputError("The customer's approval is not recorded on this quotation.");
  const lines = approvedLinesOf(doc.lines, response.approvedLineIds);
  if (lines.length === 0) throw new InputError("No approved lines to carry onto a job order.");

  const now = new Date();
  let jobOrderRef: string;
  try {
    jobOrderRef = await insertWithRef(orders, "JO-", 1001, (next) =>
      orders.insertOne({
        ref: next,
        quotationRef: ref,
        quotationRevision: doc.revision ?? 1,
        bookingRef: doc.bookingRef ?? null,
        status: "Open",
        billTo: doc.billTo,
        vehicle: doc.vehicle,
        serviceAdvisor: doc.serviceAdvisor,
        technician: doc.technician,
        lines: lines.map((line) => ({
          id: line.id,
          section: line.section,
          description: line.description,
          qty: line.qty,
          unit: line.unit,
          unitPriceCents: line.unitPriceCents ?? 0,
          quotedCostCents: line.costCents,
          actualCostCents: null,
          sku: line.sku ?? null,
        })),
        discountCents: response.approvedDiscountCents,
        approvedTotalCents: response.approvedTotalCents,
        approvedAt: response.at,
        approvedByCustomer: response.customerName,
        invoiceRef: null,
        createdBy: actorOf(actor),
        createdAt: now,
        updatedAt: now,
      }),
    );
  } catch (error) {
    // Two clicks at once: the other request made it, and this one returns it.
    if (!isDuplicateKey(error, "quotationRef")) throw error;
    const winner = await orders.findOne({ quotationRef: ref });
    if (!winner) throw error;
    return { jobOrderRef: winner.ref, created: false, doc };
  }

  await (await quotations()).updateOne({ ref }, { $set: { jobOrderRef, updatedAt: now } });
  await logEvent(
    ref,
    doc.revision ?? 1,
    "converted",
    `Job order ${jobOrderRef} made from revision ${doc.revision ?? 1}: ${lines.length} approved ${
      lines.length === 1 ? "line" : "lines"
    }, ${formatPeso(response.approvedTotalCents)}.`,
    actor,
  );
  return { jobOrderRef, created: true, doc };
}

/** Adds a line to the quotation's log from outside this file, such as the booking value following a job order. */
export async function noteOnQuotation(ref: string, revision: number, detail: string): Promise<void> {
  await logEvent(ref, revision, "converted", detail, await currentQuoteActor());
}

// ---- Price list ---------------------------------------------------------------

function toPriceItem(doc: QuotePriceItemDocument): QuotePriceItem {
  return {
    section: doc.section,
    description: doc.description,
    unit: doc.unit,
    unitPriceCents: doc.unitPriceCents,
    costCents: doc.costCents,
    useCount: doc.useCount,
    lastUsedDay: formatQuoteDay(doc.lastUsedAt.toISOString().slice(0, 10)),
  };
}

export async function listPriceItems(): Promise<QuotePriceItem[]> {
  const collection = await priceItems();
  const docs = await collection
    .find()
    .sort({ useCount: -1, description: 1 })
    .limit(1000)
    .toArray();
  return docs.map(toPriceItem);
}

/**
 * Writes each priced line to the price list, so the next quotation offers it
 * at the price it was last given. One entry per wording: the latest price
 * wins and the count says how often it has been quoted.
 *
 * Lines read off a photo are not remembered until a person saves the draft,
 * which is the point at which someone has looked at them.
 */
async function rememberLines(lines: QuoteLine[]): Promise<void> {
  const priced = lines.filter(
    (line) => line.unitPriceCents !== null && descriptionKey(line.description) !== "",
  );
  if (priced.length === 0) return;

  const collection = await priceItems();
  const now = new Date();
  // The same wording twice on one quotation counts once, at its last price.
  const byKey = new Map<string, QuoteLine>();
  for (const line of priced) byKey.set(`${line.section}:${descriptionKey(line.description)}`, line);

  await Promise.all(
    [...byKey.values()].map((line) =>
      collection.updateOne(
        { section: line.section, key: descriptionKey(line.description) },
        {
          $set: {
            description: line.description.trim(),
            unit: line.unit.trim(),
            unitPriceCents: line.unitPriceCents,
            // A typed cost replaces the remembered one; a blank keeps it, so a
            // quotation priced from the list does not erase what it cost.
            ...(line.costCents !== null ? { costCents: line.costCents } : {}),
            lastUsedAt: now,
          },
          $inc: { useCount: 1 },
          $setOnInsert: {
            createdAt: now,
            ...(line.costCents === null ? { costCents: null } : {}),
          },
        },
        { upsert: true },
      ),
    ),
  );
}

export async function updatePriceItem(
  section: QuoteSection,
  description: string,
  fields: { unit: string; unitPriceCents: number; costCents: number | null },
): Promise<void> {
  const collection = await priceItems();
  const result = await collection.updateOne(
    { section, key: descriptionKey(description) },
    { $set: { unit: fields.unit, unitPriceCents: fields.unitPriceCents, costCents: fields.costCents } },
  );
  if (result.matchedCount === 0) throw new InputError(`“${description}” is no longer on the price list.`);
}

export async function deletePriceItem(section: QuoteSection, description: string): Promise<void> {
  const collection = await priceItems();
  await collection.deleteOne({ section, key: descriptionKey(description) });
}

// ---- Photos -------------------------------------------------------------------

/** Photos that reached the model since midnight in Manila. What the daily cap counts. */
export async function countBilledPhotosToday(now = new Date()): Promise<number> {
  const collection = await photos();
  const midnight = new Date(`${manilaDateKey(now)}T00:00:00+08:00`);
  return collection.countDocuments({ billed: true, createdAt: { $gte: midnight } });
}

export async function savePhoto(input: {
  sha256: string;
  dataUrl: string;
  bytes: number;
  billed: boolean;
  kind: QuotePhotoKind | null;
  note: string;
}): Promise<string> {
  const { userId } = await verifySession();
  const collection = await photos();
  return insertWithRef(collection, "QP-", 1001, (ref) =>
    collection.insertOne({
      ref,
      ...input,
      quotationRef: null,
      createdBy: userId,
      createdAt: new Date(),
    }),
  );
}

export async function linkPhoto(ref: string, quotationRef: string): Promise<void> {
  const collection = await photos();
  await collection.updateOne({ ref }, { $set: { quotationRef } });
}

/** The image itself, for the photo route. Null when the ref is not this business's. */
export async function readPhotoImage(ref: string): Promise<{ dataUrl: string } | null> {
  const collection = await photos();
  const doc = await collection.findOne({ ref });
  return doc ? { dataUrl: doc.dataUrl } : null;
}

export async function findPhotoView(ref: string): Promise<QuotePhotoView | null> {
  const collection = await photos();
  const doc = await collection.findOne({ ref });
  return doc ? { ref: doc.ref, note: doc.note } : null;
}

// ---- Letterhead -----------------------------------------------------------------

export async function readQuotationSettings(): Promise<QuotationSettings> {
  const { activeBusinessId } = await verifySession();
  const businesses = await businessesCollection();
  const doc = await businesses.findOne(
    { businessId: activeBusinessId },
    { projection: { quotation: 1 } },
  );
  return quoteSettingsOf(doc?.quotation);
}

/**
 * The logo is replaced only when one is passed: `undefined` keeps it, `null`
 * removes it, so saving the text fields never has to resend the image.
 */
export async function saveQuotationSettings(
  input: Omit<QuotationConfig, "logo">,
  logo: string | null | undefined,
): Promise<void> {
  const { activeBusinessId } = await verifySession();
  const businesses = await businessesCollection();
  const set: Record<string, unknown> = {
    "quotation.address": input.address,
    "quotation.contact": input.contact,
    "quotation.notes": input.notes,
    "quotation.footer": input.footer,
    "quotation.markupPercent": input.markupPercent,
    "quotation.validDays": input.validDays ?? DEFAULT_VALID_DAYS,
  };
  if (typeof logo === "string") set["quotation.logo"] = logo;
  await businesses.updateOne(
    { businessId: activeBusinessId },
    { $set: set, ...(logo === null ? { $unset: { "quotation.logo": "" } } : {}) },
  );
}
