"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { AI_MONTHLY_TOKEN_BUDGET, isAiConfigured } from "@/lib/ai/client";
import { explainFailure } from "@/lib/ai/failures";
import { PHOTOS_PER_DAY, PHOTO_BUDGET_SHARE, isPhotoReadCached, readQuotePhoto } from "@/lib/ai/quote-photo";
import { tokensUsedThisMonth } from "@/lib/dal/ai";
import { requireModule } from "@/lib/dal/businesses";
import { isMailboxConfigured } from "@/lib/dal/mailbox";
import { findCustomer, findDuplicates } from "@/lib/dal/customers";
import { findVehicleByPlate, findVehicleOption } from "@/lib/dal/fleet";
import { getBooking, updateBookingDetails } from "@/lib/dal/bookings";
import {
  cancelJobOrder,
  findJobOrder,
  logJobEvent,
  returnJobOrderStock,
  stockTakeSummary,
  syncJobOrderWithQuotation,
  takeJobStock,
} from "@/lib/dal/job-orders";
import { notifyOwner } from "@/lib/dal/owner-alerts";
import { approvalNeededText, jobText, quoteAnsweredText, quoteSentText } from "@/lib/owner-alerts";
import {
  approveSpecialPricing,
  convertToJobOrder,
  countBilledPhotosToday,
  createQuotation,
  currentQuoteActor,
  deletePriceItem,
  deleteQuotation,
  findQuotation,
  linkPhoto,
  listPriceItems,
  markQuotationSent,
  noteOnQuotation,
  clearQuoteResponse,
  recordQuoteResponse,
  readQuotationSettings,
  savePhoto,
  removeQuoteSigner,
  saveQuoteSigner,
  saveQuotationSettings,
  updatePriceItem,
  updateQuotation,
} from "@/lib/dal/quotations";
import { InputError } from "@/lib/dal/refs";
import { hasCapability } from "@/lib/dal/session";
import { explainSendFailure } from "@/lib/mail/failures";
import { sendMail } from "@/lib/mail/ingest";
import { quotePdfFilename, renderQuotePdf } from "@/lib/quote-pdf";
import { describeRead, draftLinesFromRead } from "@/lib/quote-photo";
import { applyCostSources } from "@/lib/quote-costing";
import { listCostSources } from "@/lib/dal/quote-costing";
import {
  MAX_AMOUNT_CENTS,
  MAX_LINES,
  MAX_QTY,
  MAX_SIGNATURE_CHARS,
  MAX_VALID_DAYS,
  QUOTE_HANDOVER_METHODS,
  QUOTE_RESPONSE_METHODS,
  addDays,
  discountFromPercent,
  formatPeso,
  isBlankLine,
  isDateKey,
  isHexColor,
  manilaDateKey,
  parseManilaDateTime,
  pricingCleared,
  quoteTotals,
  specialPricingKey,
  specialPricingReason,
} from "@/lib/quotations";
import type {
  QuotationConfig,
  QuotationInput,
  QuoteBillTo,
  QuoteLine,
  QuoteLineOrigin,
  QuotePdfColors,
  QuoteSection,
  QuoteVehicle,
} from "@/types";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const SECTIONS: QuoteSection[] = ["parts", "labor"];
const ORIGINS: QuoteLineOrigin[] = ["typed", "price-list", "photo", "suggested"];
/** A loose check: enough to catch a name typed into the email box, not RFC 5322. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function refresh(ref?: string) {
  revalidatePath("/quotations");
  if (ref) revalidatePath(`/quotations/${ref}`);
}

/** The reason a quotation cannot leave the shop yet, or null. Checked on the stored copy. */
function blockedFromSending(quotation: NonNullable<Awaited<ReturnType<typeof findQuotation>>>): string | null {
  if (quotation.jobOrderRef) return `${quotation.ref} is already job order ${quotation.jobOrderRef}.`;
  if (quotation.lines.length === 0) return "This quotation has no lines to send.";
  if (quotation.totals.unpricedCount > 0) return "Price every line before sending this quotation.";
  if (!pricingCleared(quotation)) {
    return `${specialPricingReason(quotation.lines, quotation.discountCents) ?? ""} An administrator must approve the pricing before it goes to the customer.`.trim();
  }
  return null;
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cents(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  return value >= 0 && value <= MAX_AMOUNT_CENTS ? value : undefined;
}

/**
 * Everything the editor sends, checked field by field. The browser's copy is
 * never trusted: a hand-made request can carry any shape.
 */
function readLines(raw: unknown): QuoteLine[] {
  if (!Array.isArray(raw)) throw new InputError("The quotation lines could not be read.");
  const lines: QuoteLine[] = [];
  for (const item of raw) {
    const entry = (item ?? {}) as Record<string, unknown>;
    const section = SECTIONS.find((key) => key === entry.section);
    if (!section) throw new InputError("A line belongs to neither parts nor labor.");

    const description = text(entry.description, 160);
    const line: QuoteLine = {
      id: text(entry.id, 40) || `ln-${lines.length + 1}`,
      section,
      po: text(entry.po, 30),
      description,
      qty: typeof entry.qty === "number" ? entry.qty : Number.NaN,
      unit: text(entry.unit, 20),
      unitPriceCents: null,
      costCents: null,
      origin: ORIGINS.find((key) => key === entry.origin) ?? "typed",
      sku: section === "parts" ? text(entry.sku, 40) || null : null,
      costNote: text(entry.costNote, 120),
    };

    const price = cents(entry.unitPriceCents);
    const cost = cents(entry.costCents);
    const label = description || "A line";
    if (price === undefined) throw new InputError(`${label}: the unit price is not a valid amount.`);
    if (cost === undefined) throw new InputError(`${label}: the cost is not a valid amount.`);
    line.unitPriceCents = price;
    line.costCents = cost;

    if (isBlankLine(line)) continue;
    if (!description) throw new InputError("Every line with a price needs a description.");
    if (!Number.isFinite(line.qty) || line.qty <= 0 || line.qty > MAX_QTY) {
      throw new InputError(`${label}: the quantity must be more than zero.`);
    }
    if (Math.round(line.qty * 100) !== line.qty * 100) {
      throw new InputError(`${label}: the quantity takes two decimals at most.`);
    }
    lines.push(line);
  }
  if (lines.length > MAX_LINES) {
    throw new InputError(`A quotation holds ${MAX_LINES} lines at most.`);
  }
  return lines;
}

async function readInput(
  raw: QuotationInput,
  modules: { crm: boolean; fleet: boolean; bookings: boolean },
): Promise<QuotationInput> {
  const quoteDate = text(raw.quoteDate, 10);
  if (!isDateKey(quoteDate)) throw new InputError("The quotation needs a date.");
  const validUntil = text(raw.validUntil, 10);
  if (!isDateKey(validUntil)) throw new InputError("The quotation needs a valid-until date.");
  if (validUntil < quoteDate) throw new InputError("The valid-until date is before the quotation's date.");
  if (validUntil > addDays(quoteDate, MAX_VALID_DAYS)) {
    throw new InputError(`A quotation is valid for ${MAX_VALID_DAYS} days at most.`);
  }

  const billTo = raw.billTo ?? ({} as QuotationInput["billTo"]);
  const vehicle = raw.vehicle ?? ({} as QuotationInput["vehicle"]);

  const email = text(billTo.email, 120);
  if (email && !EMAIL.test(email)) throw new InputError("That email address does not look complete.");

  const odometer = vehicle.odometerKm;
  if (
    odometer !== null &&
    odometer !== undefined &&
    (typeof odometer !== "number" || !Number.isInteger(odometer) || odometer < 0 || odometer > 9_999_999)
  ) {
    throw new InputError("The odometer reading must be a whole number of km, or left blank.");
  }

  // A link to a record is kept only when the record is this business's and
  // its module is on; the typed copy stands on its own either way.
  let customerRef = text(billTo.customerRef, 20) || null;
  if (customerRef && (!modules.crm || !(await findCustomer(customerRef)))) customerRef = null;
  let vehicleRef = text(vehicle.vehicleRef, 20) || null;
  if (vehicleRef && (!modules.fleet || !(await findVehicleOption(vehicleRef)))) vehicleRef = null;
  const bookingRef = text(raw.bookingRef, 20) || null;
  if (bookingRef && (!modules.bookings || !(await getBooking(bookingRef)))) {
    throw new InputError(`Booking ${bookingRef} is not on file. Pick another or leave it unlinked.`);
  }

  const lines = readLines(raw.lines);
  const totals = quoteTotals(lines, 0);
  // A percentage is the source of truth when given: the amount is worked out
  // here from the lines saved, never taken from the browser.
  const percentRaw = raw.discountPercent;
  const discountPercent =
    typeof percentRaw === "number" && Number.isFinite(percentRaw) && percentRaw > 0 ? Math.round(percentRaw * 100) / 100 : null;
  if (discountPercent !== null && discountPercent > 100) {
    throw new InputError("A discount cannot be more than 100%.");
  }
  const discountCents =
    discountPercent !== null ? discountFromPercent(totals.subtotalCents, discountPercent) : cents(raw.discountCents ?? 0);
  if (discountCents === undefined || discountCents === null) {
    throw new InputError("The discount is not a valid amount.");
  }
  if (discountCents > totals.subtotalCents) {
    throw new InputError("The discount is larger than the quotation.");
  }

  const discountReason = discountCents > 0 ? text(raw.discountReason, 200) : "";
  if (discountCents > 0 && !discountReason) {
    throw new InputError("Say why the discount is given. The approver and the log need the reason.");
  }

  return {
    quoteDate,
    validUntil,
    drNumber: text(raw.drNumber, 30),
    bookingRef,
    billTo: {
      customerRef,
      name: text(billTo.name, 120),
      company: text(billTo.company, 120),
      address: text(billTo.address, 200),
      phone: text(billTo.phone, 40),
      email,
    },
    vehicle: {
      vehicleRef,
      plate: text(vehicle.plate, 12).toUpperCase(),
      makeModel: text(vehicle.makeModel, 80),
      odometerKm: odometer ?? null,
    },
    serviceAdvisor: text(raw.serviceAdvisor, 80),
    technician: text(raw.technician, 80),
    lines,
    discountCents,
    discountPercent: discountCents > 0 ? discountPercent : null,
    discountReason,
    notes: text(raw.notes, 600),
  };
}

async function guard<T>(work: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof InputError) return { ok: false, error: error.message };
    throw error;
  }
}

/** Creates the quotation when `ref` is null, otherwise saves over it. */
export async function saveQuotationAction(
  ref: string | null,
  raw: QuotationInput,
): Promise<Result<{ ref: string; revision: number; revised: boolean; jobNote: string | null }>> {
  const business = await requireModule("quotes");
  return guard(async () => {
    const input = await readInput(raw, {
      crm: business.modules.includes("crm"),
      fleet: business.modules.includes("crm"),
      bookings: business.modules.includes("bookings"),
    });
    if (!input.billTo.name && !input.billTo.company) {
      throw new InputError("Who is the quotation for? Add a customer or company name.");
    }
    if (input.lines.length === 0) {
      throw new InputError("Add at least one part or labor line.");
    }

    if (ref) {
      const { revision, revised, jobOrderRef } = await updateQuotation(ref, input, {
        canApprovePricing: await hasCapability("approvePricing"),
      });
      await alertIfApprovalNeeded(business.name, ref);
      let jobNote: string | null = null;
      if (jobOrderRef) jobNote = await followQuotation(ref, jobOrderRef, business);
      refresh(ref);
      return { ok: true, ref, revision, revised, jobNote };
    }
    const created = await createQuotation(input);
    await alertIfApprovalNeeded(business.name, created);
    refresh(created);
    return { ok: true, ref: created, revision: 1, revised: false, jobNote: null };
  });
}

/**
 * The quotation was saved after its job order was recorded: the job order
 * takes the new lines, total, customer and car, its stock is put back or
 * taken to match, the booking's value follows the total, and the job order's
 * history says what changed. Returns a line for the toast.
 */
async function followQuotation(ref: string, jobOrderRef: string, business: Awaited<ReturnType<typeof requireModule>>): Promise<string | null> {
  const quote = await findQuotation(ref);
  if (!quote?.response) return null;
  const { summary, stockNote } = await syncJobOrderWithQuotation(
    jobOrderRef,
    {
      ref,
      revision: quote.revision,
      billTo: quote.billTo,
      vehicle: quote.vehicle,
      serviceAdvisor: quote.serviceAdvisor,
      technician: quote.technician,
      lines: quote.lines,
      discountCents: quote.discountCents,
      approvedTotalCents: quote.response.approvedTotalCents,
    },
    { inventory: business.modules.includes("inventory") },
  );

  let bookingNote: string | null = null;
  if (quote.bookingRef && business.modules.includes("bookings")) {
    const booking = await getBooking(quote.bookingRef);
    if (booking && booking.status !== "Cancelled" && booking.valueCents !== quote.response.approvedTotalCents) {
      await updateBookingDetails(quote.bookingRef, {
        staff: booking.staff,
        durationMinutes: booking.durationMinutes,
        valueCents: quote.response.approvedTotalCents,
      });
      bookingNote = `Booking ${quote.bookingRef} value now ${formatPeso(quote.response.approvedTotalCents)}.`;
      await logJobEvent(jobOrderRef, "quotation-changed", bookingNote);
      revalidatePath("/bookings");
      revalidatePath("/dashboard");
    }
  }
  revalidatePath(`/quotations/jobs/${jobOrderRef}`);
  if (stockNote) revalidatePath("/inventory");
  const parts = [summary ? `${jobOrderRef} updated.` : null, stockNote, bookingNote].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

/**
 * Someone who cannot approve pricing saved a discount or a below-cost price:
 * the owner is texted once for exactly that pricing, so they can open it and
 * approve. Someone who can approve it is not texted about their own work.
 */
async function alertIfApprovalNeeded(businessName: string, ref: string): Promise<void> {
  if (await hasCapability("approvePricing")) return;
  const actor = await currentQuoteActor();
  const quotation = await findQuotation(ref);
  if (!quotation || pricingCleared(quotation)) return;
  await notifyOwner(
    "approvals",
    `approval:${ref}:${specialPricingKey(quotation.lines, quotation.discountCents)}`,
    approvalNeededText(businessName, ref, specialPricingReason(quotation.lines, quotation.discountCents) ?? "", actor.name),
  );
}

/** "QT-1004 sent to Juan Cruz", once per revision however many times it is sent. */
async function alertSent(businessName: string, ref: string): Promise<void> {
  const quotation = await findQuotation(ref);
  if (!quotation) return;
  await notifyOwner(
    "quotes",
    `quote-sent:${ref}:${quotation.revision}`,
    quoteSentText(businessName, ref, quotation.billTo.name || quotation.billTo.company, quotation.totals.totalCents),
  );
}

export async function deleteQuotationAction(ref: string): Promise<Result> {
  await requireModule("quotes");
  return guard(async () => {
    await deleteQuotation(ref);
    refresh();
    return { ok: true };
  });
}

// ---- Email ----------------------------------------------------------------------

/**
 * Emails the saved quotation as a PDF through the business's own mailbox.
 *
 * A person typed or checked the address, the subject and the message and
 * pressed Send; nothing here decides to send. The PDF is rendered from the
 * stored quotation, not from anything the browser holds, so what leaves is
 * what was saved.
 */
export async function sendQuotationAction(
  ref: string,
  message: { to: string; subject: string; body: string },
): Promise<Result<{ to: string }>> {
  const business = await requireModule("quotes");
  return guard(async () => {
    const to = text(message.to, 120);
    const subject = text(message.subject, 200);
    const body = typeof message.body === "string" ? message.body.trim().slice(0, 4000) : "";
    if (!EMAIL.test(to)) throw new InputError("Enter the email address to send it to.");
    if (/[\s,;]/.test(to)) throw new InputError("Send to one address at a time.");
    if (!subject) throw new InputError("The email needs a subject.");
    if (!body) throw new InputError("Write a short message to go with the quotation.");

    if (!(await isMailboxConfigured())) {
      throw new InputError(
        `No mailbox is connected for ${business.name}. An administrator connects one in Business Management.`,
      );
    }

    const quotation = await findQuotation(ref);
    if (!quotation) throw new InputError(`${ref} is no longer on file.`);
    const blocked = blockedFromSending(quotation);
    if (blocked) throw new InputError(blocked);

    const settings = await readQuotationSettings();
    const pdf = await renderQuotePdf({ quotation, settings, businessName: business.name });
    const failure = await sendMail(to, subject, body, [
      {
        filename: quotePdfFilename(business.name, quotation.ref, quotation.revision),
        content: pdf,
        contentType: "application/pdf",
      },
    ]);
    if (failure) throw new InputError(explainSendFailure(failure));

    // Recorded only once the mail server accepted it.
    await markQuotationSent(ref, to, "email");
    await alertSent(business.name, ref);
    refresh(ref);
    return { ok: true, to };
  });
}

/**
 * For a quotation that reached the customer some way other than AEGIS's
 * email: printed, shown, or sent from a phone. The same checks as emailing,
 * so pricing nobody approved cannot leave this way either.
 */
export async function markQuotationGivenAction(ref: string, how: string): Promise<Result> {
  const business = await requireModule("quotes");
  return guard(async () => {
    const method = QUOTE_HANDOVER_METHODS.find((entry) => entry === how);
    if (!method) throw new InputError("Say how the quotation reached the customer.");
    const quotation = await findQuotation(ref);
    if (!quotation) throw new InputError(`${ref} is no longer on file.`);
    const blocked = blockedFromSending(quotation);
    if (blocked) throw new InputError(blocked);
    await markQuotationSent(ref, method, "hand");
    await alertSent(business.name, ref);
    refresh(ref);
    return { ok: true };
  });
}

// ---- Approvals --------------------------------------------------------------------

/** Owners and administrators. Anyone else can type a discount but not agree to it. */
export async function approveSpecialPricingAction(ref: string, key: string): Promise<Result> {
  await requireModule("quotes");
  return guard(async () => {
    if (!(await hasCapability("approvePricing"))) {
      throw new InputError("Only an owner or an administrator can approve a discount or a price below cost.");
    }
    await approveSpecialPricing(ref, typeof key === "string" ? key : "");
    refresh(ref);
    return { ok: true };
  });
}

// ---- The customer's approval -------------------------------------------------------

/**
 * Records that the customer approved the whole quotation, usually by sending
 * a purchase order. The job order is not made here: staff make it when they
 * decide to, from the Approved quotation.
 */
export async function recordQuoteApprovalAction(
  ref: string,
  input: { poNumber: string; customerName: string; method: string; at: string; note: string },
): Promise<Result> {
  const business = await requireModule("quotes");
  return guard(async () => {
    const method = QUOTE_RESPONSE_METHODS.find((entry) => entry === input?.method);
    if (!method) throw new InputError("Say how the customer approved it.");
    const poNumber = text(input.poNumber, 40);
    if (method === "Purchase order" && !poNumber) throw new InputError("Enter the purchase order number.");
    const customerName = text(input.customerName, 120);
    if (!customerName) throw new InputError("Who approved it for the customer?");
    const at = parseManilaDateTime(text(input.at, 20));
    if (!at) throw new InputError("Enter when the customer approved it.");

    await recordQuoteResponse(ref, {
      outcome: "Approved",
      at,
      customerName,
      method,
      note: text(input.note, 300),
      approvedLineIds: [],
      approvedDiscountCents: 0,
      poNumber: poNumber || undefined,
    });
    const quote = await findQuotation(ref);
    if (quote?.response) {
      await notifyOwner(
        "quotes",
        `quote-answer:${ref}:${quote.revision}:Approved`,
        quoteAnsweredText(business.name, ref, "Approved", quote.response.customerName, quote.response.approvedTotalCents),
      );
    }
    refresh(ref);
    return { ok: true };
  });
}

/** Takes back an approval recorded by mistake, by a person or by the AI reading email. */
export async function clearQuoteApprovalAction(ref: string, reason: string): Promise<Result> {
  await requireModule("quotes");
  return guard(async () => {
    await clearQuoteResponse(ref, text(reason, 200));
    refresh(ref);
    return { ok: true };
  });
}

// ---- Job orders -------------------------------------------------------------------

/**
 * Turns the approved quotation into a job order. When the quotation is for a
 * booking, the booking's value becomes the approved amount: that one booking
 * is where the sale is recorded, so the ledger entry it already has is
 * updated rather than a second one added. With Inventory on, the approved
 * parts linked to stock leave Inventory now, at the cost of their batches.
 */
export async function convertToJobOrderAction(
  ref: string,
): Promise<Result<{ jobOrderRef: string; created: boolean; bookingNote: string | null; stockNote: string | null }>> {
  const business = await requireModule("quotes");
  return guard(async () => {
    const { jobOrderRef, created, doc } = await convertToJobOrder(ref);
    let bookingNote: string | null = null;
    let stockNote: string | null = null;

    // Making the job order was the approval, so the owner hears of it the way
    // a recorded answer used to tell them.
    if (created && doc.response?.method === "Job order made") {
      await notifyOwner(
        "quotes",
        `quote-answer:${ref}:${doc.revision ?? 1}:Approved`,
        quoteAnsweredText(business.name, ref, "Approved", doc.response.customerName, doc.response.approvedTotalCents),
      );
    }

    if (created) {
      const quote = await findQuotation(ref);
      await logJobEvent(
        jobOrderRef,
        "created",
        `${quote?.paperJobOrder ? `Recorded from the paper job order (scan ${quote.photoRef}) as ` : "Made from "}${ref} rev ${doc.revision ?? 1}; ${formatPeso(doc.response?.approvedTotalCents ?? 0)}.`,
      );
    }

    if (created && business.modules.includes("inventory")) {
      stockNote = stockTakeSummary(await takeJobStock(jobOrderRef));
      if (stockNote) {
        await noteOnQuotation(ref, doc.revision ?? 1, `${jobOrderRef}: ${stockNote}`);
        revalidatePath("/inventory");
      }
    }

    const bookingRef = doc.bookingRef ?? null;
    const approvedTotal = doc.response?.approvedTotalCents ?? null;
    if (created && bookingRef && approvedTotal !== null && business.modules.includes("bookings")) {
      const booking = await getBooking(bookingRef);
      if (!booking) {
        bookingNote = `Booking ${bookingRef} is no longer on file, so no booking value was changed.`;
      } else if (booking.status === "Cancelled") {
        bookingNote = `Booking ${bookingRef} is cancelled, so its value was left as it was.`;
      } else if (booking.valueCents === approvedTotal) {
        bookingNote = `Booking ${bookingRef} already had the approved value.`;
      } else {
        await updateBookingDetails(bookingRef, {
          staff: booking.staff,
          durationMinutes: booking.durationMinutes,
          valueCents: approvedTotal,
        });
        bookingNote = `Booking ${bookingRef} value set from ${formatPeso(booking.valueCents)} to the approved ${formatPeso(approvedTotal)}.`;
        revalidatePath("/bookings");
        revalidatePath("/dashboard");
      }
      await noteOnQuotation(ref, doc.revision ?? 1, bookingNote);
    }

    refresh(ref);
    revalidatePath(`/quotations/jobs/${jobOrderRef}`);
    return { ok: true, jobOrderRef, created, bookingNote, stockNote };
  });
}

/**
 * Records a scanned paper job order: the job exists already on paper, so
 * there is no handing over and no customer answer to wait for. The checked
 * quotation is marked as given ("Paper job order") and made into the job
 * order at once, with every rule the two steps have on their own: every line
 * priced, special pricing approved, parts taken from stock.
 */
export async function recordPaperJobOrderAction(
  ref: string,
): Promise<Result<{ jobOrderRef: string; created: boolean; bookingNote: string | null; stockNote: string | null }>> {
  await requireModule("quotes");
  const quotation = await findQuotation(ref);
  if (!quotation) return { ok: false, error: `${ref} is no longer on file.` };
  if (!quotation.paperJobOrder) {
    return { ok: false, error: "Only a quotation read from a scanned job order is recorded this way. Give it to the customer first." };
  }
  if (quotation.status === "Draft") {
    const blocked = blockedFromSending(quotation);
    if (blocked) return { ok: false, error: blocked.replace("before sending this quotation", "before recording the job order") };
    await markQuotationSent(ref, "Paper job order", "paper");
  }
  return convertToJobOrderAction(ref);
}

/**
 * Takes a job order's waiting parts from Inventory: the ones short of stock
 * when it was made (once the goods are in), or a job order made before parts
 * were taken automatically.
 */
export async function takeJobStockAction(ref: string): Promise<Result<{ stockNote: string | null; taken: number }>> {
  // Like making the job order, which takes the same parts, this is part of the
  // quotation's work, so it needs the business to keep Inventory, not the
  // person's role to show it.
  const business = await requireModule("quotes");
  return guard(async () => {
    if (!business.modules.includes("inventory")) throw new InputError(`${business.name} does not keep Inventory in AEGIS.`);
    const result = await takeJobStock(ref);
    const job = await findJobOrder(ref);
    const stockNote = stockTakeSummary(result);
    if (job && stockNote) await noteOnQuotation(job.quotationRef, job.quotationRevision, `${ref}: ${stockNote}`);
    revalidatePath(`/quotations/jobs/${ref}`);
    revalidatePath("/inventory");
    return { ok: true, stockNote, taken: result.taken.length };
  });
}

/** Puts back parts a cancelled job order still holds, if putting them back failed when it was cancelled. */
export async function returnJobStockAction(ref: string): Promise<Result<{ returned: number; failed: string[] }>> {
  await requireModule("quotes");
  return guard(async () => {
    const job = await findJobOrder(ref);
    if (!job) throw new InputError(`${ref} is no longer on file.`);
    if (job.status !== "Cancelled") throw new InputError("Only a cancelled job order gives its parts back.");
    const result = await returnJobOrderStock(ref);
    revalidatePath(`/quotations/jobs/${ref}`);
    revalidatePath("/inventory");
    return { ok: true, ...result };
  });
}

/**
 * Cancels a job order: the one change a recorded job order has. The parts it
 * took go back into Inventory; the booking is left for staff to move.
 */
export async function cancelJobOrderAction(ref: string): Promise<Result<{ stockNote: string | null }>> {
  const business = await requireModule("quotes");
  return guard(async () => {
    const { stockNote } = await cancelJobOrder(ref);
    revalidatePath("/quotations");
    revalidatePath(`/quotations/jobs/${ref}`);
    if (stockNote) revalidatePath("/inventory");
    const job = await findJobOrder(ref);
    await notifyOwner(
      "jobs",
      `job:${ref}:Cancelled`,
      jobText(business.name, ref, "Cancelled", job ? job.billTo.name || job.billTo.company : ""),
    );
    return { ok: true, stockNote };
  });
}

// ---- From a photo -----------------------------------------------------------------

/**
 * Just under the 1 MB a Server Action accepts. The browser shrinks and
 * recompresses the photo until it fits.
 */
const MAX_PHOTO_CHARS = 1_000_000;

/**
 * Reads a photo into a draft quotation. The draft is only a starting point:
 * every line is tagged with where it came from, unpriced lines block the
 * PDF and the email, and nothing reaches a customer until a person has
 * edited, saved and sent it.
 */
export async function createQuotationFromPhotoAction(
  dataUrl: string,
): Promise<Result<{ ref: string; note: string }>> {
  const business = await requireModule("quotes");
  return guard(async () => {
    if (typeof dataUrl !== "string" || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) {
      throw new InputError("The photo could not be read. Try taking it again.");
    }
    if (dataUrl.length > MAX_PHOTO_CHARS) throw new InputError("That photo is too large to upload.");
    if (!isAiConfigured()) {
      throw new InputError("Reading photos needs AI, which is not switched on for this workspace.");
    }

    const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
    const sha256 = createHash("sha256").update(bytes).digest("hex");

    // The limits guard spending, so a photo read before (free from the cache)
    // passes them.
    const cached = await isPhotoReadCached(sha256);
    if (!cached) {
      if ((await countBilledPhotosToday()) >= PHOTOS_PER_DAY) {
        throw new InputError(
          `${business.name} has read ${PHOTOS_PER_DAY} photos today, the daily limit. Type this one in, or try again tomorrow.`,
        );
      }
      if ((await tokensUsedThisMonth()) >= AI_MONTHLY_TOKEN_BUDGET * PHOTO_BUDGET_SHARE) {
        throw new InputError(
          "Most of this month's AI allowance is used, and the rest is kept for mail. Type this quotation in instead.",
        );
      }
    }

    const result = await readQuotePhoto(dataUrl, sha256);
    if (!result.ok) {
      // A failed call may still have been billed; it counts towards the cap.
      await savePhoto({ sha256, dataUrl, bytes: bytes.length, billed: true, kind: null, note: "" });
      throw new InputError(`The photo was not read. ${explainFailure(result.reason)}`);
    }

    const read = result.data;
    const [priceItems, settings, costSources] = await Promise.all([
      listPriceItems(),
      readQuotationSettings(),
      listCostSources(business),
    ]);
    // Parts left without a cost after the photo and the price list take what
    // they cost now, from stock or the supplier, priced at the markup if the
    // photo gave no price.
    const lines = applyCostSources(
      draftLinesFromRead(read, priceItems, settings.markupPercent),
      costSources,
      settings.markupPercent,
    );
    const note = describeRead(read, lines);
    const photoRef = await savePhoto({
      sha256,
      dataUrl,
      bytes: bytes.length,
      billed: !result.cached,
      kind: read.kind,
      note,
    });

    if (lines.length === 0) {
      throw new InputError(`No quotation lines were found. ${note}`);
    }

    // Link what the photo names to records already on file, never create
    // them: a misread plate must not become a customer car in CRM.
    const crm = business.modules.includes("crm");
    const fleet = crm;
    const vehicle: QuoteVehicle = {
      vehicleRef: null,
      plate: read.plate,
      makeModel: read.makeModel,
      odometerKm: read.odometerKm,
    };
    // A paper job order carries the shop's own letterhead, which is not the
    // customer's company.
    const plain = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
    const ownName = Boolean(read.company) && plain(read.company) === plain(business.name);
    const billTo: QuoteBillTo = {
      customerRef: null,
      name: read.customerName,
      company: ownName ? "" : read.company,
      address: "",
      phone: read.customerPhone,
      email: "",
    };

    const car = fleet && read.plate ? await findVehicleByPlate(read.plate) : null;
    if (car) {
      vehicle.vehicleRef = car.ref;
      vehicle.plate = car.plate;
      vehicle.makeModel = vehicle.makeModel || car.label;
    }
    const ownerRef = car?.customerRef ?? null;
    let customer = crm && ownerRef ? await findCustomer(ownerRef) : null;
    if (!customer && crm && read.customerPhone) {
      const matches = await findDuplicates({ phone: read.customerPhone, email: "" });
      // Only an unambiguous match is linked; families share a phone.
      if (matches.length === 1) customer = await findCustomer(matches[0].ref);
    }
    if (customer) {
      Object.assign(billTo, {
        customerRef: customer.ref,
        name: customer.name,
        company: customer.company || billTo.company,
        phone: customer.phone || billTo.phone,
        email: customer.email,
      });
    } else if (car && !billTo.name) {
      billTo.name = car.ownerName;
      billTo.email = car.ownerEmail;
    }

    const quoteDate = manilaDateKey(new Date());
    const ref = await createQuotation(
      {
        quoteDate,
        validUntil: addDays(quoteDate, settings.validDays),
        drNumber: "",
        bookingRef: null,
        billTo,
        vehicle,
        serviceAdvisor: "",
        technician: "",
        lines,
        discountCents: 0,
        discountPercent: null,
        discountReason: "",
        notes: settings.notes,
      },
      // The scan box is for the shop's paper job orders: the work is already
      // agreed, so this quotation is recorded straight as a job order.
      { source: "photo", photoRef, paperJobOrder: true },
    );
    await linkPhoto(photoRef, ref);
    refresh(ref);
    return { ok: true, ref, note };
  });
}

// ---- Price list ---------------------------------------------------------------

export async function updatePriceItemAction(
  section: QuoteSection,
  description: string,
  fields: { unit: string; unitPriceCents: number; costCents: number | null },
): Promise<Result> {
  await requireModule("quotes");
  return guard(async () => {
    if (!SECTIONS.includes(section)) throw new InputError("Unknown price list section.");
    const price = cents(fields.unitPriceCents);
    const cost = cents(fields.costCents);
    if (price === undefined || price === null) throw new InputError("The price is not a valid amount.");
    if (cost === undefined) throw new InputError("The cost is not a valid amount.");
    await updatePriceItem(section, description, {
      unit: text(fields.unit, 20),
      unitPriceCents: price,
      costCents: cost,
    });
    refresh();
    return { ok: true };
  });
}

export async function deletePriceItemAction(
  section: QuoteSection,
  description: string,
): Promise<Result> {
  await requireModule("quotes");
  return guard(async () => {
    if (!SECTIONS.includes(section)) throw new InputError("Unknown price list section.");
    await deletePriceItem(section, description);
    refresh();
    return { ok: true };
  });
}

// ---- Letterhead -----------------------------------------------------------------

/** Data URLs this long are about 300 KB of image: plenty for a letterhead logo. */
const MAX_LOGO_CHARS = 400_000;

export async function saveQuotationSettingsAction(
  raw: Omit<QuotationConfig, "logo" | "signers">,
  logo: string | null | undefined,
): Promise<Result> {
  await requireModule("quotes");
  return guard(async () => {
    const markup = raw.markupPercent;
    if (typeof markup !== "number" || !Number.isFinite(markup) || markup < 0 || markup > 500) {
      throw new InputError("The markup must be a percentage from 0 to 500.");
    }
    const validDays = raw.validDays;
    if (typeof validDays !== "number" || !Number.isInteger(validDays) || validDays < 1 || validDays > MAX_VALID_DAYS) {
      throw new InputError(`Quotations must be valid for 1 to ${MAX_VALID_DAYS} days.`);
    }
    if (typeof logo === "string") {
      if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(logo)) {
        throw new InputError("The logo must be a PNG or JPEG image.");
      }
      if (logo.length > MAX_LOGO_CHARS) {
        throw new InputError("That logo is too large. Use a smaller image.");
      }
    }
    await saveQuotationSettings(
      {
        address: text(raw.address, 200),
        contact: text(raw.contact, 160),
        notes: text(raw.notes, 600),
        footer: text(raw.footer, 120),
        markupPercent: Math.round(markup * 100) / 100,
        validDays,
        signOff: {
          accounting: text(raw.signOff?.accounting, 80),
          headTechnician: text(raw.signOff?.headTechnician, 80),
          manager: text(raw.signOff?.manager, 80),
        },
        pdfColors: readPdfColors(raw.pdfColors),
      },
      logo,
    );
    refresh();
    return { ok: true };
  });
}

/** The PDF colours as sent, each checked; anything not a "#RRGGBB" colour is refused. */
function readPdfColors(raw: unknown): QuotePdfColors | undefined {
  if (raw === undefined || raw === null) return undefined;
  const entry = raw as Record<string, unknown>;
  const colors = { frame: entry.frame, heading: entry.heading, shade: entry.shade, highlight: entry.highlight };
  for (const [key, value] of Object.entries(colors)) {
    if (!isHexColor(value)) throw new InputError(`The ${key} colour is not a valid colour.`);
  }
  return {
    frame: (colors.frame as string).toUpperCase(),
    heading: (colors.heading as string).toUpperCase(),
    shade: (colors.shade as string).toUpperCase(),
    highlight: (colors.highlight as string).toUpperCase(),
  };
}

// ---- Signatures -------------------------------------------------------------------

/**
 * Adds a person's signature (`id` null) or replaces one. The image is already
 * a trimmed PNG of the ink only, made in the browser; here it is only checked.
 */
export async function saveQuoteSignerAction(input: {
  id: string | null;
  name: string;
  image: string;
}): Promise<Result<{ id: string }>> {
  await requireModule("quotes");
  return guard(async () => {
    const name = text(input.name, 80);
    if (!name) throw new InputError("Type the name exactly as it prints on the quotation.");
    if (typeof input.image !== "string" || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(input.image)) {
      throw new InputError("Upload the signature as an image.");
    }
    if (input.image.length > MAX_SIGNATURE_CHARS) {
      throw new InputError("That signature is too large. Crop the photo closer to the signature.");
    }
    const id = await saveQuoteSigner({ id: typeof input.id === "string" ? text(input.id, 20) : null, name, image: input.image });
    refresh();
    return { ok: true, id };
  });
}

export async function removeQuoteSignerAction(id: string): Promise<Result> {
  await requireModule("quotes");
  return guard(async () => {
    await removeQuoteSigner(text(id, 20));
    refresh();
    return { ok: true };
  });
}
