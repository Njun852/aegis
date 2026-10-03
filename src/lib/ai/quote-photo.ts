import "server-only";

import { readCachedOutput } from "@/lib/dal/ai";
import {
  QUOTE_PHOTO_INSTRUCTIONS,
  QUOTE_PHOTO_PROMPT_VERSION,
  QUOTE_PHOTO_SCHEMA,
  parseQuotePhotoRead,
} from "@/lib/quote-photo";
import { AI_MODELS } from "./client";
import { cacheKeyFor, generate } from "./generate";
import type { AiResult, QuotePhotoRead } from "@/types";

/**
 * Reads one photo into the start of a quotation.
 *
 * Spend rules, on top of the cache and the monthly budget in `generate`:
 *  - one call per photo, run only when a person uploads one, never on a render;
 *  - the photo is shrunk in the browser first (about 1400px), since the image
 *    is most of what a call costs;
 *  - the cache key is the hash of the photo's bytes, so uploading the same
 *    photo again costs nothing;
 *  - a daily cap per business, and no reading once a business has used most of
 *    its monthly budget, so photos cannot starve mail triage.
 */

const KIND = "quote-photo" as const;

/** Photos read per business per day. Cached re-reads do not count. */
export const PHOTOS_PER_DAY = Math.max(1, Number(process.env.OPENAI_QUOTE_PHOTOS_PER_DAY) || 10);

/** Photo reading stops once this share of the monthly budget is spent; the rest is kept for mail. */
export const PHOTO_BUDGET_SHARE = 0.8;

/**
 * A full estimate is about 40 short lines of JSON; 2,500 tokens leaves room
 * for that without paying for a runaway answer.
 */
const MAX_OUTPUT_TOKENS = 2500;
const TIMEOUT_MS = 45_000;

function keyFor(sha256: string) {
  return cacheKeyFor({ photo: sha256, model: AI_MODELS.vision });
}

/** Whether this exact photo has been read before, so reading it again is free. */
export async function isPhotoReadCached(sha256: string): Promise<boolean> {
  const cached = await readCachedOutput(KIND, keyFor(sha256), QUOTE_PHOTO_PROMPT_VERSION);
  return cached !== null;
}

export function readQuotePhoto(dataUrl: string, sha256: string): Promise<AiResult<QuotePhotoRead>> {
  return generate({
    kind: KIND,
    cacheKey: keyFor(sha256),
    promptVersion: QUOTE_PHOTO_PROMPT_VERSION,
    model: AI_MODELS.vision,
    instructions: QUOTE_PHOTO_INSTRUCTIONS,
    input: "Read this photo.",
    images: [dataUrl],
    timeoutMs: TIMEOUT_MS,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    schemaName: "quotation_photo",
    schema: QUOTE_PHOTO_SCHEMA,
    parse: parseQuotePhotoRead,
  });
}
