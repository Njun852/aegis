import "server-only";

import {
  applyTriage,
  listUntriaged,
  markTriageAttempted,
} from "@/lib/dal/mail";
import { AI_MODELS } from "./client";
import { cacheKeyFor, generate } from "./generate";
import {
  BATCH_SIZE,
  INSTRUCTIONS,
  PROMPT_VERSION,
  SCHEMA,
  TOKENS_PER_MESSAGE,
  parseBatch,
  toInput,
} from "./mail-triage-prompt";
import type { AiFailure, MailTriageResult } from "@/types";

/**
 * Reads an inbox and fills in the category, priority, summary, action items,
 * deadline and suggested replies that the mail screens render.
 *
 * What the model is asked for, and what counts as a usable answer, lives in
 * `mail-triage-prompt.ts` so it can be tested without a database. This file is
 * the orchestration: which messages to send, in what batches, and what to do
 * when a batch fails.
 *
 * Triage is the only AI surface whose cost scales with usage, so it is the one
 * with real spend discipline around it:
 *
 * - it runs **once per message, ever** — `aiPromptVersion` on the document is
 *   the record of that, and `listUntriaged` is a set difference, so pressing
 *   sync again after everything is analysed selects nothing and costs nothing;
 * - messages are **batched**, so one request covers several rather than paying
 *   the per-request overhead each time;
 * - bodies are **clipped** before they are sent, because input tokens are the
 *   bulk of the bill and the tail of a long email rarely changes the summary;
 * - a batch the model mangles is **marked attempted** rather than retried for
 *   ever.
 */

const KIND = "mail-triage" as const;

export interface TriageReport {
  /** Messages that were waiting when the run started. */
  pending: number;
  analysed: number;
  /** Why the run stopped early, if it did. */
  stoppedBecause: AiFailure | null;
}

/**
 * Analyses everything not yet seen at the current prompt version, up to `limit`
 * messages. Returns a report rather than throwing — a sync that could not reach
 * the model is a normal outcome, and the inbox still renders.
 */
export async function triageInbox(limit = 24): Promise<TriageReport> {
  const pendingDocs = await listUntriaged(PROMPT_VERSION, limit);
  if (pendingDocs.length === 0) {
    return { pending: 0, analysed: 0, stoppedBecause: null };
  }

  let analysed = 0;

  for (let index = 0; index < pendingDocs.length; index += BATCH_SIZE) {
    const batch = pendingDocs.slice(index, index + BATCH_SIZE);
    const inputs = batch.map(toInput);
    const sent = new Set(inputs.map((input) => input.id));

    const result = await generate<MailTriageResult[]>({
      kind: KIND,
      cacheKey: cacheKeyFor(inputs),
      promptVersion: PROMPT_VERSION,
      model: AI_MODELS.fast,
      instructions: INSTRUCTIONS,
      input: JSON.stringify({ messages: inputs }),
      maxOutputTokens: inputs.length * TOKENS_PER_MESSAGE + 120,
      schemaName: "mail_triage",
      schema: SCHEMA as unknown as Record<string, unknown>,
      parse: (raw) => parseBatch(raw, sent),
    });

    if (!result.ok) {
      // Output we could not use will be produced again next time, so stop
      // paying for it. Infrastructure failures are transient — leave those
      // messages pending so a later sync picks them up.
      if (result.reason === "unusable") {
        await markTriageAttempted([...sent], PROMPT_VERSION);
      }
      return {
        pending: pendingDocs.length,
        analysed,
        stoppedBecause: result.reason,
      };
    }

    analysed += await applyTriage(result.data, PROMPT_VERSION);

    // A model that answered for only some of the batch would otherwise leave
    // the rest pending for ever, re-billed on every sync.
    const answered = new Set(result.data.map((entry) => entry.id));
    const missed = [...sent].filter((id) => !answered.has(id));
    if (missed.length > 0) await markTriageAttempted(missed, PROMPT_VERSION);
  }

  return { pending: pendingDocs.length, analysed, stoppedBecause: null };
}
