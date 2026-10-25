import "server-only";

import { PDFDocument } from "pdf-lib";
import {
  INTAKE_INSTRUCTIONS,
  INTAKE_PROMPT_VERSION,
  INTAKE_SCHEMA,
  MAX_INTAKE_PDF_PAGES,
  intakeInput,
  parseIntakeExtraction,
} from "@/lib/finance-intake";
import { readCachedOutput } from "@/lib/dal/ai";
import { cacheKeyFor, generate } from "./generate";
import { AI_MODELS } from "./client";
import type { AiResult, AttachmentType, IntakeExtraction } from "@/types";

/**
 * Reading an invoice or receipt for the Review Queue. Kept cheap:
 *  - the browser shrinks a photo to about 1400px before upload, which is most
 *    of what a call costs; a PDF is cut to its first three pages here;
 *  - the cache key is the file's hash, so the same document uploaded again
 *    is never paid for twice;
 *  - a daily limit per business, and no reading once intake has used 60% of
 *    the month's budget, are checked by the caller before this is reached.
 */

const KIND = "finance-intake" as const;

/** Invoices read per business per day. Cached re-reads do not count. */
export const INTAKE_PER_DAY = Math.max(1, Number(process.env.OPENAI_FINANCE_INTAKE_PER_DAY) || 40);

/** Intake stops once this share of the monthly budget is spent; the rest is kept for mail and quotations. */
export const INTAKE_BUDGET_SHARE = 0.6;

/** An invoice's fields are short; 1,200 tokens leaves room without paying for a runaway answer. */
const MAX_OUTPUT_TOKENS = 1200;
const TIMEOUT_MS = 60_000;

function keyFor(sha256: string, businessName: string) {
  return cacheKeyFor({ intake: sha256, business: businessName, model: AI_MODELS.vision });
}

export async function isIntakeReadCached(sha256: string, businessName: string): Promise<boolean> {
  return (await readCachedOutput(KIND, keyFor(sha256, businessName), INTAKE_PROMPT_VERSION)) !== null;
}

/** The first pages of a PDF as a new PDF, or null when it cannot be opened (damaged or encrypted). */
export async function firstPages(dataUrl: string): Promise<{ dataUrl: string; pages: number } | null> {
  try {
    const source = await PDFDocument.load(Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"));
    const pages = source.getPageCount();
    if (pages <= MAX_INTAKE_PDF_PAGES) return { dataUrl, pages };
    const trimmed = await PDFDocument.create();
    const copied = await trimmed.copyPages(source, Array.from({ length: MAX_INTAKE_PDF_PAGES }, (_, index) => index));
    for (const page of copied) trimmed.addPage(page);
    const bytes = await trimmed.save();
    return { dataUrl: `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`, pages };
  } catch {
    return null;
  }
}

export async function readIntakeDocument(
  file: { name: string; contentType: AttachmentType; dataUrl: string; sha256: string },
  businessName: string,
): Promise<AiResult<IntakeExtraction>> {
  return generate({
    kind: KIND,
    cacheKey: keyFor(file.sha256, businessName),
    promptVersion: INTAKE_PROMPT_VERSION,
    model: AI_MODELS.vision,
    instructions: INTAKE_INSTRUCTIONS,
    input: intakeInput(businessName),
    ...(file.contentType === "application/pdf"
      ? { files: [{ filename: file.name.toLowerCase().endsWith(".pdf") ? file.name : `${file.name}.pdf`, dataUrl: file.dataUrl }] }
      : { images: [file.dataUrl] }),
    timeoutMs: TIMEOUT_MS,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    schemaName: "finance_intake",
    schema: INTAKE_SCHEMA,
    parse: (raw) => parseIntakeExtraction(raw, businessName),
  });
}
