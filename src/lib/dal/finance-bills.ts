import "server-only";

import { manilaDateKey } from "@/lib/booking-slots";
import {
  apStatusGroup,
  billInputProblem,
  billPayState,
  billPaymentProblem,
  daysUntilDue,
  expenseCategoryLabel,
  termsDays,
} from "@/lib/finance";
import { addDaysToKey } from "@/lib/finance-periods";
import { formatMoney } from "@/lib/format";
import { formatQuoteDay } from "@/lib/quotations";
import { tenantScope } from "./tenant";
import { assertCanPayOut, voidPayment } from "./finance-accounts";
import { bills, logFinanceEvent, moneyAccounts, payments } from "./finance";
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
    payments: billPayments
      .sort((a, b) => (a.paidOn < b.paidOn ? 1 : a.paidOn > b.paidOn ? -1 : 0))
      .map((payment) => ({
        ref: payment.ref,
        accountRef: payment.accountRef,
        accountName: accountNames.get(payment.accountRef) ?? payment.accountRef,
        direction: payment.direction,
        kind: payment.kind,
        amountCents: payment.amountCents,
        paidOn: payment.paidOn,
        billRef: payment.billRef,
        note: payment.note,
        status: payment.status,
        voidReason: payment.voidReason,
        createdBy: payment.createdBy,
      })),
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

  // A bill paid when entered is checked in full before anything is written,
  // so a refused payment never leaves an unpaid bill behind.
  if (input.paidFrom) {
    const paid = billPaymentProblem(
      { amountCents: input.amountCents, paidOn: input.paidFrom.paidOn },
      { billDate: input.billDate, outstandingCents: input.amountCents, status: "open" },
      today,
    );
    if (paid) throw new InputError(paid);
    await assertCanPayOut(input.paidFrom.accountRef, input.amountCents, input.paidFrom.paidOn);
  }

  const collection = await bills();
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
    `${doc.payee} ${formatMoney(doc.amountCents)}, ${expenseCategoryLabel(doc.category)}, dated ${formatQuoteDay(doc.billDate)}, due ${formatQuoteDay(doc.dueDate)}`,
  );

  if (input.paidFrom) {
    await recordBillPayment(
      ref,
      { accountRef: input.paidFrom.accountRef, amountCents: input.amountCents, paidOn: input.paidFrom.paidOn, note: "" },
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
  const account = await assertCanPayOut(input.accountRef, input.amountCents, input.paidOn);

  const collection = await payments();
  const paymentRef = await insertWithRef(collection, "PY-", 1001, (next) =>
    collection.insertOne({
      ref: next,
      accountRef: account.ref,
      direction: "out",
      kind: "bill",
      amountCents: input.amountCents,
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
    `${formatMoney(input.amountCents)} on ${ref} from ${account.name}, ${formatQuoteDay(input.paidOn)}`,
  );
  return paymentRef;
}

/**
 * Who, what and when can always be corrected. The amount, the date and the
 * category decide which month's costs the bill is in and how much is owed, so
 * they are fixed once anything has been paid on it; void the payment first.
 */
export async function updateBill(
  ref: string,
  changes: Pick<BillInput, "payee" | "reference" | "billDate" | "dueDate" | "amountCents" | "category" | "responsiblePerson" | "remarks">,
  actor: FinanceActor,
): Promise<void> {
  const bill = await findBill(ref);
  if (!bill) throw new InputError("That bill is no longer on record.");
  if (bill.state === "Void") throw new InputError("A void bill cannot be changed.");
  const problem = billInputProblem(changes, todayKey());
  if (problem) throw new InputError(problem);

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
        updatedAt: new Date(),
      },
    },
  );
  const parts = [
    changes.amountCents !== bill.amountCents && `amount ${formatMoney(bill.amountCents)} to ${formatMoney(changes.amountCents)}`,
    changes.billDate !== bill.billDate && `dated ${formatQuoteDay(changes.billDate)}`,
    changes.dueDate !== bill.dueDate && `due ${formatQuoteDay(changes.dueDate)}`,
    changes.category !== bill.category && `category ${expenseCategoryLabel(changes.category)}`,
  ].filter(Boolean);
  await logFinanceEvent(actor, "bill.updated", ref, parts.length ? parts.join(", ") : "Details edited");
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
      $set: { status: "void", voidReason: why, updatedAt: new Date(), ...(doc?.receiptRef ? { voidedReceiptRef: doc.receiptRef } : {}) },
      $unset: { receiptRef: "" },
    },
  );
  await logFinanceEvent(actor, "bill.voided", ref, `${bill.payee} ${formatMoney(bill.amountCents)} · ${why}`);
}

export async function voidBillPayment(paymentRef: string, reason: string, actor: FinanceActor): Promise<void> {
  await voidPayment(paymentRef, reason, actor, ["bill"]);
}
