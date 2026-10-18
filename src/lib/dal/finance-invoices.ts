import "server-only";

import { manilaDateKey } from "@/lib/booking-slots";
import {
  arAgingBucket,
  billPayState,
  collectionProblem,
  daysOutstanding,
  daysUntilDue,
  followUpProblems,
  invoiceInputProblem,
  isOver90,
  ar90Problems,
} from "@/lib/finance";
import { formatMoney } from "@/lib/format";
import { formatQuoteDay } from "@/lib/quotations";
import { tenantScope } from "./tenant";
import { assertCanPayIn, voidPayment } from "./finance-accounts";
import { invoices, logFinanceEvent, moneyAccounts, payments } from "./finance";
import { InputError, insertWithRef, isDuplicateKey } from "./refs";
import type {
  ArFollowUp,
  CollectionInput,
  CustomerDocument,
  CustomerOption,
  DateKey,
  FinanceActor,
  InvoiceDocument,
  InvoiceInput,
  InvoiceSummary,
  JobOrderDocument,
  PaymentDocument,
  UninvoicedJob,
} from "@/types";

/**
 * Invoices: what customers owe, and the business's sales. An invoice is a
 * sale in the month of its date and stays in Accounts Receivable until
 * collections settle it. Collected, outstanding and age are never stored;
 * all three are worked out from the invoice's recorded collections.
 */

const jobOrders = () => tenantScope<JobOrderDocument>("jobOrders");
const customers = () => tenantScope<CustomerDocument>("customers");

function todayKey(): DateKey {
  return manilaDateKey(new Date());
}

/** Who a job order bills: the company when there is one, as on the printed form. */
function billedName(job: Pick<JobOrderDocument, "billTo">): string {
  return job.billTo.company.trim() || job.billTo.name.trim() || "Walk-in customer";
}

function toSummary(
  doc: InvoiceDocument,
  collections: PaymentDocument[],
  accountNames: Map<string, string>,
  today: DateKey,
): InvoiceSummary {
  const collectedCents = collections
    .filter((payment) => payment.status === "recorded")
    .reduce((sum, payment) => sum + payment.amountCents, 0);
  const outstandingCents = doc.status === "void" ? 0 : doc.amountCents - collectedCents;
  const age = daysOutstanding(doc.invoiceDate, today);
  return {
    ref: doc.ref,
    number: doc.number,
    customerName: doc.customerName,
    customerRef: doc.customerRef ?? null,
    jobOrderRef: doc.jobOrderRef ?? doc.voidedJobOrderRef ?? null,
    invoiceDate: doc.invoiceDate,
    dueDate: doc.dueDate,
    amountCents: doc.amountCents,
    collectedCents,
    outstandingCents,
    state: billPayState(doc.amountCents, collectedCents, doc.status),
    daysOutstanding: age,
    bucket: outstandingCents > 0 ? arAgingBucket(age) : null,
    daysUntilDue: daysUntilDue(doc.dueDate, today),
    followUp: doc.followUp,
    problems: outstandingCents > 0 && isOver90(doc.invoiceDate, today) ? ar90Problems(doc.followUp, today) : [],
    voidReason: doc.voidReason ?? "",
    createdBy: doc.createdBy,
    payments: collections
      .sort((a, b) => (a.paidOn < b.paidOn ? 1 : a.paidOn > b.paidOn ? -1 : 0))
      .map((payment) => ({
        ref: payment.ref,
        accountRef: payment.accountRef,
        accountName: accountNames.get(payment.accountRef) ?? payment.accountRef,
        direction: payment.direction,
        kind: payment.kind,
        amountCents: payment.amountCents,
        paidOn: payment.paidOn,
        invoiceRef: payment.invoiceRef,
        note: payment.note,
        status: payment.status,
        voidReason: payment.voidReason,
        createdBy: payment.createdBy,
      })),
  };
}

/** Every invoice, newest first, each with its collections and where it stands today. */
export async function listInvoices(today: DateKey = todayKey()): Promise<InvoiceSummary[]> {
  const [invoiceCollection, paymentCollection, accountCollection] = await Promise.all([invoices(), payments(), moneyAccounts()]);
  const [docs, collections, accounts] = await Promise.all([
    invoiceCollection.find().sort({ invoiceDate: -1, createdAt: -1 }).toArray(),
    paymentCollection.find({ kind: "collection" }).toArray(),
    accountCollection.find().toArray(),
  ]);
  const names = new Map(accounts.map((account) => [account.ref, account.name]));
  return docs.map((doc) =>
    toSummary(doc, collections.filter((payment) => payment.invoiceRef === doc.ref), names, today),
  );
}

async function findInvoice(ref: string): Promise<InvoiceSummary | null> {
  return (await listInvoices()).find((invoice) => invoice.ref === ref) ?? null;
}

/** Every invoice number issued, void ones included, so a number is never reused. */
export async function listInvoiceNumbers(): Promise<string[]> {
  const collection = await invoices();
  const docs = await collection.find().project({ number: 1, _id: 0 }).toArray();
  return docs.map((doc) => String(doc.number));
}

/** Completed job orders with no live invoice, newest first, so finished work is not left unbilled. */
export async function listUninvoicedJobs(): Promise<UninvoicedJob[]> {
  const [jobCollection, invoiceCollection] = await Promise.all([jobOrders(), invoices()]);
  const [jobs, invoiced] = await Promise.all([
    jobCollection.find({ status: "Completed" }).sort({ updatedAt: -1 }).limit(200).toArray(),
    invoiceCollection.find({ jobOrderRef: { $type: "string" } }).project({ jobOrderRef: 1, _id: 0 }).toArray(),
  ]);
  const taken = new Set(invoiced.map((doc) => doc.jobOrderRef as string));
  return jobs
    .filter((job) => !taken.has(job.ref) && job.approvedTotalCents > 0)
    .map((job) => ({
      ref: job.ref,
      customerName: billedName(job),
      customerRef: job.billTo.customerRef,
      vehicle: [job.vehicle.plate, job.vehicle.makeModel].filter(Boolean).join(" · "),
      approvedTotalCents: job.approvedTotalCents,
      approvedDate: manilaDateKey(job.approvedAt),
    }));
}

/** CRM customers, to link an invoice to. */
export async function listCustomerOptions(): Promise<CustomerOption[]> {
  const collection = await customers();
  const docs = await collection.find().sort({ name: 1 }).limit(2000).toArray();
  return docs.map((doc) => ({ ref: doc.ref, name: doc.company?.trim() ? `${doc.name} (${doc.company.trim()})` : doc.name }));
}

export async function createInvoice(input: InvoiceInput, actor: FinanceActor): Promise<string> {
  const today = todayKey();
  const problem = invoiceInputProblem(input, today);
  if (problem) throw new InputError(problem);

  let customerRef = input.customerRef;
  if (input.jobOrderRef) {
    const jobCollection = await jobOrders();
    const job = await jobCollection.findOne({ ref: input.jobOrderRef });
    if (!job) throw new InputError("That job order is no longer on record.");
    if (job.status !== "Completed") throw new InputError("Only a completed job order can be invoiced.");
    customerRef = job.billTo.customerRef;
  }
  if (customerRef) {
    const customerCollection = await customers();
    if (!(await customerCollection.findOne({ ref: customerRef }))) customerRef = null;
  }

  if (input.collectedInto) {
    const paid = collectionProblem(
      { amountCents: input.amountCents, paidOn: input.collectedInto.paidOn },
      { invoiceDate: input.invoiceDate, outstandingCents: input.amountCents, status: "open" },
      today,
    );
    if (paid) throw new InputError(paid);
    await assertCanPayIn(input.collectedInto.accountRef, input.collectedInto.paidOn);
  }

  const followUp: ArFollowUp = {
    reasonUnpaid: "",
    remarks: input.remarks.trim(),
    responsiblePerson: input.responsiblePerson.trim() || actor.name,
    lastAction: "",
    nextAction: "",
    nextFollowUpDate: input.nextFollowUpDate || null,
  };
  const number = input.number.trim();
  const collection = await invoices();
  const now = new Date();

  let ref: string;
  try {
    ref = await insertWithRef(collection, "INV-", 1001, (next) =>
      collection.insertOne({
        ref: next,
        number,
        customerName: input.customerName.trim(),
        ...(customerRef ? { customerRef } : {}),
        ...(input.jobOrderRef ? { jobOrderRef: input.jobOrderRef } : {}),
        invoiceDate: input.invoiceDate,
        dueDate: input.dueDate,
        amountCents: input.amountCents,
        status: "open",
        opening: false,
        followUp,
        createdBy: actor.name,
        createdAt: now,
        updatedAt: now,
      }),
    );
  } catch (error) {
    if (isDuplicateKey(error, "number")) {
      const existing = await collection.findOne({ number });
      throw new InputError(`Invoice number ${number} is already used${existing ? ` by ${existing.ref}` : ""}.`);
    }
    if (isDuplicateKey(error, "jobOrderRef")) throw new InputError("That job order has already been invoiced.");
    throw error;
  }

  if (input.jobOrderRef) {
    const jobCollection = await jobOrders();
    await jobCollection.updateOne({ ref: input.jobOrderRef }, { $set: { invoiceRef: ref, updatedAt: now } });
  }
  await logFinanceEvent(
    actor,
    "invoice.created",
    ref,
    `No. ${number}, ${input.customerName.trim()} ${formatMoney(input.amountCents)}, dated ${formatQuoteDay(input.invoiceDate)}, due ${formatQuoteDay(input.dueDate)}${input.jobOrderRef ? `, for ${input.jobOrderRef}` : ""}`,
  );

  if (input.collectedInto) {
    await recordCollection(
      ref,
      { accountRef: input.collectedInto.accountRef, amountCents: input.amountCents, paidOn: input.collectedInto.paidOn, note: "" },
      actor,
    );
  }
  return ref;
}

export async function recordCollection(ref: string, input: CollectionInput, actor: FinanceActor): Promise<string> {
  const invoice = await findInvoice(ref);
  if (!invoice) throw new InputError("That invoice is no longer on record.");
  const problem = collectionProblem(
    input,
    { invoiceDate: invoice.invoiceDate, outstandingCents: invoice.outstandingCents, status: invoice.state === "Void" ? "void" : "open" },
    todayKey(),
  );
  if (problem) throw new InputError(problem);
  const account = await assertCanPayIn(input.accountRef, input.paidOn);

  const base = `Invoice ${invoice.number} · ${invoice.customerName}`;
  const collection = await payments();
  const paymentRef = await insertWithRef(collection, "PY-", 1001, (next) =>
    collection.insertOne({
      ref: next,
      accountRef: account.ref,
      direction: "in",
      kind: "collection",
      amountCents: input.amountCents,
      paidOn: input.paidOn,
      invoiceRef: ref,
      note: input.note.trim() ? `${base} · ${input.note.trim()}` : base,
      status: "recorded",
      createdBy: actor.name,
      createdAt: new Date(),
    }),
  );
  // Logged against the invoice, so its history shows every collection.
  await logFinanceEvent(
    actor,
    "invoice.collected",
    ref,
    `${formatMoney(input.amountCents)} collected into ${account.name}, ${formatQuoteDay(input.paidOn)} (${paymentRef})`,
  );
  return paymentRef;
}

/**
 * The customer, number and dates can be corrected; the amount and the invoice
 * date decide which month's sales it is in and how much is owed, so they are
 * fixed once anything has been collected.
 */
export async function updateInvoice(
  ref: string,
  changes: Pick<InvoiceInput, "customerName" | "number" | "invoiceDate" | "dueDate" | "amountCents">,
  actor: FinanceActor,
): Promise<void> {
  const invoice = await findInvoice(ref);
  if (!invoice) throw new InputError("That invoice is no longer on record.");
  if (invoice.state === "Void") throw new InputError("A void invoice cannot be changed.");
  const problem = invoiceInputProblem({ ...changes, nextFollowUpDate: null }, todayKey());
  if (problem) throw new InputError(problem);
  const moneyChanged = changes.amountCents !== invoice.amountCents || changes.invoiceDate !== invoice.invoiceDate;
  if (moneyChanged && invoice.collectedCents > 0) {
    throw new InputError("The amount and invoice date are fixed once something has been collected. Void the collection first.");
  }

  const collection = await invoices();
  try {
    await collection.updateOne(
      { ref, status: "open" },
      {
        $set: {
          customerName: changes.customerName.trim(),
          number: changes.number.trim(),
          invoiceDate: changes.invoiceDate,
          dueDate: changes.dueDate,
          amountCents: changes.amountCents,
          updatedAt: new Date(),
        },
      },
    );
  } catch (error) {
    if (isDuplicateKey(error, "number")) throw new InputError(`Invoice number ${changes.number.trim()} is already used.`);
    throw error;
  }
  const parts = [
    changes.number.trim() !== invoice.number && `number ${invoice.number} to ${changes.number.trim()}`,
    changes.amountCents !== invoice.amountCents && `amount ${formatMoney(invoice.amountCents)} to ${formatMoney(changes.amountCents)}`,
    changes.invoiceDate !== invoice.invoiceDate && `dated ${formatQuoteDay(changes.invoiceDate)}`,
    changes.dueDate !== invoice.dueDate && `due ${formatQuoteDay(changes.dueDate)}`,
  ].filter(Boolean);
  await logFinanceEvent(actor, "invoice.updated", ref, parts.length ? parts.join(", ") : "Details edited");
}

/**
 * Records what is being done to collect. Over 90 days, all six fields of the
 * 90+ day control must be filled properly or nothing is saved; each save is a
 * line in the invoice's history, so the trail of actions stays visible.
 */
export async function saveFollowUp(ref: string, followUp: ArFollowUp, actor: FinanceActor): Promise<void> {
  const invoice = await findInvoice(ref);
  if (!invoice) throw new InputError("That invoice is no longer on record.");
  if (invoice.state === "Void") throw new InputError("A void invoice needs no follow-up.");
  const today = todayKey();
  const problems = followUpProblems(followUp, invoice.invoiceDate, today);
  if (problems.length > 0) throw new InputError(problems.map((problem) => problem.message).join(" "));

  const clean: ArFollowUp = {
    reasonUnpaid: followUp.reasonUnpaid.trim(),
    remarks: followUp.remarks.trim(),
    responsiblePerson: followUp.responsiblePerson.trim(),
    lastAction: followUp.lastAction.trim(),
    nextAction: followUp.nextAction.trim(),
    nextFollowUpDate: followUp.nextFollowUpDate || null,
  };
  const collection = await invoices();
  await collection.updateOne({ ref, status: "open" }, { $set: { followUp: clean, updatedAt: new Date() } });
  const detail = [
    clean.lastAction && `Last: ${clean.lastAction}`,
    clean.nextAction && `Next: ${clean.nextAction}`,
    clean.nextFollowUpDate && `follow up ${formatQuoteDay(clean.nextFollowUpDate)}`,
    clean.responsiblePerson && `(${clean.responsiblePerson})`,
  ]
    .filter(Boolean)
    .join(" · ");
  await logFinanceEvent(actor, "invoice.followup", ref, detail || "Remarks updated");
}

/**
 * An invoice issued by mistake is voided, never deleted, and only once nothing
 * has been collected on it. It gives up its job order, which can then be
 * invoiced again.
 */
export async function voidInvoice(ref: string, reason: string, actor: FinanceActor): Promise<void> {
  const why = reason.trim();
  if (why.length < 5) throw new InputError("Say why this invoice is being voided.");
  const invoice = await findInvoice(ref);
  if (!invoice) throw new InputError("That invoice is no longer on record.");
  if (invoice.state === "Void") throw new InputError("This invoice is already void.");
  if (invoice.collectedCents > 0) throw new InputError("Void the collections on this invoice first.");

  const collection = await invoices();
  const doc = await collection.findOne({ ref });
  const now = new Date();
  await collection.updateOne(
    { ref, status: "open" },
    {
      $set: { status: "void", voidReason: why, updatedAt: now, ...(doc?.jobOrderRef ? { voidedJobOrderRef: doc.jobOrderRef } : {}) },
      $unset: { jobOrderRef: "" },
    },
  );
  if (doc?.jobOrderRef) {
    const jobCollection = await jobOrders();
    await jobCollection.updateOne({ ref: doc.jobOrderRef, invoiceRef: ref }, { $set: { invoiceRef: null, updatedAt: now } });
  }
  await logFinanceEvent(actor, "invoice.voided", ref, `No. ${invoice.number} ${formatMoney(invoice.amountCents)} · ${why}`);
}

export async function voidCollection(paymentRef: string, reason: string, actor: FinanceActor): Promise<void> {
  const payment = await voidPayment(paymentRef, reason, actor, ["collection"]);
  if (payment.invoiceRef) {
    await logFinanceEvent(actor, "invoice.collection-voided", payment.invoiceRef, `${paymentRef} ${formatMoney(payment.amountCents)} · ${reason.trim()}`);
  }
}
