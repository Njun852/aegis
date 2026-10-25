import "server-only";

import { manilaDateKey } from "@/lib/booking-slots";
import { AI_MONTHLY_TOKEN_BUDGET, isAiConfigured } from "@/lib/ai/client";
import { explainFailure } from "@/lib/ai/failures";
import { INTAKE_BUDGET_SHARE, INTAKE_PER_DAY, firstPages, isIntakeReadCached, readIntakeDocument } from "@/lib/ai/finance-intake";
import { expenseCategoryLabel, fieldChanges, findDuplicates } from "@/lib/finance";
import { INTAKE_DOC_TYPES, intakePostProblem, intakeReviewReasons } from "@/lib/finance-intake";
import { formatMoney } from "@/lib/format";
import { formatQuoteDay } from "@/lib/quotations";
import { tokensUsedThisMonth } from "./ai";
import { bills, financeIntake, invoices, logFinanceEvent } from "./finance";
import { checkUpload, recordsWithFile, storeAttachment } from "./finance-attachments";
import { billCandidate, createBill } from "./finance-bills";
import { createInvoice, invoiceCandidate } from "./finance-invoices";
import { InputError, insertWithRef } from "./refs";
import type {
  FieldChange,
  FinanceActor,
  FinanceIntakeDocument,
  IntakeAllowance,
  IntakeExtraction,
  IntakeItem,
  IntakePostInput,
} from "@/types";

/**
 * The Review Queue: photos and PDFs of invoices and receipts, read by AI into
 * proposed fields, checked by a person, and only then posted as a bill or an
 * invoice. The AI never posts. A posted document's file moves to the record
 * it became, so the original stays attached to the financial record.
 */

function todayKey(): string {
  return manilaDateKey(new Date());
}

function midnight(now = new Date()): Date {
  return new Date(`${manilaDateKey(now)}T00:00:00+08:00`);
}

const IN_QUEUE: FinanceIntakeDocument["status"][] = ["unread", "review"];

/** Stores one upload, unread. Reading is a separate step so a batch fills the queue one by one. */
export async function addIntake(upload: { name: string; dataUrl: string }, actor: FinanceActor): Promise<{ ref: string; sameFileAs: string[] }> {
  const file = checkUpload(upload);
  const collection = await financeIntake();
  const earlier = await collection
    .find({ sha256: file.sha256, status: { $ne: "discarded" } })
    .project<{ ref: string; posted?: FinanceIntakeDocument["posted"] }>({ ref: 1, posted: 1, _id: 0 })
    .toArray();
  const sameFileAs = [...new Set([...earlier.map((doc) => doc.posted?.ref ?? doc.ref), ...(await recordsWithFile(file.sha256, ""))])];

  const ref = await insertWithRef(collection, "IN-", 1001, (next) =>
    collection.insertOne({
      ref: next,
      name: file.name,
      contentType: file.contentType,
      dataUrl: file.dataUrl,
      bytes: file.bytes,
      sha256: file.sha256,
      status: "unread",
      extraction: null,
      billed: false,
      sameFileAs,
      uploadedBy: actor.name,
      uploadedAt: new Date(),
    }),
  );
  await logFinanceEvent(
    actor,
    "intake.uploaded",
    ref,
    `${file.name} uploaded${sameFileAs.length ? `. The same file is already on ${sameFileAs.join(", ")}` : ""}`,
  );
  return { ref, sameFileAs };
}

/** Uploads waiting for a person, for the tab's badge. */
export async function countIntakeWaiting(): Promise<number> {
  const collection = await financeIntake();
  return collection.countDocuments({ status: { $in: IN_QUEUE } });
}

async function readToday(): Promise<number> {
  const collection = await financeIntake();
  return collection.countDocuments({ billed: true, readAt: { $gte: midnight() } });
}

/** Today's reads against the limit, and whether reading is open at all. */
export async function intakeAllowance(): Promise<IntakeAllowance> {
  const [count, used] = await Promise.all([readToday(), tokensUsedThisMonth()]);
  if (!isAiConfigured()) return { readToday: count, perDay: INTAKE_PER_DAY, available: false, note: "AI is not switched on, so uploads wait unread; type their details in." };
  if (used >= AI_MONTHLY_TOKEN_BUDGET * INTAKE_BUDGET_SHARE) {
    return { readToday: count, perDay: INTAKE_PER_DAY, available: false, note: "Most of this month's AI allowance is used, and the rest is kept for mail. Uploads wait unread; type them in." };
  }
  if (count >= INTAKE_PER_DAY) return { readToday: count, perDay: INTAKE_PER_DAY, available: false, note: `Today's ${INTAKE_PER_DAY} reads are used. Uploads wait unread until tomorrow, or type them in.` };
  return { readToday: count, perDay: INTAKE_PER_DAY, available: true, note: "" };
}

/**
 * Reads one unread or reviewed upload. A document read before (the same file)
 * comes from the cache and costs nothing, so it passes the limits. A refusal
 * or failure leaves it unread with the reason, for a person to retry or type.
 */
export async function readIntake(ref: string, businessName: string, actor: FinanceActor): Promise<{ status: FinanceIntakeDocument["status"]; note: string }> {
  const collection = await financeIntake();
  const doc = await collection.findOne({ ref });
  if (!doc || !doc.dataUrl) throw new InputError("That upload is no longer in the queue.");
  if (!IN_QUEUE.includes(doc.status)) throw new InputError("That upload has already been posted or discarded.");

  const unread = async (note: string, billed = doc.billed) => {
    await collection.updateOne({ ref }, { $set: { status: "unread", readError: note, billed, readAt: new Date() } });
    return { status: "unread" as const, note };
  };

  const cached = await isIntakeReadCached(doc.sha256, businessName);
  if (!cached) {
    const allowance = await intakeAllowance();
    if (!allowance.available) return unread(allowance.note);
  }

  let dataUrl = doc.dataUrl;
  if (doc.contentType === "application/pdf") {
    const trimmed = await firstPages(doc.dataUrl);
    if (!trimmed) return unread("This PDF could not be opened (it may be damaged or password-protected). Type its details in.");
    dataUrl = trimmed.dataUrl;
  }

  const result = await readIntakeDocument({ name: doc.name, contentType: doc.contentType, dataUrl, sha256: doc.sha256 }, businessName);
  if (!result.ok) {
    // A failed call may still have been billed; it counts towards the limit.
    return unread(`Not read: ${explainFailure(result.reason)} Read it again, or type the details in.`, true);
  }
  await collection.updateOne(
    { ref, status: { $in: IN_QUEUE } },
    { $set: { status: "review", extraction: result.data, billed: doc.billed || !result.cached, readAt: new Date() }, $unset: { readError: "" } },
  );
  const type = INTAKE_DOC_TYPES.find((entry) => entry.key === result.data.docType)?.label ?? result.data.docType;
  await logFinanceEvent(
    actor,
    "intake.read",
    ref,
    `Read by AI${result.cached ? " (from the cache, no charge)" : ""}: ${type}, ${result.data.party || "no name"}, ${
      result.data.amountCents !== null ? formatMoney(result.data.amountCents) : "no amount"
    }`,
  );
  return { status: "review", note: result.data.summary };
}

function toItem(doc: Omit<FinanceIntakeDocument, "dataUrl">, reasons: string[], duplicates: IntakeItem["possibleDuplicates"]): IntakeItem {
  return {
    ref: doc.ref,
    name: doc.name,
    contentType: doc.contentType,
    bytes: doc.bytes,
    status: doc.status,
    extraction: doc.extraction,
    readError: doc.readError ?? "",
    reviewReasons: reasons,
    sameFileAs: doc.sameFileAs,
    possibleDuplicates: duplicates,
    uploadedBy: doc.uploadedBy,
    uploadedAt: doc.uploadedAt.toISOString(),
    posted: doc.posted ?? null,
    postedBy: doc.postedBy ?? "",
    postedAt: doc.postedAt?.toISOString() ?? null,
    discardedBy: doc.discardedBy ?? "",
    discardedAt: doc.discardedAt?.toISOString() ?? null,
    discardReason: doc.discardReason ?? "",
  };
}

/**
 * The queue, newest first, without file bytes. Items waiting for review are
 * checked against the bills and invoices on file, so a document entered
 * before by hand is flagged before anyone posts it again.
 */
export async function listIntake(businessName: string): Promise<IntakeItem[]> {
  const [collection, billCollection, invoiceCollection] = await Promise.all([financeIntake(), bills(), invoices()]);
  const [docs, liveBills, liveInvoices] = await Promise.all([
    collection.find().project<Omit<FinanceIntakeDocument, "dataUrl">>({ dataUrl: 0 }).sort({ uploadedAt: -1 }).limit(300).toArray(),
    billCollection.find({ status: "open" }).toArray(),
    invoiceCollection.find({ status: "open" }).toArray(),
  ]);
  const billCandidates = liveBills.map(billCandidate);
  const invoiceCandidates = liveInvoices.map(invoiceCandidate);
  const today = todayKey();
  return docs.map((doc) => {
    if (!IN_QUEUE.includes(doc.status)) return toItem(doc, [], []);
    const read = doc.extraction;
    const duplicates =
      read && read.amountCents !== null
        ? findDuplicates(
            { party: read.party, reference: read.reference, dateKey: read.date ?? "", amountCents: read.amountCents },
            read.direction === "out" ? billCandidates : invoiceCandidates,
          )
        : [];
    const reasons = [
      // An upload that could not be read says why, instead of "not read yet".
      ...(doc.readError && !read ? [doc.readError] : intakeReviewReasons(read, businessName, today)),
      ...(doc.sameFileAs.length ? [`The same file was uploaded before: ${doc.sameFileAs.join(", ")}.`] : []),
      ...(duplicates.length ? [`It may already be on record as ${duplicates.map((match) => match.ref).join(", ")}.`] : []),
    ];
    return toItem(doc, reasons, duplicates);
  });
}

/** The file itself, for the intake route. Null when the ref is not this business's or it has moved to its record. */
export async function readIntakeFile(ref: string): Promise<{ name: string; contentType: FinanceIntakeDocument["contentType"]; bytes: Buffer } | null> {
  const collection = await financeIntake();
  const doc = await collection.findOne({ ref });
  if (!doc?.dataUrl) return null;
  return { name: doc.name, contentType: doc.contentType, bytes: Buffer.from(doc.dataUrl.slice(doc.dataUrl.indexOf(",") + 1), "base64") };
}

/** Each field as the AI read it against what the person confirmed, for the record's history. */
function confirmedChanges(read: IntakeExtraction | null, input: IntakePostInput): FieldChange[] {
  if (!read) return [];
  const day = (value: string | null) => (value ? formatQuoteDay(value) : "");
  return fieldChanges([
    { field: "Money in or out", from: read.direction === "in" ? "Money in (invoice)" : "Money out (bill)", to: input.direction === "in" ? "Money in (invoice)" : "Money out (bill)" },
    { field: "Supplier / customer", from: read.party, to: input.party.trim() },
    { field: "Reference", from: read.reference, to: input.reference.trim() },
    { field: "Date", from: day(read.date), to: day(input.date) },
    { field: "Amount", from: read.amountCents !== null ? formatMoney(read.amountCents) : "", to: formatMoney(input.amountCents) },
    ...(input.direction === "out"
      ? [{ field: "Category", from: read.category ? expenseCategoryLabel(read.category) : "", to: input.category ? expenseCategoryLabel(input.category) : "" }]
      : []),
    { field: "Paid", from: read.paid ? "Yes" : "No", to: input.paid ? "Yes" : "No" },
  ]);
}

/**
 * Posts a checked upload as a bill (money out) or an invoice (money in),
 * settled the same day when it was already paid. The usual checks apply,
 * duplicates included. The file becomes the record's attachment, and the
 * record's history keeps every field the person changed from the AI's reading.
 */
export async function postIntake(ref: string, input: IntakePostInput, actor: FinanceActor): Promise<{ kind: "bill" | "invoice"; ref: string }> {
  const problem = intakePostProblem(input, todayKey());
  if (problem) throw new InputError(problem);

  const collection = await financeIntake();
  const doc = await collection.findOne({ ref });
  if (!doc || !doc.dataUrl) throw new InputError("That upload is no longer in the queue.");
  // Claimed first, so a second click or a second person cannot post it twice.
  const claim = await collection.updateOne({ ref, status: { $in: IN_QUEUE } }, { $set: { status: "posting" } });
  if (claim.modifiedCount === 0) throw new InputError("That upload has already been posted, discarded, or is being posted now.");

  const branch = doc.extraction?.branch ?? "";
  const remarks = [input.description.trim(), branch && `Branch: ${branch}`, `From ${ref} (${doc.name})`].filter(Boolean).join(" · ").slice(0, 600);
  const settle = input.paid && input.accountRef ? { accountRef: input.accountRef, paidOn: input.date, fee: input.fee } : null;
  let posted: { kind: "bill" | "invoice"; ref: string };
  try {
    posted =
      input.direction === "out"
        ? {
            kind: "bill",
            ref: await createBill(
              {
                payee: input.party,
                supplierRef: null,
                receiptRef: null,
                reference: input.reference,
                billDate: input.date,
                dueDate: input.paid ? input.date : input.dueDate,
                amountCents: input.amountCents,
                category: input.category!,
                responsiblePerson: actor.name,
                remarks,
                paidFrom: settle,
                confirmedDuplicates: input.confirmedDuplicates,
              },
              actor,
            ),
          }
        : {
            kind: "invoice",
            ref: await createInvoice(
              {
                customerName: input.party,
                customerRef: null,
                jobOrderRef: null,
                number: input.reference,
                invoiceDate: input.date,
                dueDate: input.paid ? input.date : input.dueDate,
                amountCents: input.amountCents,
                responsiblePerson: actor.name,
                remarks,
                nextFollowUpDate: null,
                collectedInto: settle,
                confirmedDuplicates: input.confirmedDuplicates,
              },
              actor,
            ),
          };
  } catch (error) {
    await collection.updateOne({ ref, status: "posting" }, { $set: { status: doc.status } });
    throw error;
  }

  // The record exists now; what follows only links the file and the trail to it.
  const records = posted.kind === "bill" ? await bills() : await invoices();
  await records.updateOne({ ref: posted.ref }, { $set: { intakeRef: ref } });
  let attachmentRef = "";
  try {
    attachmentRef = await storeAttachment(
      posted.ref,
      { name: doc.name, contentType: doc.contentType, dataUrl: doc.dataUrl, bytes: doc.bytes, sha256: doc.sha256 },
      actor,
    );
  } catch (error) {
    console.error(`[finance] ${ref}: could not attach to ${posted.ref}:`, error instanceof Error ? error.message : error);
  }
  await collection.updateOne(
    { ref },
    {
      $set: { status: "posted", posted: { ...posted, attachmentRef }, postedBy: actor.name, postedAt: new Date() },
      // The bytes now live on the record's attachment; keeping both would store every document twice.
      ...(attachmentRef ? { $unset: { dataUrl: "" } } : {}),
    },
  );
  const changes = confirmedChanges(doc.extraction, input);
  await logFinanceEvent(
    actor,
    "intake.posted",
    posted.ref,
    `Posted from ${ref} (${doc.name}), ${doc.extraction ? "read by AI and" : "typed in and"} confirmed by ${actor.name}${
      changes.length ? `; ${changes.length} ${changes.length === 1 ? "field" : "fields"} changed from the AI's reading` : ""
    }`,
    changes.length ? { changes, reason: "Checked against the document before posting" } : undefined,
  );
  await logFinanceEvent(actor, "intake.posted", ref, `Posted as ${posted.kind} ${posted.ref}`);
  return posted;
}

/** Set aside with a reason, never posted. Removed after the keep period by the Finance timer. */
export async function discardIntake(ref: string, reason: string, actor: FinanceActor): Promise<void> {
  const why = reason.trim();
  if (why.length < 5) throw new InputError("Say why this upload is being discarded.");
  const collection = await financeIntake();
  const result = await collection.updateOne(
    { ref, status: { $in: IN_QUEUE } },
    { $set: { status: "discarded", discardedBy: actor.name, discardedAt: new Date(), discardReason: why } },
  );
  if (result.modifiedCount === 0) throw new InputError("That upload has already been posted or discarded.");
  await logFinanceEvent(actor, "intake.discarded", ref, why);
}
