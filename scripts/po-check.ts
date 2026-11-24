/**
 * Checks the purchase-order reader's matching rules: which quotations an
 * email may be recorded against as Approved, given what the AI read.
 *
 *   npm run po:check
 *
 * Pure: no database, no model call, nothing stored. Exits non-zero on a
 * failed case.
 */
import {
  confirmedRefs,
  mergePoReads,
  mightBeApproval,
  parsePoAttachment,
  parsePoBatch,
  pickPoAttachment,
  shouldReadPoAttachment,
  toPoMessageInput,
  type PoRead,
} from "@/lib/ai/po-approval-prompt";
import type { MailAttachmentInfo } from "@/types";

const day = (iso: string) => new Date(`${iso}T09:00:00+08:00`);

const open = [
  { ref: "QT-1004", customer: "Juan Cruz", company: "Acme Logistics Inc.", email: "purchasing@acmelogistics.ph", createdAt: day("2026-11-18") },
  { ref: "QT-1005", customer: "Ana Reyes", company: "", email: "ana.reyes@gmail.com", createdAt: day("2026-11-19") },
  { ref: "QT-1006", customer: "Ben Lim", company: "Northwind Fleet", email: "ben@northwind.ph", createdAt: day("2026-11-20") },
  { ref: "QT-1007", customer: "Carl Tan", company: "Northwind Fleet", email: "carl@northwind.ph", createdAt: day("2026-11-21") },
];

function message(email: string, from: string, subject: string, body: string, received = "2026-11-22") {
  return { id: "m1", email, from, subject, body, attachments: [] as string[], receivedAt: day(received) };
}

function read(partial: Partial<PoRead>): PoRead {
  return { id: "m1", isApproval: true, poNumber: "PO-77", company: "", quotationRefs: [], confidence: "high", reason: "", ...partial };
}

let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n      expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
}

check(
  "ref written in the email is approved",
  confirmedRefs(message("x@other.com", "X", "PO for QT-1004", "Approved, PO-77 attached."), read({ quotationRefs: ["QT-1004"] }), open),
  ["QT-1004"],
);
check(
  "ref written as 'qt 1004' still matches",
  confirmedRefs(message("x@other.com", "X", "Re: quotation", "go signal on qt 1004 please"), read({}), open),
  ["QT-1004"],
);
check(
  "two refs written, only the one the AI read as approved",
  confirmedRefs(message("x@other.com", "X", "QT-1006 / QT-1007", "QT-1006 approved. QT-1007 still under review."), read({ quotationRefs: ["QT-1006"] }), open),
  ["QT-1006"],
);
check(
  "two refs written and the AI picked neither: nothing",
  confirmedRefs(message("x@other.com", "X", "QT-1006 / QT-1007", "Approved"), read({ quotationRefs: [] }), open),
  [],
);
check(
  "no ref, sender is the quotation's own address",
  confirmedRefs(message("ana.reyes@gmail.com", "Ana Reyes", "Go ahead", "Please proceed."), read({ quotationRefs: ["QT-1005"], confidence: "medium" }), open),
  ["QT-1005"],
);
check(
  "no ref, same company domain",
  confirmedRefs(message("accounting@acmelogistics.ph", "Acme Accounting", "PO", "Attached PO 4500012."), read({ quotationRefs: ["QT-1004"], confidence: "medium" }), open),
  ["QT-1004"],
);
check(
  "no ref, a stranger on gmail the AI matched anyway: nothing",
  confirmedRefs(message("someone@gmail.com", "Someone", "PO", "Approved."), read({ quotationRefs: ["QT-1005"], confidence: "medium" }), open),
  [],
);
check(
  "no ref, AI picked two quotations from one company: nothing",
  confirmedRefs(message("ops@northwind.ph", "Northwind", "PO", "Approved"), read({ quotationRefs: ["QT-1006", "QT-1007"], confidence: "medium" }), open),
  [],
);
check(
  "low confidence is never applied",
  confirmedRefs(message("x@other.com", "X", "QT-1004", "maybe"), read({ confidence: "low" }), open),
  [],
);
check(
  "not an approval is never applied",
  confirmedRefs(message("x@other.com", "X", "QT-1004", "Can you lower the price?"), read({ isApproval: false }), open),
  [],
);
check(
  "an email older than the quotation cannot approve it",
  confirmedRefs(message("x@other.com", "X", "QT-1007", "Approved", "2026-11-20"), read({ quotationRefs: ["QT-1007"] }), open),
  [],
);
check(
  "a ref the AI invented that is not open is dropped",
  confirmedRefs(message("ben@northwind.ph", "Ben", "PO", "ok"), read({ quotationRefs: ["QT-9999"], confidence: "medium" }), open),
  [],
);

check("prefilter: PO wording", mightBeApproval("Purchase Order 4500", ""), true);
check("prefilter: approval wording", mightBeApproval("Re: your quote", "Go signal, thanks"), true);
check("prefilter: unrelated", mightBeApproval("Lunch on Friday?", "See you there"), false);

check(
  "parse drops ids that were not sent and keeps known ones",
  parsePoBatch(
    { messages: [{ id: "m1", isApproval: true, poNumber: " PO-1 ", company: "A", quotationRefs: ["qt-1004"], confidence: "high", reason: "r" }, { id: "zz" }] },
    new Set(["m1"]),
  )?.map((entry) => [entry.id, entry.poNumber, entry.quotationRefs]),
  [["m1", "PO-1", ["QT-1004"]]],
);

// ---- Attachments ----------------------------------------------------------------

const att = (filename: string, contentType: string, size: number, inline = false, index = 0): MailAttachmentInfo => ({
  index,
  filename,
  contentType,
  size,
  inline,
});
const logo = att("image001.png", "image/png", 12_000, true, 0);
const poPdf = att("PO_2026-0145.pdf", "application/pdf", 90_000, false, 1);
const otherPdf = att("terms.pdf", "application/pdf", 40_000, false, 2);
const photo = att("IMG_2231.jpg", "image/jpeg", 2_400_000, false, 3);

check("pick: PO-named file first", pickPoAttachment([logo, otherPdf, photo, poPdf])?.filename, "PO_2026-0145.pdf");
check("pick: a PDF before a photo", pickPoAttachment([photo, otherPdf])?.filename, "terms.pdf");
check("pick: a signature logo is never read", pickPoAttachment([logo]), null);
check("pick: a Word file is not readable", pickPoAttachment([att("PO.docx", "application/msword", 30_000)]), null);
check("pick: too big is skipped", pickPoAttachment([att("PO.pdf", "application/pdf", 20 * 1024 * 1024)]), null);

const input = (subject: string, body: string, files: MailAttachmentInfo[] = []) =>
  toPoMessageInput({ messageId: "m1", from: "X", email: "x@acme.ph", subject, body: [body], attachments: files });

check("filenames go with the text, logos do not", input("PO", "", [logo, poPdf]).attachments, ["PO_2026-0145.pdf"]);
check(
  "open the file: text is an approval with no PO number",
  shouldReadPoAttachment(read({ poNumber: "" }), input("Approved", "Please proceed", [otherPdf]), otherPdf),
  true,
);
check(
  "skip the file: text already has PO number and ref at high confidence",
  shouldReadPoAttachment(read({ poNumber: "PO-1", quotationRefs: ["QT-1004"] }), input("PO-1 for QT-1004", "ok", [poPdf]), poPdf),
  false,
);
check(
  "open the file: not an approval in text, but the file is named like a PO",
  shouldReadPoAttachment(read({ isApproval: false }), input("Hello", "see attached", [poPdf]), poPdf),
  true,
);
check(
  "open the file: 'PO attached' with an unnamed scan",
  shouldReadPoAttachment(read({ isApproval: false }), input("Re: quotation", "Our PO is attached.", [photo]), photo),
  true,
);
check(
  "skip the file: photos of a car with no PO wording",
  shouldReadPoAttachment(read({ isApproval: false }), input("Car photos", "Attached are the photos of the dent", [photo]), photo),
  false,
);
check("prefilter sees attachment names", mightBeApproval("Hello", "see attached", ["PO_2026-0145.pdf"]), true);
check("prefilter: 'PO# 4500' in the text", mightBeApproval("Hello", "Here is our PO# 4500123"), true);
check("prefilter: 'P.O. No.' in the text", mightBeApproval("Hello", "P.O. No. 77 attached"), true);
check(
  "prefilter: Tagalog 'po' is not a purchase order",
  mightBeApproval("Kumusta", "Salamat po sa tulong ninyo. Kailan po kayo bukas?"),
  false,
);
check("prefilter: 'Our PO is attached' counts", mightBeApproval("Hi", "Our PO is attached"), true);
check("prefilter: 'photo.jpg' is not a PO file", mightBeApproval("Hi", "", ["photo.jpg", "repo.zip"]), false);

const fromFile = parsePoAttachment(
  {
    isApproval: true,
    poNumber: "PO-2026-0145",
    company: "Acme Logistics Inc.",
    quotationRefs: ["QT-1004"],
    confidence: "high",
    reason: "A purchase order from Acme for the brake job.",
    documentText: "PURCHASE ORDER No. PO-2026-0145 · Ref: Quotation QT-1004 · Total PHP 3,500.00",
  },
  "m1",
);
check("parse attachment read", [fromFile?.read.poNumber, fromFile?.read.quotationRefs, fromFile?.documentText.includes("QT-1004")], [
  "PO-2026-0145",
  ["QT-1004"],
  true,
]);
const merged = mergePoReads(read({ poNumber: "", confidence: "medium", quotationRefs: [] }), fromFile!.read);
check("merge: the file fills in the PO number and ref", [merged.poNumber, merged.quotationRefs, merged.confidence], [
  "PO-2026-0145",
  ["QT-1004"],
  "high",
]);
check(
  "merge: a file that is not a PO leaves the text's reading",
  mergePoReads(read({ poNumber: "X1" }), { ...fromFile!.read, isApproval: false }).poNumber,
  "X1",
);
check(
  "a ref printed only on the attached PO is approved",
  confirmedRefs(
    { ...message("x@other.com", "X", "PO attached", `Please see attached.\nPO_2026-0145.pdf\n${fromFile!.documentText}`) },
    merged,
    open,
  ),
  ["QT-1004"],
);

console.log(failed ? `\n${failed} failed` : "\nAll passed");
process.exit(failed ? 1 : 0);
