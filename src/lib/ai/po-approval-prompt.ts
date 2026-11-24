import { clip } from "@/lib/format";
import type { MailAttachmentInfo } from "@/types";

/**
 * What the purchase-order reader asks the model, and the checks its answer
 * must pass before anything is recorded on a quotation.
 *
 * Free of `server-only` and of the database, like `mail-triage-prompt.ts`, so
 * the prompt and the matching rules can be exercised from a script.
 *
 * The reader only ever records a quotation as Approved. It never makes a job
 * order: staff decide that. And it is biased one way: an approval it cannot
 * tie to a quotation with certainty is left for a person ("review"), because
 * a quotation wrongly marked Approved costs more than a person typing a PO
 * number in.
 */

/**
 * Bump when the prompt or the rules change: every recent email is read again.
 * v2: attachment filenames go with the text, and a PO attached as a PDF or
 * photo is opened when the text leaves the approval unclear.
 */
export const PO_PROMPT_VERSION = 2;

/** Emails per request. */
export const PO_BATCH_SIZE = 5;

/** Characters of each email's text sent to the model. POs put the number near the top. */
export const PO_BODY_BUDGET = 1_200;

/** Open quotations listed to the model per request, newest first. */
export const PO_MAX_QUOTES = 40;

/** Only mail this recent is read; older approvals are not news. */
export const PO_LOOKBACK_DAYS = 14;

export const PO_TOKENS_PER_MESSAGE = 160;

export type PoConfidence = "high" | "medium" | "low";

/** One email's reading, after validation. */
export interface PoRead {
  id: string;
  isApproval: boolean;
  poNumber: string;
  company: string;
  quotationRefs: string[];
  confidence: PoConfidence;
  reason: string;
}

/** What the model is shown of one email. */
export interface PoMessageInput {
  id: string;
  from: string;
  email: string;
  subject: string;
  body: string;
  /** Names of the files attached, e.g. "PO_2026-0145.pdf". The files themselves are not sent with the text. */
  attachments: string[];
}

/** What the model is shown of one open quotation. */
export interface PoQuoteInput {
  ref: string;
  customer: string;
  company: string;
  email: string;
  plate: string;
  vehicle: string;
  total: string;
  date: string;
}

export const PO_INSTRUCTIONS = `You read emails sent to a car-service shop and decide whether each one is a customer approving one of the shop's quotations.

Each email lists its attachment filenames; a filename such as "PO_2026-0145.pdf" or "Purchase Order 4500012.pdf" is part of what the email says. The files themselves are read separately.

An approval is: the customer sends or attaches a purchase order (PO) for the work, or clearly says the quotation is approved / accepted / "go signal" / "please proceed" with the work quoted. A PO number on its own, in reply to a quotation, counts.

NOT an approval: asking a question about a quotation, asking for a discount or a new quote, a supplier's quotation or PO to the shop, an invoice or payment notice, a decline, "we will get back to you", newsletters, or anything uncertain.

For each email return:
- isApproval: true only for a clear approval as described.
- poNumber: the purchase order number exactly as written in the text or an attachment's filename (e.g. "PO-2026-0145", "4500012345"), or "" if none is given.
- company: the customer company or person approving, as written, or "".
- quotationRefs: refs from the OPEN QUOTATIONS list that this email approves. Use only refs in that list. Match on a ref written in the email, or on the sender's email address / company name / plate / vehicle / amount matching exactly one open quotation. If it could be more than one quotation and nothing in the email singles it out, return [].
- confidence: "high" when a quotation ref or PO for an exact listed quotation is written; "medium" when matched only by sender, company, plate or amount; "low" when unsure.
- reason: one short sentence on what you read.

Never invent a ref, PO number or company. Answer for every email id you were given.`;

export const PO_SCHEMA = {
  type: "object",
  properties: {
    messages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          isApproval: { type: "boolean" },
          poNumber: { type: "string" },
          company: { type: "string" },
          quotationRefs: { type: "array", items: { type: "string" } },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          reason: { type: "string" },
        },
        required: ["id", "isApproval", "poNumber", "company", "quotationRefs", "confidence", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["messages"],
  additionalProperties: false,
} as const;

/**
 * Words an approval email almost always carries. Mail with none of them is not
 * sent to the model at all, which keeps the reader nearly free: most mail is
 * not about a quotation.
 */
const APPROVAL_HINT =
  /\b(purchase\s+order|approv\w*|accept\w*|go\s+signal|proceed|confirm\w*|qt[-\s]?\d{3,}|quot\w*|estimate)\b/i;

/**
 * "PO" as a purchase order: written in capitals ("Our PO is attached"), or
 * in any case when followed by a number, "no." or "#" ("po 4500", "p.o. no.").
 * Never the bare lower-case word, which in Filipino mail is the polite "po"
 * of "Salamat po".
 */
const PO_NUMBERED = /(^|[^a-z])p\.?\s?o\.?(?=[\s_#:.-]*(no\b|no\.|num(ber)?\b|#|\d))/i;
const PO_CAPITALS = /(^|[^A-Za-z])P\.?O\.?(?![A-Za-z])/;

function mentionsPo(text: string): boolean {
  return PO_NUMBERED.test(text) || PO_CAPITALS.test(text);
}

/** A file named like a purchase order: "PO.pdf", "PO_2026-0145.pdf", "Purchase Order 12.pdf". */
const PO_FILENAME = /(^|[^a-z])(p\.?o\.?|purchase[\s_-]*order)([^a-z]|$)/i;

export function mightBeApproval(subject: string, body: string, filenames: string[] = []): boolean {
  const text = `${subject}\n${body.slice(0, 4_000)}`;
  return APPROVAL_HINT.test(text) || mentionsPo(text) || filenames.some((name) => PO_FILENAME.test(name));
}

export function toPoMessageInput(doc: {
  messageId: string;
  from: string;
  email: string;
  subject: string;
  body: string[];
  attachments?: MailAttachmentInfo[];
}): PoMessageInput {
  return {
    id: doc.messageId,
    from: doc.from,
    email: doc.email,
    subject: clip(doc.subject, 200),
    body: clip(doc.body.join("\n\n"), PO_BODY_BUDGET),
    // Files attached as files; logos and signatures pasted into the body are noise.
    attachments: (doc.attachments ?? [])
      .filter((file) => !file.inline)
      .slice(0, 6)
      .map((file) => clip(file.filename, 100)),
  };
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** The model's answer for a batch, or null when it is not usable at all. */
export function parsePoBatch(raw: unknown, sent: Set<string>): PoRead[] | null {
  const list = (raw as { messages?: unknown })?.messages;
  if (!Array.isArray(list)) return null;
  const reads: PoRead[] = [];
  for (const item of list) {
    const entry = (item ?? {}) as Record<string, unknown>;
    const id = text(entry.id, 300);
    if (!sent.has(id) || reads.some((read) => read.id === id)) continue;
    const confidence = (["high", "medium", "low"] as const).find((value) => value === entry.confidence) ?? "low";
    reads.push({
      id,
      isApproval: entry.isApproval === true,
      poNumber: text(entry.poNumber, 40),
      company: text(entry.company, 120),
      quotationRefs: Array.isArray(entry.quotationRefs)
        ? [...new Set(entry.quotationRefs.map((ref) => text(ref, 20).toUpperCase()).filter(Boolean))].slice(0, 5)
        : [],
      confidence,
      reason: text(entry.reason, 240),
    });
  }
  return reads;
}

// ---- Matching ----------------------------------------------------------------------

/** Mail providers anyone can sign up to: sharing one says nothing about being the same customer. */
const SHARED_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.com.ph",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "zoho.com",
]);

function domainOf(address: string): string {
  return address.trim().toLowerCase().split("@")[1] ?? "";
}

function fold(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** "QT-1004", "QT 1004" and "qt1004" are the same ref. */
function mentionsRef(haystack: string, ref: string): boolean {
  const digits = ref.replace(/^QT-?/i, "");
  return new RegExp(`\\bqt[-\\s#]?${digits}\\b`, "i").test(haystack);
}

export interface PoQuoteCandidate {
  ref: string;
  customer: string;
  company: string;
  email: string;
  /** When the quotation was made: an approval cannot be older than the quotation. */
  createdAt: Date;
}

/**
 * The quotations an email may be recorded against: the model's picks, each
 * confirmed by something checkable in the email itself, so a model that
 * guesses cannot approve a quotation on its own say-so.
 *
 * A pick stands when the email names its ref, or comes from the quotation's
 * own address, or from the same company domain, or names the quotation's
 * company. Refs the email names outright stand even if the model missed them.
 */
export function confirmedRefs(
  message: PoMessageInput & { receivedAt: Date },
  read: PoRead,
  open: PoQuoteCandidate[],
): string[] {
  if (!read.isApproval || read.confidence === "low") return [];
  const haystack = `${message.subject}\n${message.body}`;
  const sender = message.email.trim().toLowerCase();
  const senderDomain = domainOf(sender);
  const senderText = fold(`${message.from} ${haystack}`);
  const eligible = open.filter((quote) => quote.createdAt.getTime() <= message.receivedAt.getTime());

  // The email names quotations: only those count. Where it names several, only
  // the ones the model read as approved ("QT-1004 approved, QT-1005 still
  // under review"); one named on its own stands even if the model missed it.
  const mentioned = eligible.filter((quote) => mentionsRef(haystack, quote.ref)).map((quote) => quote.ref);
  if (mentioned.length > 0) {
    const agreed = mentioned.filter((ref) => read.quotationRefs.includes(ref));
    if (agreed.length > 0) return agreed;
    return mentioned.length === 1 ? mentioned : [];
  }

  const picks = eligible.filter((quote) => read.quotationRefs.includes(quote.ref));
  // Matched on who sent it, not a ref: it must point at exactly one quotation.
  if (picks.length !== 1) return [];
  const quote = picks[0];
  const quoteEmail = quote.email.trim().toLowerCase();
  const company = fold(quote.company);
  const vouched =
    (quoteEmail !== "" && quoteEmail === sender) ||
    (quoteEmail !== "" && senderDomain !== "" && !SHARED_DOMAINS.has(senderDomain) && domainOf(quoteEmail) === senderDomain) ||
    (company.length >= 4 && ` ${senderText} `.includes(` ${company} `));
  return vouched ? [quote.ref] : [];
}

// ---- Attachments -------------------------------------------------------------------

/**
 * Attachments opened per sync. Each costs about as much as fifteen emails read
 * as text, so the few that need it are read and the rest wait their turn.
 */
export const PO_ATTACHMENTS_PER_RUN = 3;

/** Pages of a PDF sent: a purchase order states its number, buyer and total on the first page. */
export const PO_ATTACHMENT_PAGES = 2;

/** Larger files are not sent; a person reads them. */
export const PO_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;

/** Attachment reading stops once this share of the monthly budget is spent; text reading carries on. */
export const PO_ATTACHMENT_BUDGET_SHARE = 0.8;

const READABLE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

/** Pasted into the body rather than attached: only a big one can be a photographed PO, not a logo. */
const MIN_INLINE_IMAGE_BYTES = 150 * 1024;

const PO_WORDS = /\b(purchase\s+order|approv\w*|go\s+signal|proceed)/i;
const MENTIONS_ATTACHMENT = /\b(attach\w*|enclos\w*|see\s+(the\s+)?file)\b/i;

/**
 * The one attachment worth opening for a purchase order, or null: one named
 * like a PO first, then a PDF, then the largest photo.
 */
export function pickPoAttachment(attachments: MailAttachmentInfo[] | undefined): MailAttachmentInfo | null {
  const readable = (attachments ?? []).filter(
    (file) =>
      READABLE_TYPES.includes(file.contentType) &&
      file.size > 0 &&
      file.size <= PO_ATTACHMENT_MAX_BYTES &&
      (!file.inline || (file.contentType !== "application/pdf" && file.size >= MIN_INLINE_IMAGE_BYTES)),
  );
  if (readable.length === 0) return null;
  return (
    readable.find((file) => PO_FILENAME.test(file.filename)) ??
    readable.find((file) => file.contentType === "application/pdf") ??
    [...readable].sort((a, b) => b.size - a.size)[0]
  );
}

/**
 * Whether the attachment has to be opened to settle the email. Only when the
 * text leaves it open: an approval with no PO number or no clear quotation,
 * or an email that is only "PO attached" and a file.
 */
export function shouldReadPoAttachment(read: PoRead | null, input: PoMessageInput, file: MailAttachmentInfo | null): boolean {
  if (!file) return false;
  if (read?.isApproval) {
    return !read.poNumber || read.confidence !== "high" || read.quotationRefs.length === 0;
  }
  if (PO_FILENAME.test(file.filename)) return true;
  const words = `${input.subject}\n${input.body}`;
  return MENTIONS_ATTACHMENT.test(words) && (PO_WORDS.test(words) || mentionsPo(words));
}

export const PO_ATTACHMENT_INSTRUCTIONS = `You are given one email sent to a car-service shop, the shop's OPEN QUOTATIONS, and one file attached to the email (a PDF or a photo).

Decide whether the email and its attachment together are the customer approving one of the open quotations, usually by issuing a purchase order (PO) to the shop. A PO issued BY the shop to a supplier, a supplier's quotation, an invoice, a receipt, or a photo of a car is NOT an approval.

Return:
- isApproval: true only for a clear approval.
- poNumber: the purchase order number exactly as printed, or "".
- company: the buyer's company or name as printed, or "".
- quotationRefs: refs from the OPEN QUOTATIONS list the document approves: one printed on it, or the single quotation whose customer, plate, vehicle and amount match it. [] if unsure or if more than one could match.
- confidence: "high" when a listed quotation ref, or the exact customer and amount, are printed; "medium" when matched on customer or plate only; "low" when unsure.
- reason: one short sentence on what the document is.
- documentText: copy, word for word, the lines of the document that carry the PO number, the buyer, any quotation number referred to, and the total. At most 600 characters. "" if the file is not a document.

Never invent a ref, number or name that is not printed.`;

export const PO_ATTACHMENT_SCHEMA = {
  type: "object",
  properties: {
    isApproval: { type: "boolean" },
    poNumber: { type: "string" },
    company: { type: "string" },
    quotationRefs: { type: "array", items: { type: "string" } },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    reason: { type: "string" },
    documentText: { type: "string" },
  },
  required: ["isApproval", "poNumber", "company", "quotationRefs", "confidence", "reason", "documentText"],
  additionalProperties: false,
} as const;

export interface PoAttachmentRead {
  read: PoRead;
  /** What the model copied off the document: where a quotation number printed on it is looked for. */
  documentText: string;
}

export function parsePoAttachment(raw: unknown, messageId: string): PoAttachmentRead | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  const [read] = parsePoBatch({ messages: [{ ...entry, id: messageId }] }, new Set([messageId])) ?? [];
  if (!read) return null;
  return { read, documentText: text(entry.documentText, 800) };
}

/**
 * The email's reading once its attachment has been opened. The document
 * settles what the text left open; the text's findings stay where the
 * document says nothing.
 */
export function mergePoReads(fromText: PoRead | null, fromFile: PoRead): PoRead {
  if (!fromFile.isApproval) return fromText ?? fromFile;
  const rank = { low: 0, medium: 1, high: 2 } as const;
  return {
    id: fromFile.id,
    isApproval: true,
    poNumber: fromFile.poNumber || fromText?.poNumber || "",
    company: fromFile.company || fromText?.company || "",
    quotationRefs: fromFile.quotationRefs.length ? fromFile.quotationRefs : (fromText?.quotationRefs ?? []),
    confidence:
      fromText?.isApproval && rank[fromText.confidence] > rank[fromFile.confidence] ? fromText.confidence : fromFile.confidence,
    reason: fromFile.reason || fromText?.reason || "",
  };
}
