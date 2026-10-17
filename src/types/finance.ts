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
  createdAt: Date;
  updatedAt: Date;
}

export type MoneyAccount = Omit<MoneyAccountDocument, "businessId" | "createdAt" | "updatedAt" | "accountKey">;

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
  createdBy: string;
  createdAt: Date;
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
  voidReason?: string;
  createdBy: string;
  createdAt: Date;
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

export interface PaymentDocument {
  businessId: string;
  /** PY-… */
  ref: string;
  accountRef: string;
  /** `out` for a transfer: it leaves `accountRef`. */
  direction: PaymentDirection;
  kind: PaymentKind;
  amountCents: number;
  paidOn: DateKey;
  invoiceRef?: string;
  billRef?: string;
  /** Only for a transfer: the account the money arrives in. */
  toAccountRef?: string;
  /** An adjustment made when resolving this count (RC-…). */
  reconciliationRef?: string;
  note: string;
  status: "recorded" | "void";
  voidReason?: string;
  createdBy: string;
  createdAt: Date;
}

export type Payment = Omit<PaymentDocument, "businessId" | "createdAt">;

export interface FinanceActor {
  userId: string;
  name: string;
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

export interface TransferInput {
  fromRef: string;
  toRef: string;
  amountCents: number;
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
  paidFrom: { accountRef: string; paidOn: DateKey } | null;
}

export interface BillPaymentInput {
  accountRef: string;
  amountCents: number;
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

/** A count as the screen lists it, with what the book says for that day now. */
export interface CountRow extends Reconciliation {
  /** Differs from `bookCents` once a payment for that day is recorded later. */
  bookNowCents: number;
}

/** One account as the Accounts tab lists it, with its balance today. */
export interface MoneyAccountSummary extends MoneyAccount {
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
  kind: "invoice" | "bill" | "payment" | "opening";
  ref: string;
  dateKey: DateKey;
  label: string;
  amountCents: number;
}

export interface Figure {
  cents: number;
  rows: SourceRow[];
}

export interface IncomeFigures {
  month: MonthKey;
  sales: Figure;
  costs: Figure;
  /** Costs split nine ways; together they are `costs`. */
  byCategory: Record<ExpenseCategory, Figure>;
  netIncomeCents: number;
  /** One decimal place; null when there were no sales to divide by. */
  netMarginPercent: number | null;
}

export interface StandingFigures {
  asOf: DateKey;
  cash: Figure;
  /** Bank accounts and passbooks together, each account once. */
  bank: Figure;
  ewallet: Figure;
  receivable: Figure;
  payable: Figure;
  /** Cash + Bank/Passbook + E-wallet + AR - AP. */
  positionCents: number;
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

export interface FinanceReportDocument {
  businessId: string;
  kind: FinanceReportKind;
  /** "2026-09" for the monthly pair, "2026" for the annual pair. */
  period: string;
  /** 1 on the automatic close; each approved correction adds one. */
  revision: number;
  /** Frozen with their rows, so drill-down still adds up after later edits. */
  figures: IncomeFigures | StandingFigures | Record<string, unknown>;
  /** Why this revision exists. Empty for revision 1. */
  reason: string;
  generatedAt: Date;
  generatedBy: string;
}
