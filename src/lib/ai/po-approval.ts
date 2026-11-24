import "server-only";

import { listPoScanCandidates, savePoScan } from "@/lib/dal/mail";
import { notifyOwner } from "@/lib/dal/owner-alerts";
import {
  AI_QUOTE_ACTOR,
  findQuotation,
  listQuotationsAwaitingAnswer,
  recordQuoteResponse,
} from "@/lib/dal/quotations";
import { InputError } from "@/lib/dal/refs";
import { quoteAnsweredText } from "@/lib/owner-alerts";
import { formatPeso } from "@/lib/quotations";
import { createHash } from "node:crypto";
import { tokensUsedThisMonth } from "@/lib/dal/ai";
import { readMailAttachment } from "@/lib/mail/ingest";
import { AI_MODELS, AI_MONTHLY_TOKEN_BUDGET } from "./client";
import { firstPages } from "./finance-intake";
import { cacheKeyFor, generate } from "./generate";
import {
  PO_BATCH_SIZE,
  PO_INSTRUCTIONS,
  PO_LOOKBACK_DAYS,
  PO_MAX_QUOTES,
  PO_PROMPT_VERSION,
  PO_SCHEMA,
  PO_TOKENS_PER_MESSAGE,
  PO_ATTACHMENT_BUDGET_SHARE,
  PO_ATTACHMENT_INSTRUCTIONS,
  PO_ATTACHMENT_PAGES,
  PO_ATTACHMENT_SCHEMA,
  PO_ATTACHMENTS_PER_RUN,
  confirmedRefs,
  mergePoReads,
  mightBeApproval,
  parsePoAttachment,
  parsePoBatch,
  pickPoAttachment,
  shouldReadPoAttachment,
  toPoMessageInput,
  type PoAttachmentRead,
  type PoMessageInput,
  type PoQuoteInput,
  type PoRead,
} from "./po-approval-prompt";
import type { AiFailure, MailAttachmentInfo, MailMessageDocument, MailPoScan } from "@/types";

/**
 * Reads incoming mail for customers approving a quotation (usually a
 * purchase order) and records those quotations as Approved.
 *
 * It never makes a job order: an Approved quotation waits for staff to
 * decide. An approval the reader cannot tie to one open quotation with
 * certainty is marked on the email for a person to record by hand.
 *
 * Spend: runs after triage, once per email ever (`poScan.version`), only on
 * mail from the last two weeks, only while some quotation is waiting for an
 * answer, and only on mail whose words (or attachment names) suggest an
 * approval. Everything else is marked read without a model call.
 *
 * Attachments: the filenames always go with the text. The file itself (one
 * PDF or photo per email, the first pages of a PDF) is opened only when the
 * text leaves the approval unclear: no PO number, no clear quotation, or
 * just "PO attached". At most a few per sync, never from Supplier mail, and
 * not once most of the month's AI budget is spent.
 */

const KIND = "po-approval" as const;
const ATTACHMENT_KIND = "po-attachment" as const;
/** Reading a PDF or photo is slower than text. */
const ATTACHMENT_TIMEOUT_MS = 45_000;

/** Emails looked at per sync. */
const PER_RUN = 20;

export interface PoScanReport {
  /** Quotations recorded as Approved on this run. */
  approved: { ref: string; poNumber: string; customer: string }[];
  /** Emails that look like an approval but need a person. */
  review: number;
  stoppedBecause: AiFailure | null;
}

const IDLE: PoScanReport = { approved: [], review: 0, stoppedBecause: null };

function mark(doc: MailMessageDocument, scan: MailPoScan) {
  return savePoScan(doc.messageId, { ...scan, version: PO_PROMPT_VERSION, at: new Date() });
}

const NOT_APPROVAL: MailPoScan = { outcome: "none", poNumber: "", company: "", quotationRefs: [], note: "" };

export async function scanPurchaseOrders(businessName: string): Promise<PoScanReport> {
  const open = await listQuotationsAwaitingAnswer(PO_MAX_QUOTES);
  // Nothing is waiting for an answer, so no email can approve anything. Left
  // unmarked: a quotation sent later may be what an email is answering.
  if (open.length === 0) return IDLE;

  const candidates = await listPoScanCandidates(PO_PROMPT_VERSION, PER_RUN, PO_LOOKBACK_DAYS);
  const toRead: MailMessageDocument[] = [];
  for (const doc of candidates) {
    const filenames = (doc.attachments ?? []).filter((file) => !file.inline).map((file) => file.filename);
    if (mightBeApproval(doc.subject, doc.body.join("\n"), filenames)) toRead.push(doc);
    else await mark(doc, NOT_APPROVAL);
  }
  if (toRead.length === 0) return IDLE;

  const quotes: PoQuoteInput[] = open.map((quote) => ({
    ref: quote.ref,
    customer: quote.customer,
    company: quote.company,
    email: quote.email,
    plate: quote.plate,
    vehicle: quote.makeModel,
    total: formatPeso(quote.totalCents),
    date: quote.quoteDate,
  }));
  const report: PoScanReport = { approved: [], review: 0, stoppedBecause: null };
  let attachmentsRead = 0;

  for (let index = 0; index < toRead.length; index += PO_BATCH_SIZE) {
    const batch = toRead.slice(index, index + PO_BATCH_SIZE);
    const inputs = batch.map(toPoMessageInput);
    const sent = new Set(inputs.map((input) => input.id));

    const result = await generate<PoRead[]>({
      kind: KIND,
      cacheKey: cacheKeyFor({ messages: inputs, quotes }),
      promptVersion: PO_PROMPT_VERSION,
      model: AI_MODELS.fast,
      instructions: PO_INSTRUCTIONS,
      input: JSON.stringify({ openQuotations: quotes, messages: inputs }),
      maxOutputTokens: inputs.length * PO_TOKENS_PER_MESSAGE + 120,
      schemaName: "po_approval",
      schema: PO_SCHEMA as unknown as Record<string, unknown>,
      parse: (raw) => parsePoBatch(raw, sent),
    });

    if (!result.ok) {
      // A batch the model mangles would be mangled again: stop paying for it.
      // Anything else (busy, over budget) is tried on a later sync.
      if (result.reason === "unusable") {
        for (const doc of batch) await mark(doc, NOT_APPROVAL);
      }
      return { ...report, stoppedBecause: result.reason };
    }

    for (const doc of batch) {
      const input = toPoMessageInput(doc);
      let read: PoRead | null = result.data.find((entry) => entry.id === doc.messageId) ?? null;
      // Where a quotation number may be found: the text, the filenames, and
      // what was copied off an attachment if one is opened.
      let evidence = `${input.body}\n${input.attachments.join("\n")}`;
      let fromFile = false;

      const file = pickPoAttachment(doc.attachments);
      if (doc.category !== "Supplier" && shouldReadPoAttachment(read, input, file) && file) {
        if (attachmentsRead >= PO_ATTACHMENTS_PER_RUN) {
          // Left unmarked: the next sync opens it. Its text reading is cached, so free.
          continue;
        }
        if (await attachmentBudgetLeft()) {
          attachmentsRead += 1;
          const opened = await readPoAttachment(doc, input, file, quotes);
          if (opened) {
            read = mergePoReads(read, opened.read);
            evidence += `\n${opened.documentText}`;
            fromFile = opened.read.isApproval;
          }
        }
      }

      if (!read || !read.isApproval) {
        await mark(doc, NOT_APPROVAL);
        continue;
      }
      const refs = confirmedRefs({ ...input, body: evidence, receivedAt: doc.receivedAt }, read, open);
      const applied: string[] = [];
      for (const ref of refs) {
        const quote = open.find((entry) => entry.ref === ref);
        const customerName = read.company || doc.from || quote?.company || quote?.customer || "Customer";
        try {
          await recordQuoteResponse(
            ref,
            {
              outcome: "Approved",
              at: doc.receivedAt,
              customerName,
              method: "Purchase order",
              note: fromFile ? `${read.reason} (read from the attached ${file?.filename ?? "file"})` : read.reason,
              approvedLineIds: [],
              approvedDiscountCents: 0,
              poNumber: read.poNumber || undefined,
              source: { messageId: doc.messageId, from: doc.email || doc.from, subject: doc.subject, readByAi: true },
            },
            AI_QUOTE_ACTOR,
          );
        } catch (error) {
          // Answered or changed since it was listed: a person got there first.
          if (error instanceof InputError) continue;
          throw error;
        }
        applied.push(ref);
        report.approved.push({ ref, poNumber: read.poNumber, customer: customerName });
        const stored = await findQuotation(ref);
        if (stored?.response) {
          await notifyOwner(
            "quotes",
            `quote-answer:${ref}:${stored.revision}:Approved`,
            quoteAnsweredText(businessName, ref, "Approved", stored.response.customerName, stored.response.approvedTotalCents),
          );
        }
      }

      const po = `${read.poNumber ? `PO ${read.poNumber}` : "An approval"}${fromFile && file ? ` (in ${file.filename})` : ""}`;
      if (applied.length > 0) {
        await mark(doc, {
          outcome: "applied",
          poNumber: read.poNumber,
          company: read.company,
          quotationRefs: applied,
          note: `${po}${read.company ? ` from ${read.company}` : ""}: ${applied.join(", ")} marked Approved. Make the job order from the quotation when ready.`,
        });
      } else {
        report.review += 1;
        await mark(doc, {
          outcome: "review",
          poNumber: read.poNumber,
          company: read.company,
          quotationRefs: [],
          note: `${po}${read.company ? ` from ${read.company}` : ""} could not be matched to one quotation waiting for an answer. Open the quotation and record the approval by hand${
            read.quotationRefs.length ? ` (the AI thought: ${read.quotationRefs.join(", ")})` : ""
          }.`,
        });
      }
    }
  }

  return report;
}

/** Attachments are the dear part, so they stop well before the month's budget does. */
async function attachmentBudgetLeft(): Promise<boolean> {
  return (await tokensUsedThisMonth()) < AI_MONTHLY_TOKEN_BUDGET * PO_ATTACHMENT_BUDGET_SHARE;
}

/**
 * Opens one attachment and asks what it says. Null when the file cannot be
 * fetched or read, or the model fails: the email is then judged on its text.
 * Cached on the file's bytes, so the same PO forwarded twice is paid for once.
 */
async function readPoAttachment(
  doc: MailMessageDocument,
  input: PoMessageInput,
  file: MailAttachmentInfo,
  quotes: PoQuoteInput[],
): Promise<PoAttachmentRead | null> {
  const fetched = await readMailAttachment(doc.messageId, file.index);
  if (typeof fetched === "string") {
    console.error(`[po] attachment ${file.index} of ${doc.messageId} not read: ${fetched}`);
    return null;
  }
  const contentType = (fetched.contentType || file.contentType).toLowerCase();
  let dataUrl = `data:${contentType};base64,${fetched.content.toString("base64")}`;
  const isPdf = contentType === "application/pdf";
  if (isPdf) {
    const trimmed = await firstPages(dataUrl, PO_ATTACHMENT_PAGES);
    if (!trimmed) return null; // damaged or password-protected
    dataUrl = trimmed.dataUrl;
  }
  const sha256 = createHash("sha256").update(fetched.content).digest("hex");
  const filename = isPdf && !file.filename.toLowerCase().endsWith(".pdf") ? `${file.filename}.pdf` : file.filename;

  const result = await generate<PoAttachmentRead>({
    kind: ATTACHMENT_KIND,
    cacheKey: cacheKeyFor({ file: sha256, email: input, quotes, model: AI_MODELS.vision }),
    promptVersion: PO_PROMPT_VERSION,
    model: AI_MODELS.vision,
    instructions: PO_ATTACHMENT_INSTRUCTIONS,
    input: JSON.stringify({ openQuotations: quotes, email: input, attachment: filename }),
    ...(isPdf ? { files: [{ filename, dataUrl }] } : { images: [dataUrl] }),
    timeoutMs: ATTACHMENT_TIMEOUT_MS,
    maxOutputTokens: 700,
    schemaName: "po_attachment",
    schema: PO_ATTACHMENT_SCHEMA as unknown as Record<string, unknown>,
    parse: (raw) => parsePoAttachment(raw, doc.messageId),
  });
  if (!result.ok) {
    console.error(`[po] attachment of ${doc.messageId} not read: ${result.reason}`);
    return null;
  }
  return result.data;
}
