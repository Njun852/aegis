import "server-only";

import { manilaDateKey } from "@/lib/booking-slots";
import {
  MIN_CORRECTION_REASON,
  apStatusGroup,
  billInputProblem,
  billPayState,
  billPaymentProblem,
  changeSummary,
  daysUntilDue,
  expenseCategoryLabel,
  feeKindLabel,
  fieldChanges,
  findDuplicates,
  termsDays,
  type DuplicateCandidate,
} from "@/lib/finance";
import { addDaysToKey } from "@/lib/finance-periods";
import { formatMoney } from "@/lib/format";
import { formatQuoteDay } from "@/lib/quotations";
import { tenantScope } from "./tenant";
import { assertCanPayOut, voidPayment } from "./finance-accounts";
import { DuplicateError, bills, logFinanceEvent, moneyAccounts, payments, recordAudit, toPaymentView, unconfirmed } from "./finance";
import { checkFee } from "./finance-fees";
import { InputError, insertWithRef, isDuplicateKey } from "./refs";
import type {
  BillDocument,
  BillInput,
  BillPaymentInput,
  BillSummary,
  DateKey,
  FinanceActor,
  PayeeOption,
  PaymentDocument,
  ReceiptDocument,
  SupplierDocument,
  UnbilledReceipt,
} from "@/types";

/**
 * Bills: what the business owes, and its costs. A bill counts as a cost in
 * the month of its date and stays in Accounts Payable until payments settle
 * it. Every outstanding bill is listed, due or not. Paid and outstanding are
 * never stored; both are worked out from the bill's recorded payments.
 */

const receipts = () => tenantScope<ReceiptDocument>("receipts");
const suppliers = () => tenantScope<SupplierDocument>("suppliers");

function todayKey(): DateKey {
  return manilaDateKey(new Date());
}

function receiptTotal(doc: Pick<ReceiptDocument, "lines">): number {
  return Math.round(doc.lines.reduce((sum, line) => sum + line.qty * line.unitCostCents, 0));
}

/** Where a bill came from, for its audit line. */
function billSource(doc: Pick<BillDocument, "receiptRef" | "voidedReceiptRef" | "opening" | "intakeRef">): string {
  if (doc.intakeRef) return `Photo or PDF ${doc.intakeRef}, read by AI and confirmed in the Review Queue`;
  const receipt = doc.receiptRef ?? doc.voidedReceiptRef;
  if (receipt) return `Supplier receipt ${receipt}`;
  return doc.opening ? "Opening balance at go-live" : "Entered in Finance";
}

/** A live bill as the duplicate check compares it. */
export function billCandidate(doc: BillDocument): DuplicateCandidate {
  return {
    ref: doc.ref,
    party: doc.payee,
    reference: doc.reference,
    dateKey: doc.billDate,
    amountCents: doc.amountCents,
    label: [doc.payee, doc.reference, formatMoney(doc.amountCents), formatQuoteDay(doc.billDate)].filter(Boolean).join(" · "),
  };
}

/** "Davao Auto Parts · DR 4471", the note a bill payment carries into the account's history. */
function paymentNote(bill: Pick<BillDocument, "payee" | "reference">, note: string): string {
  const base = bill.reference ? `${bill.payee} · ${bill.reference}` : bill.payee;
  return note.trim() ? `${base} · ${note.trim()}` : base;
}

function toSummary(
  doc: BillDocument,
  billPayments: PaymentDocument[],
  accountNames: Map<string, string>,
  today: DateKey,
): BillSummary {
  const paidCents = billPayments
    .filter((payment) => payment.status === "recorded")
    .reduce((sum, payment) => sum + payment.amountCents, 0);
  const outstandingCents = doc.status === "void" ? 0 : doc.amountCents - paidCents;
  return {
    ref: doc.ref,
    payee: doc.payee,
    supplierRef: doc.supplierRef ?? null,
    receiptRef: doc.receiptRef ?? doc.voidedReceiptRef ?? null,
    reference: doc.reference,
    billDate: doc.billDate,
    dueDate: doc.dueDate,
    amountCents: doc.amountCents,
    paidCents,
    outstandingCents,
    category: doc.category,
    state: billPayState(doc.amountCents, paidCents, doc.status),
    group: outstandingCents > 0 ? apStatusGroup(doc.dueDate, today) : null,
    daysUntilDue: daysUntilDue(doc.dueDate, today),
    responsiblePerson: doc.responsiblePerson,
    remarks: doc.remarks,
    voidReason: doc.voidReason ?? "",
    createdBy: doc.createdBy,
    audit: recordAudit(doc, billSource(doc)),
    payments: billPayments
      .sort((a, b) => (a.paidOn < b.paidOn ? 1 : a.paidOn > b.paidOn ? -1 : 0))
      .map((payment) => toPaymentView(payment, accountNames)),
  };
}

/** Every bill, newest first, each with its payments and where it stands today. */
export async function listBills(today: DateKey = todayKey()): Promise<BillSummary[]> {
  const [billCollection, paymentCollection, accountCollection] = await Promise.all([bills(), payments(), moneyAccounts()]);
  const [docs, billPayments, accounts] = await Promise.all([
    billCollection.find().sort({ billDate: -1, createdAt: -1 }).toArray(),
    paymentCollection.find({ kind: "bill" }).toArray(),
    accountCollection.find().toArray(),
  ]);
  const names = new Map(accounts.map((account) => [account.ref, account.name]));
  return docs.map((doc) =>
    toSummary(doc, billPayments.filter((payment) => payment.billRef === doc.ref), names, today),
  );
}

async function findBill(ref: string): Promise<BillSummary | null> {
  return (await listBills()).find((bill) => bill.ref === ref) ?? null;
}

/** Suppliers on record, in use, to pick as a payee. */
export async function listPayees(): Promise<PayeeOption[]> {
  const collection = await suppliers();
  const docs = await collection.find({ active: true }).sort({ name: 1 }).toArray();
  return docs.map((doc) => ({ ref: doc.ref, name: doc.name, terms: doc.terms }));
}

/**
 * Posted supplier receipts with no live bill, newest first, so goods received
 * on credit are not left out of Accounts Payable.
 */
export async function listUnbilledReceipts(): Promise<UnbilledReceipt[]> {
  const [receiptCollection, billCollection, supplierCollection] = await Promise.all([receipts(), bills(), suppliers()]);
  const [docs, billed, supplierDocs] = await Promise.all([
    receiptCollection.find({ status: "Posted" }).sort({ receivedDate: -1 }).limit(200).toArray(),
    billCollection.find({ receiptRef: { $type: "string" } }).project({ receiptRef: 1, _id: 0 }).toArray(),
    supplierCollection.find().toArray(),
  ]);
  const taken = new Set(billed.map((doc) => doc.receiptRef as string));
  const byRef = new Map(supplierDocs.map((doc) => [doc.ref, doc]));
  return docs
    .filter((doc) => !taken.has(doc.ref))
    .map((doc) => {
      const supplier = byRef.get(doc.supplierRef);
      const terms = supplier?.terms ?? "";
      const days = termsDays(terms);
      return {
        ref: doc.ref,
        supplierRef: doc.supplierRef,
        supplierName: supplier?.name ?? doc.supplierRef,
        terms,
        receiptNo: doc.receiptNo,
        receivedDate: doc.receivedDate,
        totalCents: receiptTotal(doc),
        suggestedDueDate: days === null ? null : addDaysToKey(doc.receivedDate, days),
      };
    })
    .filter((receipt) => receipt.totalCents > 0);
}

export async function createBill(input: BillInput, actor: FinanceActor): Promise<string> {
  const today = todayKey();
  const problem = billInputProblem(input, today);
  if (problem) throw new InputError(problem);

  let supplierRef = input.supplierRef;
  if (input.receiptRef) {
    const receiptCollection = await receipts();
    const receipt = await receiptCollection.findOne({ ref: input.receiptRef });
    if (!receipt || receipt.status !== "Posted") throw new InputError("That supplier receipt is not posted, or no longer on record.");
    supplierRef = receipt.supplierRef;
  }
  if (supplierRef) {
    const supplierCollection = await suppliers();
    if (!(await supplierCollection.findOne({ ref: supplierRef }))) throw new InputError("That supplier is no longer on record.");
  }

  // The same supplier invoice entered twice would be counted as a cost twice.
  const collection = await bills();
  const matches = findDuplicates(
    { party: input.payee, reference: input.reference, dateKey: input.billDate, amountCents: input.amountCents },
    (await collection.find({ status: "open" }).toArray()).map(billCandidate),
  );
  if (unconfirmed(matches, input.confirmedDuplicates).length > 0) throw new DuplicateError(matches, "bill");

  // A bill paid when entered is checked in full before anything is written,
  // so a refused payment never leaves an unpaid bill behind.
  if (input.paidFrom) {
    const paid = billPaymentProblem(
      { amountCents: input.amountCents, paidOn: input.paidFrom.paidOn },
      { billDate: input.billDate, outstandingCents: input.amountCents, status: "open" },
      today,
    );
    if (paid) throw new InputError(paid);
    const fee = await checkFee(input.paidFrom.fee, input.amountCents, "out");
    await assertCanPayOut(input.paidFrom.accountRef, input.amountCents + (fee?.cents ?? 0), input.paidFrom.paidOn);
  }

  const now = new Date();
  const doc = {
    payee: input.payee.trim(),
    ...(supplierRef ? { supplierRef } : {}),
    ...(input.receiptRef ? { receiptRef: input.receiptRef } : {}),
    reference: input.reference.trim(),
    billDate: input.billDate,
    dueDate: input.dueDate,
    amountCents: input.amountCents,
    category: input.category,
    status: "open" as const,
    opening: false,
    responsiblePerson: input.responsiblePerson.trim() || actor.name,
    remarks: input.remarks.trim(),
    createdBy: actor.name,
    createdAt: now,
    updatedAt: now,
  };

  let ref: string;
  try {
    ref = await insertWithRef(collection, "BL-", 1001, (next) => collection.insertOne({ ...doc, ref: next }));
  } catch (error) {
    if (isDuplicateKey(error, "receiptRef")) throw new InputError("A bill has already been made from that receipt.");
    throw error;
  }
  await logFinanceEvent(
    actor,
    "bill.created",
    ref,
    `${doc.payee} ${formatMoney(doc.amountCents)}, ${expenseCategoryLabel(doc.category)}, dated ${formatQuoteDay(doc.billDate)}, due ${formatQuoteDay(doc.dueDate)}${
      matches.length ? `. Saved past the duplicate warning for ${matches.map((match) => match.ref).join(", ")}` : ""
    }`,
  );

  if (input.paidFrom) {
    await recordBillPayment(
      ref,
      { accountRef: input.paidFrom.accountRef, amountCents: input.amountCents, fee: input.paidFrom.fee, paidOn: input.paidFrom.paidOn, note: "" },
      actor,
    );
  }
  return ref;
}

export async function recordBillPayment(ref: string, input: BillPaymentInput, actor: FinanceActor): Promise<string> {
  const bill = await findBill(ref);
  if (!bill) throw new InputError("That bill is no longer on record.");
  const problem = billPaymentProblem(
    input,
    { billDate: bill.billDate, outstandingCents: bill.outstandingCents, status: bill.state === "Void" ? "void" : "open" },
    todayKey(),
  );
  if (problem) throw new InputError(problem);
  const fee = await checkFee(input.fee, input.amountCents, "out");
  const account = await assertCanPayOut(input.accountRef, input.amountCents + (fee?.cents ?? 0), input.paidOn);

  const collection = await payments();
  const paymentRef = await insertWithRef(collection, "PY-", 1001, (next) =>
    collection.insertOne({
      ref: next,
      accountRef: account.ref,
      direction: "out",
      kind: "bill",
      amountCents: input.amountCents,
      ...(fee ? { fee } : {}),
      paidOn: input.paidOn,
      billRef: ref,
      note: paymentNote(bill, input.note),
      status: "recorded",
      createdBy: actor.name,
      createdAt: new Date(),
    }),
  );
  await logFinanceEvent(
    actor,
    "bill.paid",
    paymentRef,
    `${formatMoney(input.amountCents)} on ${ref} from ${account.name}, ${formatQuoteDay(input.paidOn)}${
      fee ? `, plus ${feeKindLabel(fee.kind).toLowerCase()} ${formatMoney(fee.cents)}` : ""
    }`,
  );
  return paymentRef;
}

/**
 * Who, what and when can always be corrected. The amount, the date and the
 * category decide which month's costs the bill is in and how much is owed, so
 * they are fixed once anything has been paid on it; void the payment first.
 * A correction says why, and its history keeps every changed field, old and
 * new, so the bill as first entered can always be read back.
 */
export async function updateBill(
  ref: string,
  changes: Pick<BillInput, "payee" | "reference" | "billDate" | "dueDate" | "amountCents" | "category" | "responsiblePerson" | "remarks">,
  reason: string,
  actor: FinanceActor,
): Promise<void> {
  const bill = await findBill(ref);
  if (!bill) throw new InputError("That bill is no longer on record.");
  if (bill.state === "Void") throw new InputError("A void bill cannot be changed.");
  const problem = billInputProblem(changes, todayKey());
  if (problem) throw new InputError(problem);
  const why = reason.trim();
  if (why.length < MIN_CORRECTION_REASON) throw new InputError("Say why this bill is being corrected.");

  const changed = fieldChanges([
    { field: "Supplier / payee", from: bill.payee, to: changes.payee.trim() },
    { field: "Invoice / reference", from: bill.reference, to: changes.reference.trim() },
    { field: "Invoice date", from: formatQuoteDay(bill.billDate), to: formatQuoteDay(changes.billDate) },
    { field: "Due date", from: formatQuoteDay(bill.dueDate), to: formatQuoteDay(changes.dueDate) },
    { field: "Amount", from: formatMoney(bill.amountCents), to: formatMoney(changes.amountCents) },
    { field: "Category", from: expenseCategoryLabel(bill.category), to: expenseCategoryLabel(changes.category) },
    { field: "Responsible", from: bill.responsiblePerson, to: changes.responsiblePerson.trim() },
    { field: "Remarks", from: bill.remarks, to: changes.remarks.trim() },
  ]);
  if (changed.length === 0) throw new InputError("Nothing was changed, so nothing was saved.");

  const moneyChanged =
    changes.amountCents !== bill.amountCents || changes.billDate !== bill.billDate || changes.category !== bill.category;
  if (moneyChanged && bill.paidCents > 0) {
    throw new InputError("The amount, date and category are fixed once something has been paid on this bill. Void the payment first.");
  }

  const collection = await bills();
  await collection.updateOne(
    { ref, status: "open" },
    {
      $set: {
        payee: changes.payee.trim(),
        reference: changes.reference.trim(),
        billDate: changes.billDate,
        dueDate: changes.dueDate,
        amountCents: changes.amountCents,
        category: changes.category,
        responsiblePerson: changes.responsiblePerson.trim(),
        remarks: changes.remarks.trim(),
        updatedBy: actor.name,
        updatedAt: new Date(),
      },
    },
  );
  await logFinanceEvent(actor, "bill.corrected", ref, changeSummary(changed), { changes: changed, reason: why });
}

/**
 * A bill entered by mistake is voided, never deleted, and only once nothing
 * is paid on it. It gives up its receipt, so the receipt can be billed again.
 */
export async function voidBill(ref: string, reason: string, actor: FinanceActor): Promise<void> {
  const why = reason.trim();
  if (why.length < 5) throw new InputError("Say why this bill is being voided.");
  const bill = await findBill(ref);
  if (!bill) throw new InputError("That bill is no longer on record.");
  if (bill.state === "Void") throw new InputError("This bill is already void.");
  if (bill.paidCents > 0) throw new InputError("Void the payments on this bill first.");

  const collection = await bills();
  const doc = await collection.findOne({ ref });
  await collection.updateOne(
    { ref, status: "open" },
    {
      $set: {
        status: "void",
        voidReason: why,
        updatedBy: actor.name,
        updatedAt: new Date(),
        ...(doc?.receiptRef ? { voidedReceiptRef: doc.receiptRef } : {}),
      },
      $unset: { receiptRef: "" },
    },
  );
  await logFinanceEvent(actor, "bill.voided", ref, `${bill.payee} ${formatMoney(bill.amountCents)} · ${why}`);
}

export async function voidBillPayment(paymentRef: string, reason: string, actor: FinanceActor): Promise<void> {
  await voidPayment(paymentRef, reason, actor, ["bill"]);
}
