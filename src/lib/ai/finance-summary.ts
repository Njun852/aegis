import "server-only";

import { readCachedOutput } from "@/lib/dal/ai";
import { inventedNumbers, parseFinanceSummary, summaryFacts, type FinanceSummary } from "@/lib/finance-summary";
import { AI_MODELS } from "./client";
import { cacheKeyFor, generate } from "./generate";
import type { AiResult, FinanceReportView } from "@/types";

/**
 * The AI summary of one frozen finance report.
 *
 * Spend behaviour:
 *
 * - never written by opening or closing a report; only the "Write AI summary"
 *   button asks for it, and only an administrator sees the button;
 * - cached against a hash of the frozen revision's figures, which never
 *   change, so each revision is paid for at most once; opening a report reads
 *   the cache and cannot start a billable request;
 * - the input is totals only (`summaryFacts`): well under a thousand tokens,
 *   no names, no single records; the answer is capped at 400 tokens.
 *
 * And the specification's rule: an answer containing any number the frozen
 * figures do not contain is rejected, not shown and not cached.
 */

const KIND = "finance-summary" as const;
const PROMPT_VERSION = 2;
const MAX_OUTPUT_TOKENS = 400;

const SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "Two to four plain sentences: what this report says about the business, quoting its figures exactly as given.",
    },
    points: {
      type: "array",
      items: { type: "string" },
      description:
        "Up to four short points the summary does not already make: the largest expense categories, items needing attention, anything notable. Each quotes a figure exactly as given. Never repeat the summary. Empty if nothing more stands out.",
    },
  },
  required: ["summary", "points"],
  additionalProperties: false,
} as const;

const INSTRUCTIONS = [
  "You summarise one frozen financial report for the owner of a small business in the Philippines.",
  "You are given the report's figures as JSON. Say what they show, in plain words and short sentences.",
  "Copy every amount, percentage and count exactly as it appears in the input, including the peso sign and decimals.",
  "Never calculate a new figure: no sums, differences, ratios, percentages, averages, roundings or estimates that are not in the input. Any number not in the input makes your answer unusable.",
  "Do not mention anything the input does not contain, and do not guess at causes.",
  "The summary gives the headline figures; the points add what the summary leaves out, such as which expense categories were largest or what needs attention, and never restate the summary.",
  "An income report is about how much the business made in the period; a standing report is about where it stood at the end of the day given. Do not mix the two.",
  "Suggest, never promise. No headings, no markdown.",
].join(" ");

function cacheKeyOf(report: FinanceReportView): string {
  return cacheKeyFor(summaryFacts(report));
}

/** A summary already written for exactly this revision, or null. A cache read only: it cannot spend. */
export async function cachedFinanceSummary(report: FinanceReportView): Promise<FinanceSummary | null> {
  return readCachedOutput<FinanceSummary>(KIND, cacheKeyOf(report), PROMPT_VERSION);
}

/** Writes the summary for one frozen revision, from that revision's figures only. */
export async function generateFinanceSummary(report: FinanceReportView): Promise<AiResult<FinanceSummary>> {
  const facts = summaryFacts(report);
  return generate<FinanceSummary>({
    kind: KIND,
    cacheKey: cacheKeyFor(facts),
    promptVersion: PROMPT_VERSION,
    model: AI_MODELS.reasoning,
    instructions: INSTRUCTIONS,
    input: JSON.stringify(facts),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    schemaName: "finance_report_summary",
    schema: SCHEMA as unknown as Record<string, unknown>,
    // Rejecting here keeps an answer with an invented figure out of the cache too.
    parse: (raw) => {
      const answer = parseFinanceSummary(raw);
      if (!answer) return null;
      const invented = inventedNumbers(answer, facts);
      if (invented.length > 0) {
        console.warn(`[finance] AI summary rejected for ${facts.report}: figures not in the report: ${invented.join(", ")}`);
        return null;
      }
      return answer;
    },
  });
}
