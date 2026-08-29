import "server-only";

import { CURRENT_USER, ORGANIZATION } from "@/lib/data/workspace";
import { AI_MODELS } from "./client";
import { cacheKeyFor, clip, generate } from "./generate";
import type { AiResult } from "@/types";

/**
 * The compose dialog's "AI Assist" draft.
 *
 * Entirely user-triggered, so there is no background spend to control here —
 * the cost ceiling is that nobody presses the button. The cache still earns its
 * place: asking twice for the same draft, which is what someone does when they
 * are not sure the first one worked, is free the second time.
 */

const PROMPT_VERSION = 1;
const KIND = "compose-draft" as const;
const MAX_OUTPUT_TOKENS = 450;

const SCHEMA = {
  type: "object",
  properties: {
    subject: { type: "string" },
    body: { type: "string" },
  },
  required: ["subject", "body"],
  additionalProperties: false,
} as const;

export interface ComposeDraft {
  subject: string;
  body: string;
}

function parseDraft(raw: unknown): ComposeDraft | null {
  const value = raw as { subject?: unknown; body?: unknown };
  if (typeof value.subject !== "string" || typeof value.body !== "string") {
    return null;
  }
  const subject = value.subject.trim();
  const body = value.body.trim();
  return subject && body ? { subject, body } : null;
}

export interface ComposeRequest {
  to: string;
  /** What the sender wants to say, in their own words. */
  intent: string;
}

export async function draftEmail(
  request: ComposeRequest,
): Promise<AiResult<ComposeDraft>> {
  const input = {
    from: `${CURRENT_USER.name}, ${CURRENT_USER.role} at ${ORGANIZATION.name}`,
    signOff: CURRENT_USER.firstName,
    to: clip(request.to, 120),
    intent: clip(request.intent, 400),
  };

  const instructions = [
    "You draft a short business email on behalf of the sender described in the input.",
    "Write what the sender's intent asks for, in plain professional English:",
    "a subject line under ten words, and a body of at most three short paragraphs",
    "that opens with a greeting and closes with the sign-off name given.",
    "Do not invent commitments, figures, dates or attachments the intent does not mention.",
    "Where a specific detail is needed but not supplied, leave a clearly marked",
    "placeholder in square brackets rather than guessing.",
  ].join(" ");

  return generate<ComposeDraft>({
    kind: KIND,
    cacheKey: cacheKeyFor(input),
    promptVersion: PROMPT_VERSION,
    model: AI_MODELS.fast,
    instructions,
    input: JSON.stringify(input),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    schemaName: "compose_draft",
    schema: SCHEMA as unknown as Record<string, unknown>,
    parse: parseDraft,
  });
}
