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
import {
  countBilledPhotosToday,
  createQuotation,
  deletePriceItem,
  deleteQuotation,
  findQuotation,
  linkPhoto,
  listPriceItems,
  markQuotationSent,
  readQuotationSettings,
  savePhoto,
  saveQuotationSettings,
  updatePriceItem,
  updateQuotation,
} from "@/lib/dal/quotations";
import { InputError } from "@/lib/dal/refs";
import { explainMailFailure } from "@/lib/mail/failures";
import { sendMail } from "@/lib/mail/ingest";
import { quotePdfFilename, renderQuotePdf } from "@/lib/quote-pdf";
import { describeRead, draftLinesFromRead } from "@/lib/quote-photo";
import {
  MAX_AMOUNT_CENTS,
  MAX_LINES,
  MAX_QTY,
  isBlankLine,
  isDateKey,
  manilaDateKey,
  quoteTotals,
} from "@/lib/quotations";
import type {
  QuotationConfig,
  QuotationInput,
  QuoteBillTo,
  QuoteLine,
  QuoteLineOrigin,
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
  modules: { crm: boolean; fleet: boolean },
): Promise<QuotationInput> {
  const quoteDate = text(raw.quoteDate, 10);
  if (!isDateKey(quoteDate)) throw new InputError("The quotation needs a date.");

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
    throw new InputError("The odometer reading must be a whole number of km.");
  }

  // A link to a record is kept only when the record is this business's and
  // its module is on; the typed copy stands on its own either way.
  let customerRef = text(billTo.customerRef, 20) || null;
  if (customerRef && (!modules.crm || !(await findCustomer(customerRef)))) customerRef = null;
  let vehicleRef = text(vehicle.vehicleRef, 20) || null;
  if (vehicleRef && (!modules.fleet || !(await findVehicleOption(vehicleRef)))) vehicleRef = null;

  const lines = readLines(raw.lines);
  const discountCents = cents(raw.discountCents ?? 0);
  if (discountCents === undefined || discountCents === null) {
    throw new InputError("The discount is not a valid amount.");
  }
  const totals = quoteTotals(lines, 0);
  if (discountCents > totals.subtotalCents) {
    throw new InputError("The discount is larger than the quotation.");
  }

  return {
    quoteDate,
    drNumber: text(raw.drNumber, 30),
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
): Promise<Result<{ ref: string }>> {
  const business = await requireModule("quotes");
  return guard(async () => {
    const input = await readInput(raw, {
      crm: business.modules.includes("crm"),
      fleet: business.modules.includes("fleet"),
    });
    if (!input.billTo.name && !input.billTo.company) {
      throw new InputError("Who is the quotation for? Add a customer or company name.");
    }
    if (input.lines.length === 0) {
      throw new InputError("Add at least one part or labor line.");
    }

    const saved = ref ? (await updateQuotation(ref, input), ref) : await createQuotation(input);
    refresh(saved);
    return { ok: true, ref: saved };
  });
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
    if (quotation.lines.length === 0) throw new InputError("This quotation has no lines to send.");
    if (quotation.totals.unpricedCount > 0) {
      throw new InputError("Price every line before sending this quotation.");
    }

    const settings = await readQuotationSettings();
    const pdf = await renderQuotePdf({ quotation, settings, businessName: business.name });
    const failure = await sendMail(to, subject, body, [
      { filename: quotePdfFilename(business.name, quotation.ref), content: pdf, contentType: "application/pdf" },
    ]);
    if (failure) throw new InputError(explainMailFailure(failure));

    // Recorded only once the mail server accepted it.
    await markQuotationSent(ref, to);
    refresh(ref);
    return { ok: true, to };
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
    const [priceItems, settings] = await Promise.all([listPriceItems(), readQuotationSettings()]);
    const lines = draftLinesFromRead(read, priceItems, settings.markupPercent);
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
    // them: a misread plate must not become a car in Fleet.
    const crm = business.modules.includes("crm");
    const fleet = business.modules.includes("fleet");
    const vehicle: QuoteVehicle = {
      vehicleRef: null,
      plate: read.plate,
      makeModel: read.makeModel,
      odometerKm: read.odometerKm,
    };
    const billTo: QuoteBillTo = {
      customerRef: null,
      name: read.customerName,
      company: "",
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
        company: customer.company,
        phone: customer.phone || billTo.phone,
        email: customer.email,
      });
    } else if (car && !billTo.name) {
      billTo.name = car.ownerName;
      billTo.email = car.ownerEmail;
    }

    const ref = await createQuotation(
      {
        quoteDate: manilaDateKey(new Date()),
        drNumber: "",
        billTo,
        vehicle,
        serviceAdvisor: "",
        technician: "",
        lines,
        discountCents: 0,
        notes: settings.notes,
      },
      { source: "photo", photoRef },
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
  raw: Omit<QuotationConfig, "logo">,
  logo: string | null | undefined,
): Promise<Result> {
  await requireModule("quotes");
  return guard(async () => {
    const markup = raw.markupPercent;
    if (typeof markup !== "number" || !Number.isFinite(markup) || markup < 0 || markup > 500) {
      throw new InputError("The markup must be a percentage from 0 to 500.");
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
      },
      logo,
    );
    refresh();
    return { ok: true };
  });
}
