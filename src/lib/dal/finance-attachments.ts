import "server-only";

import { createHash } from "node:crypto";
import { bills, financeAttachments, invoices, logFinanceEvent, payments } from "./finance";
import { InputError, insertWithRef } from "./refs";
import type { AttachmentType, FinanceActor, FinanceAttachment, FinanceAttachmentDocument } from "@/types";

/**
 * The documents behind finance records: a photo of the supplier's invoice,
 * the official receipt, the deposit slip. Stored with the business, like the
 * photos a quotation is read from, and never deleted or replaced, so a posted
 * record can always be checked against its source. A wrong file is answered
 * by attaching the right one; both stay in the record's history.
 */

/** Just under the 1 MB a Server Action accepts, with room for the request around it. */
export const MAX_ATTACHMENT_CHARS = 950_000;

/** A record can carry several pages, but not an album. */
const MAX_PER_RECORD = 12;

const PREFIXES: { prefix: string; type: AttachmentType }[] = [
  { prefix: "data:image/jpeg;base64,", type: "image/jpeg" },
  { prefix: "data:application/pdf;base64,", type: "application/pdf" },
];

function toView(doc: Omit<FinanceAttachmentDocument, "dataUrl">): FinanceAttachment {
  return {
    ref: doc.ref,
    recordRef: doc.recordRef,
    name: doc.name,
    contentType: doc.contentType,
    bytes: doc.bytes,
    uploadedBy: doc.uploadedBy,
    uploadedAt: doc.uploadedAt.toISOString(),
  };
}

/** The attachments on one or more records, oldest first, without their bytes. */
export async function listAttachmentsFor(refs: string[]): Promise<FinanceAttachment[]> {
  if (refs.length === 0) return [];
  const collection = await financeAttachments();
  const docs = await collection
    .find({ recordRef: { $in: refs } })
    .project<Omit<FinanceAttachmentDocument, "dataUrl">>({ dataUrl: 0 })
    .sort({ uploadedAt: 1 })
    .toArray();
  return docs.map(toView);
}

/** The record an attachment may be put on: an invoice, a bill or a payment of this business. */
async function recordExists(ref: string): Promise<boolean> {
  if (ref.startsWith("INV-")) return Boolean(await (await invoices()).findOne({ ref }));
  if (ref.startsWith("BL-")) return Boolean(await (await bills()).findOne({ ref }));
  if (ref.startsWith("PY-")) return Boolean(await (await payments()).findOne({ ref }));
  return false;
}

/** A checked upload: its type read from the bytes, its size and its hash. */
export interface CheckedFile {
  name: string;
  contentType: AttachmentType;
  dataUrl: string;
  bytes: number;
  sha256: string;
}

/**
 * Checks a photo or PDF as uploaded: a JPEG or PDF data URL, under the size
 * limit, and the type confirmed on the bytes, not only on what the browser
 * claimed. Shared with the Review Queue, whose uploads become attachments.
 */
export function checkUpload(file: { name: string; dataUrl: string }): CheckedFile {
  const match = PREFIXES.find((entry) => file.dataUrl.startsWith(entry.prefix));
  const body = match ? file.dataUrl.slice(match.prefix.length) : "";
  if (!match || !/^[A-Za-z0-9+/=]+$/.test(body)) throw new InputError("Attach a photo or a PDF.");
  if (file.dataUrl.length > MAX_ATTACHMENT_CHARS) throw new InputError("That file is too large. A PDF must be under about 700 KB.");

  const bytes = Buffer.from(body, "base64");
  const real = match.type === "application/pdf" ? bytes.subarray(0, 5).toString("latin1") === "%PDF-" : bytes[0] === 0xff && bytes[1] === 0xd8;
  if (!real) throw new InputError(match.type === "application/pdf" ? "That file is not a PDF." : "That file is not a photo AEGIS can store.");

  return {
    name: file.name.trim().slice(0, 120) || (match.type === "application/pdf" ? "document.pdf" : "photo.jpg"),
    contentType: match.type,
    dataUrl: file.dataUrl,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

/** Records already holding a file with this hash, other than `exceptRef`. */
export async function recordsWithFile(sha256: string, exceptRef: string): Promise<string[]> {
  const collection = await financeAttachments();
  const docs = await collection
    .find({ sha256, recordRef: { $ne: exceptRef } })
    .project<{ recordRef: string }>({ recordRef: 1, _id: 0 })
    .toArray();
  return [...new Set(docs.map((doc) => doc.recordRef))];
}

/** Stores a checked file on a record that is known to exist. */
export async function storeAttachment(recordRef: string, file: CheckedFile, actor: FinanceActor): Promise<string> {
  const collection = await financeAttachments();
  return insertWithRef(collection, "FA-", 1001, (next) =>
    collection.insertOne({
      ref: next,
      recordRef,
      name: file.name,
      contentType: file.contentType,
      dataUrl: file.dataUrl,
      bytes: file.bytes,
      sha256: file.sha256,
      uploadedBy: actor.name,
      uploadedAt: new Date(),
    }),
  );
}

/**
 * Attaches one file. Returns the records the same file is already attached
 * to, so the person is told at once that the document may be on record twice.
 */
export async function addAttachment(
  recordRef: string,
  upload: { name: string; dataUrl: string },
  actor: FinanceActor,
): Promise<{ ref: string; alsoOn: string[] }> {
  const file = checkUpload(upload);
  if (!(await recordExists(recordRef))) throw new InputError("That record is no longer on file.");
  const collection = await financeAttachments();
  if ((await collection.countDocuments({ recordRef })) >= MAX_PER_RECORD) {
    throw new InputError(`A record can carry at most ${MAX_PER_RECORD} attachments.`);
  }
  const alsoOn = await recordsWithFile(file.sha256, recordRef);
  const ref = await storeAttachment(recordRef, file, actor);
  await logFinanceEvent(
    actor,
    "attachment.added",
    recordRef,
    `Attached ${file.name} (${ref})${alsoOn.length ? `. The same file is also on ${alsoOn.join(", ")}` : ""}`,
  );
  return { ref, alsoOn };
}

/** The file itself, for the attachment route. Null when the ref is not this business's. */
export async function readAttachment(ref: string): Promise<{ name: string; contentType: AttachmentType; bytes: Buffer } | null> {
  const collection = await financeAttachments();
  const doc = await collection.findOne({ ref });
  if (!doc) return null;
  return {
    name: doc.name,
    contentType: doc.contentType,
    bytes: Buffer.from(doc.dataUrl.slice(doc.dataUrl.indexOf(",") + 1), "base64"),
  };
}
