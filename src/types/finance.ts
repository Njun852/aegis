/**
 * Finance: the records behind the Monthly Income Report and the Financial
 * Standing Report, and the frozen reports themselves.
 *
 * The two reports never share a calculation. Income reads invoices and bills
 * by the day they are dated; Standing reads account balances and what is
 * still owed on a given day. Payments move balances and settle invoices and
 * bills, but are never income or expense in themselves.
 *
 * Every day here is a Manila calendar day held as a "2026-09-30" key, the way
 * bookings hold `dateKey`, so no server timezone can move a record into the
 * next month. Months are "2026-09".
 */

/** "2026-09-30", a calendar day in Asia/Manila. */
export type DateKey = string;
/** "2026-09". */
export type MonthKey = string;

// ---- Money accounts -----------------------------------------------------------

/**
 * A passbook is a bank account, not a separate pot of money, so it is a kind
 * of `bank` rather than a type of its own. Standing adds each account once.
 */
export type MoneyAccountType = "cash" | "bank" | "ewallet";
export type BankAccountKind = "account" | "passbook";

export interface MoneyAccountDocument {
  businessId: string;
  /** MA-… */
  ref: string;
  type: MoneyAccountType;
  /** Only for `bank`. */
  bankKind?: BankAccountKind;
  /** "Petty cash", "BDO savings", "GCash 0917…". */
  name: string;
  /** Bank or e-wallet provider. Empty for cash. */
  institution: string;
  /** Shown on screen to tell accounts apart; the full number is never stored. */
  numberLast4: string;
  /**
   * Identifies the real account behind the record, so the same bank account
   * cannot be entered once as a bank account and again as a passbook. A hash
   * of the institution and number; absent for cash, which has no number.
   */
  accountKey?: string;
  /** Balance at the start of `openingDate`. */
  openingBalanceCents: number;
  openingDate: DateKey;
  /** Set aside, never deleted, so its history stays. */
  active: boolean;
  createdBy?: string;
  createdAt: Date;
  /** Who made the last change; absent until the account is first changed. */
  updatedBy?: string;
  updatedAt: Date;
}

export type MoneyAccount = Omit<MoneyAccountDocument, "businessId" | "createdBy" | "createdAt" | "updatedBy" | "updatedAt" | "accountKey">;

// ---- Receivables and payables -------------------------------------------------

/** `void` is kept rather than deleted, so a cancelled document leaves a trail. */
export type FinanceDocumentStatus = "open" | "void";

/**
 * What a receivable over 90 days must carry. "Not yet paid" is not a remark;
 * `ar90Problems` in `src/lib/finance.ts` says what is missing or too vague.
 */
export interface ArFollowUp {
  reasonUnpaid: string;
  remarks: string;
  responsiblePerson: string;
  lastAction: string;
  nextAction: string;
  nextFollowUpDate: DateKey | null;
}

export interface InvoiceDocument {
  businessId: string;
  /** INV-… */
  ref: string;
  /** The number printed on the invoice; unique per business. */
  number: string;
  customerName: string;
  customerRef?: string;
  /** The job order it bills, when there is one. */
  jobOrderRef?: string;
  /** The month this sale belongs to is the month of this day. */
  invoiceDate: DateKey;
  dueDate: DateKey;
  amountCents: number;
  status: FinanceDocumentStatus;
  /**
   * Entered at go-live for money already owed then. Dated before the first
   * reported month, so it is never a sale in any report, only AR.
   */
  opening: boolean;
  followUp: ArFollowUp;
  /** As with bills: a void invoice gives up its job order so the work can be invoiced again. */
  voidedJobOrderRef?: string;
  /** The intake item (IN-…) it was posted from, when it was read from a photo or PDF. */
  intakeRef?: string;
  voidReason?: string;
  createdBy: string;
  createdAt: Date;
  /** Who made the last change; absent until the invoice is first changed. */
  updatedBy?: string;
  updatedAt: Date;
}

/** The nine lines of the simple expense breakdown, in the order printed. */
export type ExpenseCategory =
  | "parts"
  | "payroll"
  | "contractors"
  | "utilities"
  | "advertising"
  | "rent"
  | "shop-supplies"
  | "equipment"
  | "other";

export interface BillDocument {
  businessId: string;
  /** BL-… */
  ref: string;
  /** Supplier or payee, as named on the bill. */
  payee: string;
  supplierRef?: string;
  /** The supplier receipt (GR-…) it was made from; at most one bill each. */
  receiptRef?: string;
  /** The payee's own invoice or reference number. */
  reference: string;
  /** The month this cost belongs to is the month of this day. */
  billDate: DateKey;
  dueDate: DateKey;
  amountCents: number;
  category: ExpenseCategory;
  status: FinanceDocumentStatus;
  opening: boolean;
  responsiblePerson: string;
  remarks: string;
  /**
   * A void bill gives up `receiptRef` and keeps it here, so the receipt can be
   * billed again correctly while the unique index still allows one live bill.
   */
  voidedReceiptRef?: string;
  /** The intake item (IN-…) it was posted from, when it was read from a photo or PDF. */
  intakeRef?: string;
  voidReason?: string;
  createdBy: string;
  createdAt: Date;
  /** Who made the last change; absent until the bill is first changed. */
  updatedBy?: string;
  updatedAt: Date;
}

// ---- Payments -----------------------------------------------------------------

/**
 * - `collection`: money in against an invoice.
 * - `bill`: money out against a bill.
 * - `transfer`: a move between two of the business's own accounts, out of
 *   `accountRef` and into `toAccountRef`. One document, not two legs: the
 *   local Mongo has no transactions, and a half-written pair would leave money
 *   missing from one account. The total held does not change.
 * - `other`: money in or out that is neither income nor expense, such as the
 *   owner putting money in or taking it out, or a reconciliation adjustment.
 *   Moves a balance only.
 */
export type PaymentKind = "collection" | "bill" | "transfer" | "other";
export type PaymentDirection = "in" | "out";

/**
 * What a Money In or Money Out entry is. A sale and an expense are posted as
 * an invoice or a bill settled the same day, so they count in Income like any
 * other; the rest are `other` payments that move a balance and are never
 * income or expense.
 */
export type MoneyNature =
  | "sale"
  | "owner-capital"
  | "loan-received"
  | "other-in"
  | "expense"
  | "owner-drawing"
  | "loan-repayment"
  | "other-out";

/**
 * - `card`: the merchant discount (MDR) a card terminal keeps.
 * - `bank`: a bank's charge for a transfer, a cheque or a deposit.
 * - `ewallet`: GCash, Maya and the like, for cash-in, cash-out or a payment.
 */
export type FeeKind = "card" | "bank" | "ewallet";

/**
 * What a payment cost to make or receive. Never part of `amountCents`, which
 * is the gross that settles the invoice or bill or is moved: money in arrives
 * net of the fee, money out leaves with the fee on top. The fee is an expense
 * of the month it was paid in.
 */
export interface PaymentFee {
  cents: number;
  kind: FeeKind;
  /** The rule it was worked out from (FR-…), when one was used. */
  ruleRef?: string;
}

export interface PaymentDocument {
  businessId: string;
  /** PY-… */
  ref: string;
  accountRef: string;
  /** `out` for a transfer: it leaves `accountRef`. */
  direction: PaymentDirection;
  kind: PaymentKind;
  /** The gross: what settles the invoice or bill, or what is moved. */
  amountCents: number;
  /** For a transfer, charged to the account the money leaves. */
  fee?: PaymentFee;
  paidOn: DateKey;
  invoiceRef?: string;
  billRef?: string;
  /** Only for a transfer: the account the money arrives in. */
  toAccountRef?: string;
  /** An adjustment made when resolving this count (RC-…). */
  reconciliationRef?: string;
  /** Only on an `other` payment entered as Money In or Money Out: what it is. */
  nature?: MoneyNature;
  /** Who the money came from or went to, on an `other` payment. */
  party?: string;
  /** The deposit slip, receipt or transfer reference, on an `other` payment. */
  reference?: string;
  note: string;
  status: "recorded" | "void";
  voidReason?: string;
  createdBy: string;
  createdAt: Date;
  /** Set when it is voided, the only change a payment ever has. */
  updatedBy?: string;
  updatedAt?: Date;
}

export type Payment = Omit<PaymentDocument, "businessId" | "createdAt" | "updatedAt"> & {
  /** ISO time it was recorded. */
  createdAt: string;
  /** ISO time it was voided. */
  updatedAt: string | null;
};

export interface FinanceActor {
  userId: string;
  name: string;
}

/** One field of a record as it was before a change and as it is after, both as shown on screen. */
export interface FieldChange {
  field: string;
  from: string;
  to: string;
}

/** Append-only: who did what to which finance record, and when. */
export interface FinanceEventDocument {
  businessId: string;
  at: Date;
  actor: FinanceActor;
  /** "account.created", "transfer.recorded", "count.resolved"… */
  action: string;
  ref: string;
  detail: string;
  /** For a correction: every field it changed, old and new. */
  changes?: FieldChange[];
  /** For a correction: why it was made. */
  reason?: string;
}

/** Who made a record and who changed it last, as a drawer shows it. */
export interface RecordAudit {
  createdBy: string;
  /** ISO time. */
  createdAt: string;
  updatedBy: string | null;
  /** ISO time; null until the record is first changed. */
  updatedAt: string | null;
  /** Where the record came from: "Entered in Finance", "Supplier receipt GR-1001"… */
  source: string;
}

// ---- Attachments --------------------------------------------------------------

export type AttachmentType = "image/jpeg" | "application/pdf";

/**
 * A photo or PDF of the document behind a finance record: the supplier's
 * invoice, the official receipt, the deposit slip. Kept with the record and
 * never deleted, so the record can always be checked against its source.
 */
export interface FinanceAttachmentDocument {
  businessId: string;
  /** FA-… */
  ref: string;
  /** The record it supports: INV-…, BL-… or PY-… */
  recordRef: string;
  /** The file's name as uploaded. */
  name: string;
  contentType: AttachmentType;
  /** A data URL; images are shrunk in the browser first. */
  dataUrl: string;
  bytes: number;
  /** SHA-256 of the bytes: the same file on two records is a likely duplicate. */
  sha256: string;
  uploadedBy: string;
  uploadedAt: Date;
}

/** An attachment as the drawer lists it, without its bytes. */
export interface FinanceAttachment {
  ref: string;
  recordRef: string;
  name: string;
  contentType: AttachmentType;
  bytes: number;
  uploadedBy: string;
  uploadedAt: string;
}

// ---- Invoice and receipt intake ------------------------------------------------

/**
 * What a document is, as read. A supplier's invoice or receipt is money out
 * (a bill); a sales invoice or official receipt the business issued is money
 * in (an invoice).
 */
export type IntakeDocType = "supplier-invoice" | "supplier-receipt" | "sales-invoice" | "official-receipt" | "other";
export type IntakePaymentMethod = "cash" | "card" | "bank" | "ewallet" | "cheque" | "unpaid" | "unknown";
export type IntakeConfidence = "high" | "medium" | "low";
/** The fields whose reading the model rates; a doubtful one is marked for the reviewer. */
export type IntakeRatedField = "party" | "reference" | "date" | "amount" | "dueDate" | "category";

/** A document as the model read it. Never posted as it is: a person confirms every field. */
export interface IntakeExtraction {
  docType: IntakeDocType;
  /** `in` when the business issued it and is paid, `out` when the business pays. */
  direction: PaymentDirection;
  /** The supplier on money out, the customer on money in. */
  party: string;
  /** The invoice, receipt or OR number as printed. */
  reference: string;
  date: DateKey | null;
  dueDate: DateKey | null;
  /** The total, in centavos. */
  amountCents: number | null;
  /** A card, bank or e-wallet fee printed on it, in centavos. */
  feeCents: number | null;
  paymentMethod: IntakePaymentMethod;
  /** A receipt, or an invoice marked paid. */
  paid: boolean;
  category: ExpenseCategory | null;
  description: string;
  /** The business it is addressed to or issued by, as printed, to check it belongs here. */
  businessName: string;
  /** The branch printed on it, if any. */
  branch: string;
  confidence: Record<IntakeRatedField, IntakeConfidence>;
  summary: string;
  warnings: string[];
}

/**
 * - `unread`: stored, not read yet (the AI was off, over its limit, or failed).
 * - `review`: read, waiting for a person to check it and post it.
 * - `posting`: claimed by one confirm, so a double click cannot post twice.
 * - `posted`: a bill or invoice was made from it; the file moved to that record.
 * - `discarded`: a person set it aside with a reason; removed after 90 days.
 */
export type IntakeStatus = "unread" | "review" | "posting" | "posted" | "discarded";

/**
 * One uploaded photo or PDF in the Review Queue. The AI only fills
 * `extraction`; nothing becomes a financial record until a person confirms it.
 */
export interface FinanceIntakeDocument {
  businessId: string;
  /** IN-… */
  ref: string;
  name: string;
  contentType: AttachmentType;
  /** Until posted; then it lives on the record's attachment. */
  dataUrl?: string;
  bytes: number;
  sha256: string;
  status: IntakeStatus;
  extraction: IntakeExtraction | null;
  /** Why it was not read, when it was not. */
  readError?: string;
  /** Whether a read reached the model, which is what the daily limit counts. */
  billed: boolean;
  /** Intake items and records already holding the same file, found on upload. */
  sameFileAs: string[];
  uploadedBy: string;
  uploadedAt: Date;
  readAt?: Date;
  posted?: { kind: "bill" | "invoice"; ref: string; attachmentRef: string };
  postedBy?: string;
  postedAt?: Date;
  discardedBy?: string;
  discardedAt?: Date;
  discardReason?: string;
}

/** An intake item as the Review Queue lists it, without its bytes. */
export interface IntakeItem {
  ref: string;
  name: string;
  contentType: AttachmentType;
  bytes: number;
  status: IntakeStatus;
  extraction: IntakeExtraction | null;
  readError: string;
  /** Why it needs a closer look; empty when it reads cleanly. */
  reviewReasons: string[];
  sameFileAs: string[];
  /** Bills or invoices on file it may repeat. */
  possibleDuplicates: DuplicateMatch[];
  uploadedBy: string;
  uploadedAt: string;
  posted: FinanceIntakeDocument["posted"] | null;
  postedBy: string;
  postedAt: string | null;
  discardedBy: string;
  discardedAt: string | null;
  discardReason: string;
}

/** What a person confirms in the Review Queue: every field, checked. */
export interface IntakePostInput {
  direction: PaymentDirection;
  party: string;
  reference: string;
  date: DateKey;
  dueDate: DateKey;
  amountCents: number;
  /** Only for a bill. */
  category: ExpenseCategory | null;
  /** Settled already: posted with its payment or collection on the same day. */
  paid: boolean;
  accountRef: string | null;
  fee: PaymentFeeInput | null;
  description: string;
  confirmedDuplicates: string[];
}

/** Today's reading against the daily limit, for the queue's header. */
export interface IntakeAllowance {
  readToday: number;
  perDay: number;
  /** False once the month's AI budget share for intake is spent, or AI is off. */
  available: boolean;
  note: string;
}

// ---- Fee rules ----------------------------------------------------------------

/**
 * How a fee is worked out: a percentage of the gross, a fixed amount, or both,
 * as "2.5% + ₱15". Administrators keep the list; a payment can always take a
 * different fee than its rule gives, since the bank's statement is what counts.
 */
export interface FeeRuleDocument {
  businessId: string;
  /** FR-… */
  ref: string;
  /** "BDO card terminal", "InstaPay transfer", "GCash cash-out". */
  name: string;
  kind: FeeKind;
  /** Hundredths of a percent: 250 is 2.5%. */
  percentBps: number;
  fixedCents: number;
  active: boolean;
  createdBy: string;
  createdAt: Date;
  updatedBy?: string;
  updatedAt: Date;
}

export type FeeRule = Pick<FeeRuleDocument, "ref" | "name" | "kind" | "percentBps" | "fixedCents" | "active">;

export interface FeeRuleInput {
  name: string;
  kind: FeeKind;
  percentBps: number;
  fixedCents: number;
}

/** A fee as a payment form sends it. */
export interface PaymentFeeInput {
  cents: number;
  kind: FeeKind;
  ruleRef: string | null;
}

// ---- Duplicates ---------------------------------------------------------------

/** An existing record that a new one looks like, and why. */
export interface DuplicateMatch {
  ref: string;
  /** "Davao Auto Parts · DR 4471 · ₱12,500.00 · Oct 3, 2026". */
  label: string;
  /** "Same reference number and supplier", "Same supplier, date and amount"… */
  reason: string;
}

// ---- Screen shapes ------------------------------------------------------------

export interface MoneyAccountInput {
  type: MoneyAccountType;
  bankKind: BankAccountKind | null;
  name: string;
  institution: string;
  /** Read once to make `accountKey` and `numberLast4`; never stored whole. */
  accountNumber: string;
  openingBalanceCents: number;
  openingDate: DateKey;
}

/** Money In or Money Out as the form sends it. */
export interface MoneyEntryInput {
  direction: PaymentDirection;
  nature: MoneyNature;
  accountRef: string;
  /** The gross. */
  amountCents: number;
  fee: PaymentFeeInput | null;
  paidOn: DateKey;
  /** The customer, supplier, lender or owner. */
  party: string;
  /** The official receipt, sales invoice, deposit slip or transfer number. */
  reference: string;
  description: string;
  /** Only for an expense. */
  category: ExpenseCategory | null;
  confirmedDuplicates: string[];
}

/** One payment as its drawer shows it. */
export interface PaymentDetail extends Payment {
  accountName: string;
  toAccountName: string | null;
  audit: RecordAudit;
}

export interface TransferInput {
  fromRef: string;
  toRef: string;
  amountCents: number;
  /** Charged to `fromRef` on top of the amount moved. */
  fee: PaymentFeeInput | null;
  paidOn: DateKey;
  note: string;
}

export interface Reconciliation {
  ref: string;
  accountRef: string;
  asOf: DateKey;
  countedCents: number;
  bookCents: number;
  differenceCents: number;
  status: ReconciliationDocument["status"];
  resolution: string;
  resolvedBy: string;
  createdBy: string;
}

export interface BillInput {
  payee: string;
  supplierRef: string | null;
  /** Set when the bill is made from a supplier receipt. */
  receiptRef: string | null;
  reference: string;
  billDate: DateKey;
  dueDate: DateKey;
  amountCents: number;
  category: ExpenseCategory;
  responsiblePerson: string;
  remarks: string;
  /** Paid in full when it was entered: a cash expense. */
  paidFrom: { accountRef: string; paidOn: DateKey; fee: PaymentFeeInput | null } | null;
  /**
   * The refs of the possible duplicates the person was shown and saved past.
   * A new bill that looks like one on record is refused until they have.
   */
  confirmedDuplicates: string[];
}

export interface BillPaymentInput {
  accountRef: string;
  /** The gross, settling the bill or invoice. */
  amountCents: number;
  fee: PaymentFeeInput | null;
  paidOn: DateKey;
  note: string;
}

/** "Unpaid", "Part paid", "Paid", or "Void". */
export type BillPayState = "Unpaid" | "Part paid" | "Paid" | "Void";

/** One bill as the Payables tab lists it, worked out for today. */
export interface BillSummary {
  ref: string;
  payee: string;
  supplierRef: string | null;
  receiptRef: string | null;
  reference: string;
  billDate: DateKey;
  dueDate: DateKey;
  amountCents: number;
  paidCents: number;
  outstandingCents: number;
  category: ExpenseCategory;
  state: BillPayState;
  /** Only for a bill with something still to pay. */
  group: ApStatusGroup | null;
  daysUntilDue: number;
  responsiblePerson: string;
  remarks: string;
  voidReason: string;
  createdBy: string;
  audit: RecordAudit;
  /** Recorded and void, newest first. */
  payments: (Payment & { accountName: string })[];
}

/** A posted supplier receipt no bill has been made from yet. */
export interface UnbilledReceipt {
  ref: string;
  supplierRef: string;
  supplierName: string;
  terms: string;
  receiptNo: string;
  receivedDate: DateKey;
  totalCents: number;
  /** From the supplier's terms when they can be read ("30 days", "Cash"). */
  suggestedDueDate: DateKey | null;
}

/** A supplier to pick as a bill's payee. */
export interface PayeeOption {
  ref: string;
  name: string;
  terms: string;
}

export interface InvoiceInput {
  customerName: string;
  customerRef: string | null;
  /** Set when the invoice bills a completed job order. */
  jobOrderRef: string | null;
  number: string;
  invoiceDate: DateKey;
  dueDate: DateKey;
  amountCents: number;
  responsiblePerson: string;
  remarks: string;
  nextFollowUpDate: DateKey | null;
  /** Collected in full when it was entered: a cash sale. */
  collectedInto: { accountRef: string; paidOn: DateKey; fee: PaymentFeeInput | null } | null;
  /** As on a bill: the possible duplicates the person saved past. */
  confirmedDuplicates: string[];
}

/** A collection is a bill payment in the other direction: money into an account. */
export type CollectionInput = BillPaymentInput;

/** One invoice as the Receivables tab lists it, worked out for today. */
export interface InvoiceSummary {
  ref: string;
  number: string;
  customerName: string;
  customerRef: string | null;
  jobOrderRef: string | null;
  invoiceDate: DateKey;
  dueDate: DateKey;
  amountCents: number;
  collectedCents: number;
  outstandingCents: number;
  state: BillPayState;
  daysOutstanding: number;
  /** Only for an invoice with something still to collect. */
  bucket: ArAgingBucket | null;
  daysUntilDue: number;
  followUp: ArFollowUp;
  /** What the 90+ day control still needs; empty when met or not yet 90 days. */
  problems: { field: keyof ArFollowUp; message: string }[];
  voidReason: string;
  createdBy: string;
  audit: RecordAudit;
  /** Recorded and void, newest first. */
  payments: (Payment & { accountName: string })[];
}

/** A completed job order with no live invoice. */
export interface UninvoicedJob {
  ref: string;
  customerName: string;
  customerRef: string | null;
  vehicle: string;
  approvedTotalCents: number;
  /** "2026-10-15", when the customer approved it. */
  approvedDate: DateKey;
}

/** A CRM customer to pick as who is billed. */
export interface CustomerOption {
  ref: string;
  name: string;
}

/** One line of an invoice's history, from the audit log. */
export interface FinanceEventLine {
  /** The record the line is about, which for a bill's history may be one of its payments. */
  ref: string;
  at: string;
  actor: string;
  action: string;
  detail: string;
  changes: FieldChange[];
  reason: string;
}

/** What a drawer shows under a record: its history and the documents behind it. */
export interface RecordTrail {
  history: FinanceEventLine[];
  attachments: FinanceAttachment[];
}

/** A count as the screen lists it, with what the book says for that day now. */
export interface CountRow extends Reconciliation {
  /** Differs from `bookCents` once a payment for that day is recorded later. */
  bookNowCents: number;
}

/** One account as the Accounts tab lists it, with its balance today. */
export interface MoneyAccountSummary extends MoneyAccount {
  audit: RecordAudit;
  balanceCents: number;
  /** What the balance is made of, oldest first; adds up to `balanceCents`. */
  rows: SourceRow[];
  lastCount: Reconciliation | null;
  openCounts: number;
  hasActivity: boolean;
  /** Transfers and adjustments in `rows`, which can be voided from here. */
  voidableRefs: string[];
}

// ---- Reconciliation -----------------------------------------------------------

/**
 * A counted cash box, or a passbook or statement balance, set against what
 * AEGIS has on record for the same day. A difference stays an alert until an
 * administrator resolves it.
 */
export interface ReconciliationDocument {
  businessId: string;
  /** RC-… */
  ref: string;
  accountRef: string;
  asOf: DateKey;
  countedCents: number;
  bookCents: number;
  differenceCents: number;
  status: "matched" | "open" | "resolved";
  resolution?: string;
  resolvedBy?: string;
  resolvedAt?: Date;
  createdBy: string;
  createdAt: Date;
}

// ---- Figures and drill-down ---------------------------------------------------

/**
 * One row behind a figure. Signed: a figure's amount is always the sum of its
 * rows, which is what lets every number on screen open into the records that
 * make it up and add back to the same total.
 */
export interface SourceRow {
  kind: "invoice" | "bill" | "payment" | "opening" | "count";
  ref: string;
  dateKey: DateKey;
  label: string;
  amountCents: number;
  /** For an opening balance, payment or count: the account it belongs to, so the row can open it. */
  accountRef?: string;
}

export interface Figure {
  cents: number;
  rows: SourceRow[];
}

export interface IncomeFigures {
  /** The period: "2026-09" for a month, "2026" for the annual report. */
  month: MonthKey;
  sales: Figure;
  costs: Figure;
  /** Costs split nine ways; together they are `costs`. */
  byCategory: Record<ExpenseCategory, Figure>;
  netIncomeCents: number;
  /** One decimal place; null when there were no sales to divide by. */
  netMarginPercent: number | null;
}

/** One month's line in the annual report's January-to-December table. */
export interface MonthIncomeLine {
  month: MonthKey;
  salesCents: number;
  costsCents: number;
  netIncomeCents: number;
}

/** The year's income, with the twelve months that make it up. */
export interface AnnualIncomeFigures extends IncomeFigures {
  months: MonthIncomeLine[];
}

export interface StandingFigures {
  asOf: DateKey;
  cash: Figure;
  /** Bank accounts and passbooks together, each account once. */
  bank: Figure;
  /** The two parts of `bank`, shown as separate lines; they add up to it. */
  bankAccounts: Figure;
  passbooks: Figure;
  ewallet: Figure;
  receivable: Figure;
  payable: Figure;
  /** Cash + Bank/Passbook + E-wallet + AR - AP. */
  positionCents: number;
}

/**
 * The exceptions the Financial Standing Report lists below the position, each
 * worked out for the same day so they can be frozen with it.
 */
export interface StandingAttention {
  asOf: DateKey;
  /** Outstanding on invoices more than 90 days old on `asOf`. */
  ar90: Figure;
  /** Outstanding on bills past their due date on `asOf`. */
  apOverdue: Figure;
  /** Outstanding on bills due from `asOf` to seven days after. */
  apDue7: Figure;
  /** Counts on or before `asOf` whose difference nobody has explained. */
  differences: Figure;
}

/** One line on the owner's critical list. */
export interface FinanceAlert {
  key: "ar90" | "ap-overdue" | "ap-due7" | "differences" | "follow-up" | "uninvoiced" | "unbilled" | "corrections";
  title: string;
  detail: string;
  /** Empty for an alert that counts records rather than money. */
  amount: string;
  /** Where to deal with it. */
  href: string;
  tone: "negative" | "warning";
}

/** The owner's Finance screen: five figures, and only what needs attention. */
export interface FinanceOverview {
  today: DateKey;
  month: MonthKey;
  income: IncomeFigures;
  standing: StandingFigures;
  alerts: FinanceAlert[];
}

// ---- Aging and due dates ------------------------------------------------------

export type ArAgingBucket = "0-30" | "31-60" | "61-90" | "90+";

export type ApStatusGroup =
  | "due-later"
  | "due-30"
  | "due-7"
  | "due-today"
  | "overdue"
  | "critical-overdue";

// ---- Frozen reports -----------------------------------------------------------

/**
 * Income and Standing are separate reports with separate snapshots, never one
 * document holding both. The annual pair follows the same rule.
 */
export type FinanceReportKind = "income" | "standing" | "annual-income" | "year-end-standing";

export type MonthlyReportKind = "income" | "standing";

/**
 * One revision of one report, frozen: the figures with the rows behind them,
 * so its drill-down still adds up however the records change later. Written
 * once and never updated; a correction is a new revision.
 */
export interface FinanceReportDocument {
  businessId: string;
  kind: FinanceReportKind;
  /** "2026-09" for the monthly pair, "2026" for the annual pair. */
  period: string;
  /** 1 on the automatic close; each approved correction adds one. */
  revision: number;
  /** Report A's figures. Only on an income report; the annual one also has its twelve months. */
  income?: IncomeFigures | AnnualIncomeFigures;
  /** Report B's figures and exceptions at the end of the period. Only on a standing report. */
  standing?: StandingFigures;
  attention?: StandingAttention;
  /** Account names as they were, so the frozen drill-down reads the same later. */
  accountNames: Record<string, string>;
  businessName: string;
  /** Why this revision exists. Empty for revision 1. */
  reason: string;
  generatedAt: Date;
  /** "AEGIS (automatic close)", or the administrator who issued a revision. */
  generatedBy: string;
}

/** A closed month's official report, and whether the records still agree with it. */
export interface OfficialReport {
  kind: MonthlyReportKind;
  period: string;
  title: string;
  revision: number;
  generatedAt: string;
  changed: boolean;
}

/** A frozen revision as the browser receives it: dates as strings, no tenant id. */
export type FinanceReportView = Omit<FinanceReportDocument, "businessId" | "generatedAt"> & { generatedAt: string };

/** The PDF of one revision, made when the revision was and kept with it. */
export interface FinanceReportFileDocument {
  businessId: string;
  kind: FinanceReportKind;
  period: string;
  revision: number;
  pdf: Uint8Array;
  bytes: number;
  createdAt: Date;
}

/** One line of what changed in a figure since a report froze it. */
export interface RowChange {
  ref: string;
  kind: SourceRow["kind"];
  label: string;
  dateKey: DateKey;
  /** Null when the record was not in the frozen report. */
  fromCents: number | null;
  /** Null when the record is no longer in the figure. */
  toCents: number | null;
}

export interface FigureChange {
  label: string;
  fromCents: number;
  toCents: number;
  rows: RowChange[];
}

/** A revision as the archive lists it, without its rows. */
export interface ReportRevision {
  kind: FinanceReportKind;
  period: string;
  revision: number;
  title: string;
  reason: string;
  generatedAt: string;
  generatedBy: string;
  /** Net income for an income report, the position for a standing report. */
  headlineCents: number;
}

/**
 * One period in the archive: a month and its two reports, or a year and its
 * two year-end reports. Every revision, and what has changed since.
 */
export interface ArchiveMonth {
  /** "2026-09" for a month, "2026" for a year. */
  period: string;
  /** True for a year: `income` then holds the annual income report and `standing` the year-end standing. */
  annual: boolean;
  income: ReportRevision[];
  standing: ReportRevision[];
  /** Differences between the current revision and the records now, per report. */
  incomeChanges: FigureChange[];
  standingChanges: FigureChange[];
}
