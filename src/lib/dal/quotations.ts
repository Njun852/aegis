import "server-only";

import { formatStamp } from "@/lib/format";
import {
  descriptionKey,
  formatQuoteDay,
  isBlankLine,
  manilaDateKey,
  quoteSettingsOf,
  quoteTotals,
} from "@/lib/quotations";
import { businessesCollection } from "./db";
import { InputError, insertWithRef } from "./refs";
import { verifySession } from "./session";
import { tenantScope } from "./tenant";
import type {
  Quotation,
  QuotationConfig,
  QuotationDocument,
  QuotationInput,
  QuotationSettings,
  QuotationSummary,
  QuoteLine,
  QuotePriceItem,
  QuotePhotoDocument,
  QuotePhotoKind,
  QuotePhotoView,
  QuotePriceItemDocument,
  QuoteSection,
  QuoteSource,
} from "@/types";

/**
 * Quotations and the price list they feed. Both are tenant collections reached
 * only through `tenantScope`; the letterhead lives on the business record,
 * like the Text Blast settings.
 */
const quotations = () => tenantScope<QuotationDocument>("quotations");
const priceItems = () => tenantScope<QuotePriceItemDocument>("quotePriceItems");
const photos = () => tenantScope<QuotePhotoDocument>("quotePhotos");

function toQuotation(doc: QuotationDocument): Quotation {
  return {
    ref: doc.ref,
    status: doc.status,
    quoteDate: doc.quoteDate,
    quoteDay: formatQuoteDay(doc.quoteDate),
    drNumber: doc.drNumber,
    billTo: doc.billTo,
    vehicle: doc.vehicle,
    serviceAdvisor: doc.serviceAdvisor,
    technician: doc.technician,
    lines: doc.lines,
    discountCents: doc.discountCents,
    notes: doc.notes,
    source: doc.source,
    photoRef: doc.photoRef ?? null,
    totals: quoteTotals(doc.lines, doc.discountCents),
    sent: doc.sentAt ? formatStamp(doc.sentAt) : null,
    sentTo: doc.sentTo ?? null,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function toSummary(doc: QuotationDocument): QuotationSummary {
  const totals = quoteTotals(doc.lines, doc.discountCents);
  return {
    ref: doc.ref,
    status: doc.status,
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

/** Blank rows the editor keeps for typing into are not part of the document. */
function storedLines(lines: QuoteLine[]): QuoteLine[] {
  return lines.filter((line) => !isBlankLine(line));
}

export async function createQuotation(
  input: QuotationInput,
  options: { source?: QuoteSource; photoRef?: string } = {},
): Promise<string> {
  const { userId } = await verifySession();
  const collection = await quotations();
  const now = new Date();
  const lines = storedLines(input.lines);

  const ref = await insertWithRef(collection, "QT-", 1001, (next) =>
    collection.insertOne({
      ref: next,
      status: "Draft",
      quoteDate: input.quoteDate,
      drNumber: input.drNumber,
      billTo: input.billTo,
      vehicle: input.vehicle,
      serviceAdvisor: input.serviceAdvisor,
      technician: input.technician,
      lines,
      discountCents: input.discountCents,
      notes: input.notes,
      source: options.source ?? "manual",
      ...(options.photoRef ? { photoRef: options.photoRef } : {}),
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    }),
  );
  if ((options.source ?? "manual") === "manual") await rememberLines(lines);
  return ref;
}

/**
 * Saves the editor. A quotation that was already emailed stays Sent: the
 * screen says the customer has the earlier version until it is sent again.
 */
export async function updateQuotation(ref: string, input: QuotationInput): Promise<void> {
  const collection = await quotations();
  const lines = storedLines(input.lines);
  const result = await collection.updateOne(
    { ref },
    {
      $set: {
        quoteDate: input.quoteDate,
        drNumber: input.drNumber,
        billTo: input.billTo,
        vehicle: input.vehicle,
        serviceAdvisor: input.serviceAdvisor,
        technician: input.technician,
        lines,
        discountCents: input.discountCents,
        notes: input.notes,
        updatedAt: new Date(),
      },
    },
  );
  if (result.matchedCount === 0) throw new InputError(`${ref} is no longer on file.`);
  await rememberLines(lines);
}

export async function deleteQuotation(ref: string): Promise<void> {
  const collection = await quotations();
  const result = await collection.deleteOne({ ref });
  if (result.deletedCount === 0) throw new InputError(`${ref} is no longer on file.`);
}

/** Recorded only after the mail server accepted the message. */
export async function markQuotationSent(ref: string, to: string): Promise<void> {
  const collection = await quotations();
  const now = new Date();
  await collection.updateOne(
    { ref },
    { $set: { status: "Sent", sentAt: now, sentTo: to, updatedAt: now } },
  );
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
  };
  if (typeof logo === "string") set["quotation.logo"] = logo;
  await businesses.updateOne(
    { businessId: activeBusinessId },
    { $set: set, ...(logo === null ? { $unset: { "quotation.logo": "" } } : {}) },
  );
}
