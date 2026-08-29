import "server-only";

import OpenAI from "openai";

/**
 * The one place the OpenAI key is read. Marked `server-only` for the same
 * reason `src/lib/dal/*` is: importing it from a client component must be a
 * build error, not a leaked key.
 *
 * There is a single key for the whole install, shared by every tenant, so the
 * spend controls in `generate.ts` are what keep one business from exhausting
 * everyone's budget.
 */

/** `undefined` = not resolved yet, `null` = resolved and no key configured. */
let client: OpenAI | null | undefined;

export function getOpenAI(): OpenAI | null {
  if (client !== undefined) return client;

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  client = apiKey
    ? new OpenAI({
        apiKey,
        timeout: AI_TIMEOUT_MS,
        // One retry only. The SDK retries 429s and 5xx, which cost nothing
        // when the request is rejected outright — but a request that timed out
        // mid-generation may already have been billed, so retrying it twice
        // more is a way to pay three times for one answer.
        maxRetries: 1,
      })
    : null;

  return client;
}

/**
 * Whether AI is switched on for this install. Every surface has to work with
 * this false — the app must build, run and demo with no key configured.
 */
export function isAiConfigured(): boolean {
  return getOpenAI() !== null;
}

export const AI_TIMEOUT_MS = 20_000;

/**
 * Model per job, so the cheap tier does the volume work. Triage runs once per
 * message and is the only surface that scales with usage; the insight runs a
 * handful of times a day and can afford a better model.
 *
 * Both are env-configurable — swapping tiers should be a config change, not a
 * deploy. Verify the current pricing before changing the defaults.
 */
export const AI_MODELS = {
  fast: process.env.OPENAI_MODEL_FAST?.trim() || "gpt-4o-mini",
  reasoning: process.env.OPENAI_MODEL_REASONING?.trim() || "gpt-4o-mini",
} as const;

/**
 * Hard ceiling on tokens per business per calendar month. Reaching it degrades
 * every surface to its fallback copy rather than failing: a runaway loop should
 * quietly stop spending, not take the app down.
 */
export const AI_MONTHLY_TOKEN_BUDGET =
  Number(process.env.OPENAI_MONTHLY_TOKEN_BUDGET) || 200_000;
