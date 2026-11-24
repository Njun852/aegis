import type { BatchDraw } from "./inventory";

/** The two halves of a quotation, in the order the printed form lists them. */
export type QuoteSection = "parts" | "labor";

/**
 * What is stored. A quotation is a Draft until it is emailed or handed over,
 * then Sent until the customer approves it, usually with a purchase order.
 * Approved is recorded by a person, or read from the customer's email by the
 * AI (24 Nov 2026); making the job order is a separate step staff take when
 * they choose. Partially Approved and Declined come only from answers
 * recorded on older quotations.
 */
export type StoredQuoteStatus = "Draft" | "Sent" | "Approved" | "Partially Approved" | "Declined";

/**
 * What the screens show. Expired is never stored: a Sent quotation past its
 * valid-until date reads as Expired, so nothing has to run at midnight.
 */
export type QuoteStatus = StoredQuoteStatus | "Expired";

/** "Needs job order" is Approved with no job order made yet: work staff still have to decide on. */
export type QuoteStatusFilter = "All" | QuoteStatus | "Needs job order";

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
  /** The Inventory item a part line was costed from. Absent on lines saved before costing. */
  sku?: string | null;
  /** Where the cost came from, as staff read it: "Oldest batch in stock", "Supplier A · Oct 02, 2026". */
  costNote?: string;
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
  /**
   * Gross profit as a share of what those costed lines sell for after the
   * discount, to one decimal. Null when no priced line has a cost. Internal.
   */
  marginPercent: number | null;
  /** How many priced lines the margin covers. */
  costedLines: number;
  pricedLines: number;
}

export type QuoteSource = "manual" | "photo";

/** A person who did something to a quotation, by name as it was at the time. */
export interface QuoteActor {
  userId: string;
  name: string;
}

/**
 * An administrator's sign-off on a discount or a line sold below its cost.
 * It holds for exactly the pricing it was given for (`key`): change the
 * discount or one of those lines and it no longer counts.
 */
export interface QuotePricingApproval {
  key: string;
  by: QuoteActor;
  /** "Oct 15 · 09:12" */
  at: string;
  discountCents: number;
  belowCostLines: number;
}

export type QuoteResponseOutcome = "Approved" | "Partially Approved" | "Declined";

/** How the answer reached the shop. The list is `QUOTE_RESPONSE_METHODS` in `src/lib/quotations.ts`. */
export type QuoteResponseMethod =
  | "In person"
  | "Signed copy"
  | "Phone call"
  | "Email"
  | "Messenger or text"
  /** A purchase order from the customer, typed in by a person or read from their email by the AI. */
  | "Purchase order"
  /** Recorded by making the job order straight from a Sent quotation (quotations before 24 Nov 2026). */
  | "Job order made";

/** The customer's answer, as a person recorded it. */
export interface QuoteResponse {
  outcome: QuoteResponseOutcome;
  /** "Oct 15, 2026 · 09:12" in Manila: when the customer answered, which may be before it was typed in. */
  at: string;
  /** Who answered for the customer. */
  customerName: string;
  method: QuoteResponseMethod;
  note: string;
  /** The lines the customer agreed to. Every line for Approved, none for Declined. */
  approvedLineIds: string[];
  /** The discount on the approved work; never more than the quotation gave. */
  approvedDiscountCents: number;
  /** Worked out on the server from the approved lines when it was recorded. */
  approvedTotalCents: number;
  /** The customer's purchase order number, when they sent one. Absent on answers before 24 Nov 2026. */
  poNumber?: string;
  /** The email the approval came in, when it came by email. */
  source?: QuoteResponseSource | null;
  recordedBy: QuoteActor;
  /** "Oct 15 · 09:14" */
  recordedAt: string;
}

/** The email an approval came in, so staff can open it and check what the AI read. */
export interface QuoteResponseSource {
  messageId: string;
  from: string;
  subject: string;
  /** True when the AI recorded the approval on its own rather than a person. */
  readByAi: boolean;
}

/** Stored form of the two records above: dates as dates. */
export type QuotePricingApprovalDocument = Omit<QuotePricingApproval, "at"> & { at: Date };
export type QuoteResponseDocument = Omit<QuoteResponse, "at" | "recordedAt"> & { at: Date; recordedAt: Date };

/** A quotation as the screens receive it. */
export interface Quotation {
  ref: string;
  /** 1 for the first version; each change after it left the shop adds one. */
  revision: number;
  status: QuoteStatus;
  /** "2026-09-14", the date printed on the form. */
  quoteDate: string;
  /** "Sep 14, 2026" */
  quoteDay: string;
  /** "2026-10-14". Sent and not answered after this day reads as Expired. */
  validUntil: string;
  drNumber: string;
  /** The booking the work is for. Null when none was picked. */
  bookingRef: string | null;
  billTo: QuoteBillTo;
  vehicle: QuoteVehicle;
  serviceAdvisor: string;
  technician: string;
  lines: QuoteLine[];
  discountCents: number;
  /** Set when the discount was given as a percentage of the subtotal; `discountCents` follows it. */
  discountPercent: number | null;
  /** Why the discount was given, for the log and the approver. */
  discountReason: string;
  notes: string;
  source: QuoteSource;
  /** The photo a draft was read from. */
  photoRef: string | null;
  /**
   * Read from a scan of the shop's paper job order: the work already exists,
   * so the quotation is recorded straight as a job order, with no give or
   * approval step.
   */
  paperJobOrder: boolean;
  totals: QuoteTotals;
  /** "Sep 14 · 16:40", when it was last emailed or handed over. */
  sent: string | null;
  /** The address it was emailed to, or how it was handed over. */
  sentTo: string | null;
  preparedBy: QuoteActor | null;
  pricingApproval: QuotePricingApproval | null;
  response: QuoteResponse | null;
  jobOrderRef: string | null;
  /** ISO 8601. */
  updatedAt: string;
}

/** Stored shape. `businessId` is stamped on by `tenantScope`. */
export interface QuotationDocument {
  businessId: string;
  ref: string;
  /** Absent on quotations made before revisions, which read as 1. */
  revision?: number;
  status: StoredQuoteStatus;
  quoteDate: string;
  /** Absent on older quotations, which read as the quote date plus the default validity. */
  validUntil?: string;
  drNumber: string;
  bookingRef?: string | null;
  billTo: QuoteBillTo;
  vehicle: QuoteVehicle;
  serviceAdvisor: string;
  technician: string;
  lines: QuoteLine[];
  discountCents: number;
  /** Absent on quotations from before percentage discounts, which read as a fixed amount. */
  discountPercent?: number | null;
  discountReason?: string;
  notes: string;
  source: QuoteSource;
  /** The photo a draft was read from. */
  photoRef?: string;
  /** Read from a scan of the paper job order. Absent on everything before 20 Nov 2026. */
  paperJobOrder?: boolean;
  sentAt?: Date;
  sentTo?: string;
  /** The user id that created it. */
  createdBy: string;
  /** Absent on quotations made before it was recorded by name. */
  preparedBy?: QuoteActor;
  pricingApproval?: QuotePricingApprovalDocument | null;
  response?: QuoteResponseDocument | null;
  jobOrderRef?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** The content of one version, as the customer could have seen it. */
export type QuoteContent = Pick<
  QuotationDocument,
  "quoteDate" | "drNumber" | "billTo" | "vehicle" | "serviceAdvisor" | "technician" | "lines" | "discountCents" | "notes"
> & { validUntil: string; bookingRef: string | null; discountReason: string; discountPercent: number | null };

/**
 * A version that was superseded. Written once, when a quotation that had left
 * the shop is changed, and never updated, so what the customer was given can
 * always be shown again.
 */
export interface QuotationRevisionDocument {
  businessId: string;
  quotationRef: string;
  revision: number;
  content: QuoteContent;
  status: StoredQuoteStatus;
  sentAt?: Date;
  sentTo?: string;
  preparedBy?: QuoteActor;
  pricingApproval?: QuotePricingApprovalDocument | null;
  response?: QuoteResponseDocument | null;
  supersededAt: Date;
  supersededBy: QuoteActor;
}

/** One superseded version, as the history panel lists it. */
export interface QuotationRevisionSummary {
  revision: number;
  status: StoredQuoteStatus;
  totalCents: number;
  sent: string | null;
  sentTo: string | null;
  response: QuoteResponseOutcome | null;
  /** "Oct 15 · 09:12" */
  superseded: string;
  supersededBy: string;
}

export type QuoteEventKind =
  | "created"
  | "saved"
  | "revised"
  | "discount"
  | "pricing-approved"
  | "sent"
  | "response"
  | "response-cleared"
  | "converted";

/** One line of a quotation's change log. Append-only. */
export interface QuoteEventDocument {
  businessId: string;
  quotationRef: string;
  revision: number;
  kind: QuoteEventKind;
  detail: string;
  by: QuoteActor;
  at: Date;
}

export interface QuoteEvent {
  revision: number;
  kind: QuoteEventKind;
  detail: string;
  by: string;
  /** "Oct 15 · 09:12" */
  at: string;
}

/** What the editor saves. The ref, status and timestamps are the server's. */
export interface QuotationInput {
  quoteDate: string;
  validUntil: string;
  drNumber: string;
  bookingRef: string | null;
  billTo: QuoteBillTo;
  vehicle: QuoteVehicle;
  serviceAdvisor: string;
  technician: string;
  lines: QuoteLine[];
  discountCents: number;
  /** A percentage of the subtotal, or null for a fixed amount. The server works the amount out from it. */
  discountPercent: number | null;
  discountReason: string;
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

/**
 * One job a price list line was used on: who, which car, how many, what it
 * sold for and what it cost. Keyed on the price list by section and wording.
 */
export interface PriceItemUse {
  jobOrderRef: string;
  /** "Nov 20 · 19:47", when the job order was made. */
  when: string;
  /** ISO 8601. */
  at: string;
  customer: string;
  plate: string;
  makeModel: string;
  qty: number;
  unit: string;
  /** What the line sold for: qty × unit price. */
  amountCents: number;
  /** What it cost: the stock it took when taken, otherwise the quoted cost. Null when neither is known. */
  costCents: number | null;
  costSource: "stock" | "quoted" | null;
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
  /** Days a new quotation is valid for from its date. Absent reads as the default. */
  validDays?: number;
  /** A PNG or JPEG data URL, already shrunk in the browser. */
  logo?: string;
  /** People whose signature prints on the PDF beside their name. Saved one at a time, not with the rest. */
  signers?: QuoteSigner[];
  /** Who signs the boxes no quotation names. Matched to `signers` by name. */
  signOff?: Partial<QuoteSignOff>;
  /** The PDF's colours. Absent reads as the classic blue the form was drawn in. */
  pdfColors?: QuotePdfColors;
}

/** The colours the quotation PDF is printed in, as "#RRGGBB". */
export interface QuotePdfColors {
  /** The outer frame, and the box behind the business name when there is no logo. Dark. */
  frame: string;
  /** "QUOTATION", the TOTAL label and the footer. */
  heading: string;
  /** Behind the Bill To bar, the column headings and the notes title. Light, since black text sits on it. */
  shade: string;
  /** The total amount and the notes. */
  highlight: string;
}

/** One person who signs quotations, with their signature as an image. */
export interface QuoteSigner {
  id: string;
  name: string;
  /** A PNG data URL: the ink only, on a transparent background, trimmed in the browser. */
  image: string;
}

/**
 * The signature boxes no quotation fills in itself. Service Advisor and
 * Assigned Technician come from each quotation; the customer signs by hand.
 */
export interface QuoteSignOff {
  accounting: string;
  headTechnician: string;
  manager: string;
}

export type QuotationSettings = Required<Omit<QuotationConfig, "logo" | "signers" | "signOff">> & {
  logo: string | null;
  signers: QuoteSigner[];
  signOff: QuoteSignOff;
};

/** One row of the list. */
export interface QuotationSummary {
  ref: string;
  revision: number;
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
  bookingRef: string | null;
  jobOrderRef: string | null;
  /** The customer's purchase order number, once approved with one. */
  poNumber: string | null;
  /** Approved by the AI from an email; a person has not looked at it yet by making the job order. */
  approvedByAi: boolean;
  updatedAt: string;
}

/** What the model saw in a photo, decided before any line was read. */
export type QuotePhotoKind = "written_estimate" | "service_request" | "supplier_document" | "vehicle_photo" | "other";

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
  /** The business the document is from or for, e.g. the letterhead on a service request. */
  company: string;
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

/**
 * One scanned document and everything that followed from it: who scanned it
 * and when, what the AI read, the quotation it filled in, the job order it
 * became, and that quotation's own history.
 */
export interface ScanRecord {
  ref: string;
  /** "Nov 20 · 19:26" */
  when: string;
  /** ISO 8601. */
  at: string;
  by: string;
  /** What the AI read it as; null when the read failed. */
  readAs: string | null;
  note: string;
  quotation: { ref: string; status: QuoteStatus; totalCents: number; customer: string; plate: string } | null;
  jobOrder: { ref: string; status: JobOrderStatus } | null;
  /** The quotation's history, oldest first. */
  events: QuoteEvent[];
}

/** The photo a draft came from, as the editor shows it beside the lines. */
export interface QuotePhotoView {
  ref: string;
  note: string;
}

/**
 * What a part costs right now, from Inventory or the supplier price book,
 * worked out on the server for the editor. Stock on hand wins, because the job
 * will use those units; otherwise the supplier's planning cost.
 */
export interface QuoteCostSource {
  /** Every wording the part is known by, as match keys: the Inventory name and each supplier's. */
  keys: string[];
  label: string;
  sku: string | null;
  unit: string;
  costCents: number;
  kind: "stock" | "supplier";
  /** "Oldest batch in stock (4 on hand)", "Supplier A · Oct 02, 2026". */
  note: string;
}

/** A booking a quotation can be made for, as the editor's picker lists it. */
export interface QuoteBookingOption {
  ref: string;
  customer: string;
  service: string;
  /** "Oct 15" */
  day: string;
  status: string;
  customerRef: string | null;
  vehicleRef: string | null;
  email: string;
  phone: string;
}

/** The quotations made for one booking, for its drawer. */
export interface BookingQuoteLink {
  ref: string;
  status: QuoteStatus;
  jobOrderRef: string | null;
}

// ---- Job orders ------------------------------------------------------------------

export type JobOrderStatus = "Open" | "In progress" | "Completed" | "Cancelled";

/**
 * The Inventory stock one job order line took: the "Used on job order"
 * movement, the batches it drew oldest first, and what those units cost.
 * That cost is the line's actual cost, set against the quoted one.
 */
export interface JobLineStock {
  moveRef: string;
  quantity: number;
  /** For the whole quantity, from the batches drawn. */
  costCents: number;
  batches: BatchDraw[];
  takenAt: Date;
  /** The "Returned from job order" movement, once a cancelled job gave the units back. */
  returnMoveRef: string | null;
}

/**
 * One approved line carried onto the job. The quoted figures are fixed at
 * conversion. A part linked to an Inventory item takes its stock when the job
 * order is made (`stock`), which gives the line its actual cost.
 */
export interface JobOrderLine {
  id: string;
  section: QuoteSection;
  description: string;
  qty: number;
  unit: string;
  unitPriceCents: number;
  /** Per unit, as quoted. */
  quotedCostCents: number | null;
  sku: string | null;
  /** Absent or null until the stock is taken. */
  stock?: JobLineStock | null;
  /** Set while a request is taking this line's stock, so two cannot take it twice. */
  stockClaimAt?: Date | null;
}

/** What a line in a job order's history is about. */
export type JobOrderEventKind = "created" | "quotation-changed" | "stock" | "cancelled";

/** A job order's history, append-only. */
export interface JobOrderEventDocument {
  businessId: string;
  jobOrderRef: string;
  kind: JobOrderEventKind;
  detail: string;
  by: QuoteActor;
  at: Date;
}

export interface JobOrderEvent {
  kind: JobOrderEventKind;
  detail: string;
  by: string;
  /** "Nov 20 · 19:47" */
  at: string;
}

/**
 * One taking of stock for a job: which part, how many, what it cost, and the
 * customer and car it was used for. Read from the job order lines, so it is
 * right for job orders made before movements named the customer.
 */
export interface JobPartUse {
  moveRef: string;
  sku: string;
  /** As worded on the job order. */
  description: string;
  quantity: number;
  unit: string;
  /** For the whole quantity, from the batches drawn. */
  costCents: number;
  /** ISO 8601, when it was taken. */
  occurredAt: string;
  /** "Nov 18 · 18:47" */
  when: string;
  jobOrderRef: string;
  jobStatus: JobOrderStatus;
  customer: string;
  plate: string;
  makeModel: string;
  /** Put back in stock when the job order was cancelled. */
  returned: boolean;
}

/** Where a job order line stands with Inventory, for the screen. */
export type JobLineStockState =
  /** Labor, or a part not linked to an Inventory item. */
  | "none"
  /** Linked, but not taken yet: not enough on hand, or made before stock was taken automatically. */
  | "waiting"
  | "taken"
  /** Taken, then put back when the job order was cancelled. */
  | "returned";

export interface JobOrderLineView {
  id: string;
  section: QuoteSection;
  description: string;
  qty: number;
  unit: string;
  unitPriceCents: number;
  quotedCostCents: number | null;
  sku: string | null;
  stockState: JobLineStockState;
  /** What the stock taken cost, for the whole line. Null unless taken. */
  actualCostCents: number | null;
  /** "MV-1042 · Oct 15 · 09:12" */
  stockNote: string | null;
}

export interface JobOrderDocument {
  businessId: string;
  ref: string;
  quotationRef: string;
  quotationRevision: number;
  bookingRef: string | null;
  status: JobOrderStatus;
  billTo: QuoteBillTo;
  vehicle: QuoteVehicle;
  serviceAdvisor: string;
  technician: string;
  lines: JobOrderLine[];
  discountCents: number;
  /** What the customer approved, fixed at conversion. */
  approvedTotalCents: number;
  approvedAt: Date;
  approvedByCustomer: string;
  /** The customer's purchase order number. Absent before 24 Nov 2026, or when there was none. */
  poNumber?: string | null;
  /** Reserved for invoicing; nothing writes it yet. */
  invoiceRef: string | null;
  /** The scan of the paper job order (or other photo) the quotation was read from. Absent before 20 Nov 2026. */
  photoRef?: string | null;
  createdBy: QuoteActor;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobOrder {
  ref: string;
  quotationRef: string;
  quotationRevision: number;
  bookingRef: string | null;
  status: JobOrderStatus;
  billTo: QuoteBillTo;
  vehicle: QuoteVehicle;
  serviceAdvisor: string;
  technician: string;
  lines: JobOrderLineView[];
  discountCents: number;
  approvedTotalCents: number;
  /** "Oct 15, 2026 · 09:12" */
  approvedAt: string;
  approvedByCustomer: string;
  poNumber: string | null;
  /** Quoted cost of the lines that carry one. Internal. */
  quotedCostCents: number;
  quotedMarginCents: number;
  quotedMarginPercent: number | null;
  costedLines: number;
  /**
   * Cost with each part taken from stock at what its batches cost, and every
   * other costed line at its quoted cost. Internal.
   */
  actualCostCents: number;
  actualMarginCents: number;
  actualMarginPercent: number | null;
  /** Lines whose cost is the stock actually used. */
  stockLines: number;
  /** Linked parts not taken from stock yet. */
  waitingLines: number;
  /** The scan or photo the work was read from, for viewing beside the job. */
  photoRef: string | null;
  createdBy: string;
  /** "Oct 15 · 09:12" */
  created: string;
  updatedAt: string;
}

export interface JobOrderSummary {
  ref: string;
  quotationRef: string;
  quotationRevision: number;
  bookingRef: string | null;
  status: JobOrderStatus;
  customer: string;
  plate: string;
  makeModel: string;
  approvedTotalCents: number;
  created: string;
  updatedAt: string;
}
