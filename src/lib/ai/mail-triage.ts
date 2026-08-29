import "server-only";

import {
  applyTriage,
  listUntriaged,
  markTriageAttempted,
} from "@/lib/dal/mail";
import { PRIORITY_ORDER } from "@/lib/mail";
import { AI_MODELS } from "./client";
import { cacheKeyFor, clip, generate } from "./generate";
import type {
  AiFailure,
  MailMessageDocument,
  MailPriority,
  MailTriageResult,
} from "@/types";

/**
 * Reads an inbox and fills in the priority, summary, action items and suggested
 * replies that the mail screens render.
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
 *
 * Bump `PROMPT_VERSION` only when the prompt genuinely changes: it re-triages
 * every message in every tenant, and that is the most expensive thing anyone
 * can do to this install.
 */

const PROMPT_VERSION = 1;
const KIND = "mail-triage" as const;

/** Messages per request. Large enough to amortise, small enough to stay whole. */
const BATCH_SIZE = 6;

/** Characters of body text sent per message. */
const BODY_BUDGET = 700;

/** Output ceiling per message, plus a little slack for the envelope. */
const TOKENS_PER_MESSAGE = 190;

const SCHEMA = {
  type: "object",
  properties: {
    messages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          priority: { type: "string", enum: PRIORITY_ORDER },
          summary: { type: "string" },
          actionItems: { type: "array", items: { type: "string" } },
          replies: { type: "array", items: { type: "string" } },
        },
        required: ["id", "priority", "summary", "actionItems", "replies"],
        additionalProperties: false,
      },
    },
  },
  required: ["messages"],
  additionalProperties: false,
} as const;

const INSTRUCTIONS = [
  "You triage a small business's shared inbox. For each message you are given, return:",
  "priority — Urgent only for something with a deadline or money at risk, High for something needing a reply this week, Normal for routine correspondence, Low for newsletters and automated notices;",
  "summary — one or two sentences stating what the sender wants and any deadline or figure, written for someone who has not read the message;",
  "actionItems — at most three, each under six words, phrased as a task ('Reply by Friday', 'Compare 12 vs 24 month terms'). Return an empty array when nothing is needed;",
  "replies — at most three suggested reply options, each a short button label under five words ('Accept terms', 'Ask for extension'), not the reply text itself.",
  "Return exactly one entry per message, reusing the id you were given.",
  "Work only from the text provided. Never invent a figure, a date or a name that is not in it.",
].join(" ");

interface TriageInput {
  id: string;
  from: string;
  subject: string;
  label: string;
  body: string;
}

function toInput(doc: MailMessageDocument): TriageInput {
  return {
    id: doc.messageId,
    from: doc.from,
    subject: clip(doc.subject, 160),
    label: doc.label,
    body: clip(doc.body.join("\n\n"), BODY_BUDGET),
  };
}

function isPriority(value: unknown): value is MailPriority {
  return (
    typeof value === "string" &&
    (PRIORITY_ORDER as readonly string[]).includes(value)
  );
}

/**
 * Structured output guarantees the shape, not the sense. This drops anything
 * that would render badly — an id we never sent, an empty summary, a "reply
 * option" that is a paragraph — rather than writing it to the database.
 */
function parseBatch(raw: unknown, sent: Set<string>): MailTriageResult[] | null {
  const list = (raw as { messages?: unknown })?.messages;
  if (!Array.isArray(list)) return null;

  const results: MailTriageResult[] = [];
  for (const entry of list) {
    const item = entry as Record<string, unknown>;
    if (typeof item.id !== "string" || !sent.has(item.id)) continue;
    if (!isPriority(item.priority)) continue;
    if (typeof item.summary !== "string" || !item.summary.trim()) continue;

    const strings = (value: unknown, max: number, maxChars: number) =>
      Array.isArray(value)
        ? value
            .filter(
              (entryValue): entryValue is string =>
                typeof entryValue === "string" &&
                entryValue.trim().length > 0 &&
                entryValue.trim().length <= maxChars,
            )
            .map((entryValue) => entryValue.trim())
            .slice(0, max)
        : [];

    results.push({
      id: item.id,
      priority: item.priority,
      summary: item.summary.trim(),
      actionItems: strings(item.actionItems, 3, 48),
      replies: strings(item.replies, 3, 32),
    });
  }

  return results.length > 0 ? results : null;
}

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
