"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/dal/businesses";
import { DuplicateError, financeActor } from "@/lib/dal/finance";
import { addAttachment } from "@/lib/dal/finance-attachments";
import { createFeeRule, updateFeeRule } from "@/lib/dal/finance-fees";
import { addIntake, discardIntake, postIntake, readIntake } from "@/lib/dal/finance-intake";
import { recordMoney, type MoneyEntryResult } from "@/lib/dal/finance-money";
import {
  createAccount,
  recordCount,
  recordTransfer,
  resolveCount,
  setAccountActive,
  updateAccount,
  voidPayment,
} from "@/lib/dal/finance-accounts";
import { createBill, recordBillPayment, updateBill, voidBill, voidBillPayment } from "@/lib/dal/finance-bills";
import { issueRevision } from "@/lib/dal/finance-close";
import { loadReport } from "@/lib/dal/finance-reports";
import { generateFinanceSummary } from "@/lib/ai/finance-summary";
import type { FinanceSummary } from "@/lib/finance-summary";
import { verifySession } from "@/lib/dal/session";
import { isMonthKey, isYearKey } from "@/lib/finance-periods";
import {
  createInvoice,
  recordCollection,
  saveFollowUp,
  updateInvoice,
  voidCollection,
  voidInvoice,
} from "@/lib/dal/finance-invoices";
import { InputError } from "@/lib/dal/refs";
import { EXPENSE_CATEGORIES, FEE_KINDS, MONEY_NATURES } from "@/lib/finance";
import type {
  AiFailure,
  ArFollowUp,
  BillInput,
  BillPaymentInput,
  CollectionInput,
  DuplicateMatch,
  ExpenseCategory,
  FeeKind,
  FeeRuleInput,
  FinanceReportKind,
  IntakePostInput,
  IntakeStatus,
  InvoiceInput,
  MoneyAccountInput,
  MoneyEntryInput,
  MoneyNature,
  PaymentFeeInput,
  TransferInput,
} from "@/types";

/** A refused save that may be a duplicate carries the matches, so the form can show them. */
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; duplicates?: DuplicateMatch[] };

function refresh() {
  revalidatePath("/finance");
  // The dashboard carries the reconciliation alert.
  revalidatePath("/dashboard");
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cents(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) ? value : Number.NaN;
}

async function guard<T>(work: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof DuplicateError) return { ok: false, error: error.message, duplicates: error.matches };
    if (error instanceof InputError) return { ok: false, error: error.message };
    throw error;
  }
}

const FEE_KEYS: FeeKind[] = FEE_KINDS.map((entry) => entry.key);

/** A fee as the browser sent it, or null for none. The amount is checked against the payment on the server. */
function readFee(raw: unknown): PaymentFeeInput | null {
  if (!raw || typeof raw !== "object") return null;
  const fee = raw as Partial<PaymentFeeInput>;
  const amount = cents(fee.cents);
  if (amount === 0) return null;
  return {
    cents: amount,
    kind: FEE_KEYS.includes(fee.kind as FeeKind) ? (fee.kind as FeeKind) : ("" as FeeKind),
    ruleRef: text(fee.ruleRef, 20) || null,
  };
}

function refs(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.slice(0, 20).map((ref) => text(ref, 20)).filter(Boolean) : [];
}

/**
 * Members enter, administrators own. Accounts and their opening balances are
 * what every Standing figure starts from, and resolving a difference decides
 * what the book says, so those are for administrators. Anyone with the module
 * can record a transfer or a count.
 */
async function adminActor() {
  const actor = await financeActor();
  if (actor.role !== "aegis_admin") {
    throw new InputError("Only an administrator can do this. Ask one to set it up.");
  }
  return actor;
}

export async function createAccountAction(raw: MoneyAccountInput): Promise<Result<{ ref: string }>> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await adminActor();
    const type = raw.type;
    const ref = await createAccount(
      {
        type,
        bankKind: type === "bank" ? (raw.bankKind === "passbook" ? "passbook" : raw.bankKind === "account" ? "account" : null) : null,
        name: text(raw.name, 80),
        institution: text(raw.institution, 80),
        accountNumber: text(raw.accountNumber, 40),
        openingBalanceCents: cents(raw.openingBalanceCents),
        openingDate: text(raw.openingDate, 10),
      },
      actor,
    );
    refresh();
    return { ok: true, ref };
  });
}

export async function updateAccountAction(
  ref: string,
  raw: { name: string; openingBalanceCents: number; openingDate: string },
  reason: string,
): Promise<Result> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await adminActor();
    await updateAccount(
      text(ref, 20),
      { name: text(raw.name, 80), openingBalanceCents: cents(raw.openingBalanceCents), openingDate: text(raw.openingDate, 10) },
      text(reason, 300),
      actor,
    );
    refresh();
    return { ok: true };
  });
}

export async function setAccountActiveAction(ref: string, active: boolean): Promise<Result> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await adminActor();
    await setAccountActive(text(ref, 20), active === true, actor);
    refresh();
    return { ok: true };
  });
}

export async function recordTransferAction(raw: TransferInput): Promise<Result<{ ref: string }>> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await financeActor();
    const ref = await recordTransfer(
      {
        fromRef: text(raw.fromRef, 20),
        toRef: text(raw.toRef, 20),
        amountCents: cents(raw.amountCents),
        fee: readFee(raw.fee),
        paidOn: text(raw.paidOn, 10),
        note: text(raw.note, 200),
      },
      actor,
    );
    refresh();
    return { ok: true, ref };
  });
}

/** Administrators only: taking back money movement changes balances already reported on. */
export async function voidPaymentAction(ref: string, reason: string): Promise<Result> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await adminActor();
    await voidPayment(text(ref, 20), text(reason, 300), actor);
    refresh();
    return { ok: true };
  });
}

export async function recordCountAction(
  accountRef: string,
  asOf: string,
  countedCents: number,
): Promise<Result<{ ref: string; differenceCents: number }>> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await financeActor();
    const result = await recordCount(text(accountRef, 20), text(asOf, 10), cents(countedCents), actor);
    refresh();
    return { ok: true, ...result };
  });
}

// ---- Bills --------------------------------------------------------------------

const CATEGORIES: ExpenseCategory[] = EXPENSE_CATEGORIES.map((entry) => entry.key);

function readBill(raw: BillInput): Omit<BillInput, "supplierRef" | "receiptRef" | "paidFrom" | "confirmedDuplicates"> {
  return {
    payee: text(raw.payee, 120),
    reference: text(raw.reference, 80),
    billDate: text(raw.billDate, 10),
    dueDate: text(raw.dueDate, 10),
    amountCents: cents(raw.amountCents),
    category: CATEGORIES.includes(raw.category) ? raw.category : ("" as ExpenseCategory),
    responsiblePerson: text(raw.responsiblePerson, 80),
    remarks: text(raw.remarks, 600),
  };
}

export async function createBillAction(raw: BillInput): Promise<Result<{ ref: string }>> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await financeActor();
    const paidFrom =
      raw.paidFrom && typeof raw.paidFrom === "object"
        ? { accountRef: text(raw.paidFrom.accountRef, 20), paidOn: text(raw.paidFrom.paidOn, 10), fee: readFee(raw.paidFrom.fee) }
        : null;
    const ref = await createBill(
      {
        ...readBill(raw),
        supplierRef: text(raw.supplierRef, 20) || null,
        receiptRef: text(raw.receiptRef, 20) || null,
        paidFrom,
        confirmedDuplicates: refs(raw.confirmedDuplicates),
      },
      actor,
    );
    refresh();
    return { ok: true, ref };
  });
}

/** A correction: the reason and every changed field go into the bill's history. */
export async function updateBillAction(ref: string, raw: BillInput, reason: string): Promise<Result> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await financeActor();
    await updateBill(text(ref, 20), readBill(raw), text(reason, 300), actor);
    refresh();
    return { ok: true };
  });
}

export async function payBillAction(ref: string, raw: BillPaymentInput): Promise<Result<{ ref: string }>> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await financeActor();
    const paymentRef = await recordBillPayment(
      text(ref, 20),
      {
        accountRef: text(raw.accountRef, 20),
        amountCents: cents(raw.amountCents),
        fee: readFee(raw.fee),
        paidOn: text(raw.paidOn, 10),
        note: text(raw.note, 200),
      },
      actor,
    );
    refresh();
    return { ok: true, ref: paymentRef };
  });
}

/** Administrators only: a void bill leaves the month's costs. */
export async function voidBillAction(ref: string, reason: string): Promise<Result> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await adminActor();
    await voidBill(text(ref, 20), text(reason, 300), actor);
    refresh();
    return { ok: true };
  });
}

export async function voidBillPaymentAction(paymentRef: string, reason: string): Promise<Result> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await adminActor();
    await voidBillPayment(text(paymentRef, 20), text(reason, 300), actor);
    refresh();
    return { ok: true };
  });
}

// ---- Invoices -----------------------------------------------------------------

function day(value: unknown): string {
  return text(value, 10);
}

export async function createInvoiceAction(raw: InvoiceInput): Promise<Result<{ ref: string }>> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await financeActor();
    const collectedInto =
      raw.collectedInto && typeof raw.collectedInto === "object"
        ? { accountRef: text(raw.collectedInto.accountRef, 20), paidOn: day(raw.collectedInto.paidOn), fee: readFee(raw.collectedInto.fee) }
        : null;
    const ref = await createInvoice(
      {
        customerName: text(raw.customerName, 120),
        customerRef: text(raw.customerRef, 20) || null,
        jobOrderRef: text(raw.jobOrderRef, 20) || null,
        number: text(raw.number, 40),
        invoiceDate: day(raw.invoiceDate),
        dueDate: day(raw.dueDate),
        amountCents: cents(raw.amountCents),
        responsiblePerson: text(raw.responsiblePerson, 80),
        remarks: text(raw.remarks, 1000),
        nextFollowUpDate: day(raw.nextFollowUpDate) || null,
        collectedInto,
        confirmedDuplicates: refs(raw.confirmedDuplicates),
      },
      actor,
    );
    refresh();
    revalidatePath("/quotations");
    return { ok: true, ref };
  });
}

/** A correction: the reason and every changed field go into the invoice's history. */
export async function updateInvoiceAction(ref: string, raw: InvoiceInput, reason: string): Promise<Result> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await financeActor();
    await updateInvoice(
      text(ref, 20),
      {
        customerName: text(raw.customerName, 120),
        number: text(raw.number, 40),
        invoiceDate: day(raw.invoiceDate),
        dueDate: day(raw.dueDate),
        amountCents: cents(raw.amountCents),
      },
      text(reason, 300),
      actor,
    );
    refresh();
    return { ok: true };
  });
}

export async function saveFollowUpAction(ref: string, raw: ArFollowUp): Promise<Result> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await financeActor();
    await saveFollowUp(
      text(ref, 20),
      {
        reasonUnpaid: text(raw.reasonUnpaid, 300),
        remarks: text(raw.remarks, 1000),
        responsiblePerson: text(raw.responsiblePerson, 80),
        lastAction: text(raw.lastAction, 300),
        nextAction: text(raw.nextAction, 300),
        nextFollowUpDate: day(raw.nextFollowUpDate) || null,
      },
      actor,
    );
    refresh();
    return { ok: true };
  });
}

export async function collectInvoiceAction(ref: string, raw: CollectionInput): Promise<Result<{ ref: string }>> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await financeActor();
    const paymentRef = await recordCollection(
      text(ref, 20),
      {
        accountRef: text(raw.accountRef, 20),
        amountCents: cents(raw.amountCents),
        fee: readFee(raw.fee),
        paidOn: day(raw.paidOn),
        note: text(raw.note, 200),
      },
      actor,
    );
    refresh();
    return { ok: true, ref: paymentRef };
  });
}

/** Administrators only: a void invoice leaves the month's sales. */
export async function voidInvoiceAction(ref: string, reason: string): Promise<Result> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await adminActor();
    await voidInvoice(text(ref, 20), text(reason, 300), actor);
    refresh();
    revalidatePath("/quotations");
    return { ok: true };
  });
}

export async function voidCollectionAction(paymentRef: string, reason: string): Promise<Result> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await adminActor();
    await voidCollection(text(paymentRef, 20), text(reason, 300), actor);
    refresh();
    return { ok: true };
  });
}

// ---- Month-end reports --------------------------------------------------------

/** An approved correction: the next revision of one report, with its reason. */
export async function issueRevisionAction(kind: string, period: string, reason: string): Promise<Result<{ revision: number }>> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await adminActor();
    const monthly = kind === "income" || kind === "standing";
    const annual = kind === "annual-income" || kind === "year-end-standing";
    if (!monthly && !annual) throw new InputError("Choose which report to revise.");
    if (monthly ? !isMonthKey(period) : !isYearKey(period)) throw new InputError("That period is not valid.");
    const { activeBusinessId } = await verifySession();
    const revision = await issueRevision(activeBusinessId, kind, period, text(reason, 600), actor);
    refresh();
    return { ok: true, revision };
  });
}

const SUMMARY_FAILURES: Record<AiFailure, string> = {
  "not-configured": "AI is not set up on this server.",
  "over-budget": "This month's AI budget is used up. The report itself is unaffected.",
  timeout: "The AI took too long to answer. Try again in a moment.",
  "rate-limited": "The AI service is busy. Try again in a moment.",
  unusable: "The AI's answer was not used: it was incomplete or contained a figure that is not in the report. Nothing was saved; you can try again.",
  error: "The AI summary could not be written. Try again in a moment.",
};

/**
 * The AI summary of one frozen revision. Administrators only, and only when
 * asked: the summary is cached per revision, so asking again is free.
 */
export async function summarizeReportAction(
  kind: string,
  period: string,
  revision: number,
): Promise<Result<{ summary: FinanceSummary; cached: boolean }>> {
  await requireModule("finance");
  return guard(async () => {
    await adminActor();
    const valid =
      Number.isInteger(revision) &&
      (((kind === "income" || kind === "standing") && isMonthKey(period)) ||
        ((kind === "annual-income" || kind === "year-end-standing") && isYearKey(period)));
    if (!valid) throw new InputError("That report is not valid.");
    const report = await loadReport(kind as FinanceReportKind, period, revision);
    if (!report) throw new InputError("That report is not on file.");
    const result = await generateFinanceSummary(report);
    if (!result.ok) throw new InputError(SUMMARY_FAILURES[result.reason]);
    return { ok: true, summary: result.data, cached: result.cached };
  });
}

// ---- Money in and out ---------------------------------------------------------

const NATURES: MoneyNature[] = MONEY_NATURES.map((entry) => entry.key);

/**
 * Money In or Money Out entered on its own. A sale becomes an invoice
 * collected the same day and an expense a bill paid the same day; the rest
 * move a balance only. Anyone with Finance can enter one, as with a transfer.
 */
export async function recordMoneyAction(raw: MoneyEntryInput): Promise<Result<MoneyEntryResult>> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await financeActor();
    const result = await recordMoney(
      {
        direction: raw.direction === "out" ? "out" : "in",
        nature: NATURES.includes(raw.nature) ? raw.nature : ("" as MoneyNature),
        accountRef: text(raw.accountRef, 20),
        amountCents: cents(raw.amountCents),
        fee: readFee(raw.fee),
        paidOn: day(raw.paidOn),
        party: text(raw.party, 120),
        reference: text(raw.reference, 80),
        description: text(raw.description, 600),
        category: CATEGORIES.includes(raw.category as ExpenseCategory) ? raw.category : null,
        confirmedDuplicates: refs(raw.confirmedDuplicates),
      },
      actor,
    );
    refresh();
    return { ok: true, ...result };
  });
}

// ---- Invoice and receipt intake ------------------------------------------------

/** One photo or PDF into the Review Queue, unread. The browser then asks for it to be read. */
export async function addIntakeAction(name: string, dataUrl: string): Promise<Result<{ ref: string; sameFileAs: string[] }>> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await financeActor();
    if (typeof dataUrl !== "string") throw new InputError("Upload a photo or a PDF.");
    const result = await addIntake({ name: text(name, 120), dataUrl }, actor);
    refresh();
    return { ok: true, ...result };
  });
}

/**
 * Reads one upload with AI, within the daily limit and the month's budget
 * share. Only fills the queue: nothing is posted until a person confirms it.
 */
export async function readIntakeAction(ref: string): Promise<Result<{ status: IntakeStatus; note: string }>> {
  const business = await requireModule("finance");
  return guard(async () => {
    const actor = await financeActor();
    const result = await readIntake(text(ref, 20), business.name, actor);
    refresh();
    return { ok: true, ...result };
  });
}

/** Confirm and post: the person's checked values become a bill or an invoice, the file its attachment. */
export async function postIntakeAction(ref: string, raw: IntakePostInput): Promise<Result<{ kind: "bill" | "invoice"; ref: string }>> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await financeActor();
    const direction = raw.direction === "in" ? "in" : "out";
    const posted = await postIntake(
      text(ref, 20),
      {
        direction,
        party: text(raw.party, 120),
        reference: text(raw.reference, 80),
        date: day(raw.date),
        dueDate: day(raw.dueDate),
        amountCents: cents(raw.amountCents),
        category: direction === "out" && CATEGORIES.includes(raw.category as ExpenseCategory) ? raw.category : null,
        paid: raw.paid === true,
        accountRef: raw.paid === true ? text(raw.accountRef, 20) || null : null,
        fee: raw.paid === true ? readFee(raw.fee) : null,
        description: text(raw.description, 400),
        confirmedDuplicates: refs(raw.confirmedDuplicates),
      },
      actor,
    );
    refresh();
    return { ok: true, ...posted };
  });
}

export async function discardIntakeAction(ref: string, reason: string): Promise<Result> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await financeActor();
    await discardIntake(text(ref, 20), text(reason, 300), actor);
    refresh();
    return { ok: true };
  });
}

// ---- Fee rules ----------------------------------------------------------------

function readFeeRule(raw: FeeRuleInput): FeeRuleInput {
  return {
    name: text(raw.name, 80),
    kind: FEE_KEYS.includes(raw.kind) ? raw.kind : ("" as FeeKind),
    percentBps: cents(raw.percentBps),
    fixedCents: cents(raw.fixedCents),
  };
}

/** Administrators only: a rule fills in the fee on every payment that uses it. */
export async function createFeeRuleAction(raw: FeeRuleInput): Promise<Result<{ ref: string }>> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await adminActor();
    const ref = await createFeeRule(readFeeRule(raw), actor);
    refresh();
    return { ok: true, ref };
  });
}

export async function updateFeeRuleAction(ref: string, raw: FeeRuleInput & { active: boolean }): Promise<Result> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await adminActor();
    await updateFeeRule(text(ref, 20), { ...readFeeRule(raw), active: raw.active === true }, actor);
    refresh();
    return { ok: true };
  });
}

// ---- Attachments --------------------------------------------------------------

/**
 * Attaches the photo or PDF a record was entered from. Anyone with Finance
 * can attach, as anyone can enter; nothing attached is ever removed.
 */
export async function attachFileAction(
  recordRef: string,
  name: string,
  dataUrl: string,
): Promise<Result<{ ref: string; alsoOn: string[] }>> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await financeActor();
    if (typeof dataUrl !== "string") throw new InputError("Attach a photo or a PDF.");
    const result = await addAttachment(text(recordRef, 20), { name: text(name, 120), dataUrl }, actor);
    refresh();
    return { ok: true, ...result };
  });
}

export async function resolveCountAction(ref: string, resolution: string, adjust: boolean): Promise<Result> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await adminActor();
    await resolveCount(text(ref, 20), text(resolution, 600), adjust === true, actor);
    refresh();
    return { ok: true };
  });
}
