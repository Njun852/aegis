/** The two halves of a quotation, in the order the printed form lists them. */
export type QuoteSection = "parts" | "labor";

/**
 * A quotation is a draft until a person emails it. Accepted and declined are
 * not tracked; the owner asked for the document and the email, nothing more.
 */
export type QuoteStatus = "Draft" | "Sent";

export type QuoteStatusFilter = "All" | QuoteStatus;

/**
 * Where a line's figures came from, shown beside it so staff know what to
 * check: a price read off a photo or proposed by the AI is a starting point,
 * never an agreed price.
 */
export type QuoteLineOrigin = "typed" | "price-list" | "photo" | "suggested";

export interface QuoteLine {
  /** Stable within the quotation, so the editor can key rows. */
  id: string;
  section: QuoteSection;
  po: string;
  description: string;
  qty: number;
  unit: string;
  /** Minor units. Null while nobody has priced it, which blocks the PDF and the email. */
  unitPriceCents: number | null;
  /** What the part or job costs the business. Internal: never printed, never emailed. */
  costCents: number | null;
  origin: QuoteLineOrigin;
}

/** Who the quotation is addressed to, as it reads on the form. */
export interface QuoteBillTo {
  /** The CRM customer it was filled from. The fields below are a copy. */
  customerRef: string | null;
  name: string;
  company: string;
  address: string;
  phone: string;
  email: string;
}

export interface QuoteVehicle {
  /** The Fleet car it was filled from. The fields below are a copy. */
  vehicleRef: string | null;
  plate: string;
  makeModel: string;
  odometerKm: number | null;
}

/**
 * Worked out from the lines on every read rather than stored, so a total can
 * never disagree with the rows above it.
 */
export interface QuoteTotals {
  partsCents: number;
  laborCents: number;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  /** Lines with a description but no price yet. */
  unpricedCount: number;
  /** Cost of the lines that have one. Internal. */
  costCents: number;
  /** Selling amount minus cost, over the lines that have a cost. Internal. */
  marginCents: number;
  /** How many priced lines the margin covers. */
  costedLines: number;
  pricedLines: number;
}

export type QuoteSource = "manual" | "photo";

/** A quotation as the screens receive it. */
export interface Quotation {
  ref: string;
  status: QuoteStatus;
  /** "2026-09-14", the date printed on the form. */
  quoteDate: string;
  /** "Sep 14, 2026" */
  quoteDay: string;
  drNumber: string;
  billTo: QuoteBillTo;
  vehicle: QuoteVehicle;
  serviceAdvisor: string;
  technician: string;
  lines: QuoteLine[];
  discountCents: number;
  notes: string;
  source: QuoteSource;
  /** The photo a draft was read from. */
  photoRef: string | null;
  totals: QuoteTotals;
  /** "Sep 14 · 16:40", when it was last emailed. */
  sent: string | null;
  sentTo: string | null;
  /** ISO 8601. */
  updatedAt: string;
}

/** Stored shape. `businessId` is stamped on by `tenantScope`. */
export interface QuotationDocument {
  businessId: string;
  ref: string;
  status: QuoteStatus;
  quoteDate: string;
  drNumber: string;
  billTo: QuoteBillTo;
  vehicle: QuoteVehicle;
  serviceAdvisor: string;
  technician: string;
  lines: QuoteLine[];
  discountCents: number;
  notes: string;
  source: QuoteSource;
  /** The photo a draft was read from. */
  photoRef?: string;
  sentAt?: Date;
  sentTo?: string;
  /** The user id that created it. */
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/** What the editor saves. The ref, status and timestamps are the server's. */
export interface QuotationInput {
  quoteDate: string;
  drNumber: string;
  billTo: QuoteBillTo;
  vehicle: QuoteVehicle;
  serviceAdvisor: string;
  technician: string;
  lines: QuoteLine[];
  discountCents: number;
  notes: string;
}

/**
 * One remembered line. Saving a quotation writes its lines here, so the next
 * quotation can autocomplete "Turbo cleaning" at the price it was last quoted.
 */
export interface QuotePriceItem {
  section: QuoteSection;
  description: string;
  unit: string;
  unitPriceCents: number;
  costCents: number | null;
  useCount: number;
  /** "Sep 14, 2026" */
  lastUsedDay: string;
}

export interface QuotePriceItemDocument {
  businessId: string;
  section: QuoteSection;
  description: string;
  /** Lower case, punctuation folded to spaces. What a match is made on. */
  key: string;
  unit: string;
  unitPriceCents: number;
  costCents: number | null;
  useCount: number;
  lastUsedAt: Date;
  createdAt: Date;
}

/**
 * The letterhead and defaults a business prints on its quotations. Absent
 * until someone saves the settings; `quoteSettingsOf` fills the gaps.
 */
export interface QuotationConfig {
  address: string;
  contact: string;
  /** Printed in the notes box of every new quotation. */
  notes: string;
  footer: string;
  /** Cost plus this percentage is offered as the price when only a cost is typed. */
  markupPercent: number;
  /** A PNG or JPEG data URL, already shrunk in the browser. */
  logo?: string;
}

export type QuotationSettings = Required<Omit<QuotationConfig, "logo">> & {
  logo: string | null;
};

/** One row of the list. */
export interface QuotationSummary {
  ref: string;
  status: QuoteStatus;
  quoteDay: string;
  quoteDate: string;
  customer: string;
  company: string;
  plate: string;
  makeModel: string;
  totalCents: number;
  unpricedCount: number;
  source: QuoteSource;
  sent: string | null;
  updatedAt: string;
}

/** What the model saw in a photo, decided before any line was read. */
export type QuotePhotoKind = "written_estimate" | "supplier_document" | "vehicle_photo" | "other";

/** One line read off, or proposed from, a photo. Pesos, as the model reports them. */
export interface QuotePhotoLine {
  section: QuoteSection;
  description: string;
  qty: number;
  unit: string;
  /** The selling price as written. Never set for a vehicle photo. */
  unitPrice: number | null;
  /** A cost as written, e.g. on a supplier's receipt. */
  cost: number | null;
}

/** The model's reading of a photo, after validation. */
export interface QuotePhotoRead {
  kind: QuotePhotoKind;
  summary: string;
  customerName: string;
  customerPhone: string;
  plate: string;
  makeModel: string;
  odometerKm: number | null;
  lines: QuotePhotoLine[];
  warnings: string[];
}

/** A photo uploaded to start a quotation. Kept so staff can check the draft against it. */
export interface QuotePhotoDocument {
  businessId: string;
  ref: string;
  /** SHA-256 of the uploaded bytes: the same photo twice is read once. */
  sha256: string;
  /** A JPEG data URL, already shrunk in the browser. */
  dataUrl: string;
  bytes: number;
  /** Whether this upload reached the model, which is what the daily cap counts. */
  billed: boolean;
  kind: QuotePhotoKind | null;
  /** The model's summary and warnings, shown above the draft. */
  note: string;
  quotationRef: string | null;
  createdBy: string;
  createdAt: Date;
}

/** The photo a draft came from, as the editor shows it beside the lines. */
export interface QuotePhotoView {
  ref: string;
  note: string;
}
