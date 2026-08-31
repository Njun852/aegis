import "server-only";

import { readCachedOutput } from "@/lib/dal/ai";
import { listAdRows } from "@/lib/dal/ads";
import {
  accountTotals,
  costPerResultCents,
  displayState,
  rowsAtLevel,
} from "@/lib/ads";
import { formatMoney } from "@/lib/format";
import { AI_MODELS } from "./client";
import { cacheKeyFor, generate } from "./generate";
import type { AiResult } from "@/types";

/**
 * The commentary panel on the Ads screen.
 *
 * Like the dashboard insight, the model sees figures rather than prose: seven
 * campaigns' spend, results and state, and nothing else. The answer is cached
 * against those figures, so it regenerates when the account actually moves —
 * including when someone flips a campaign off, which is exactly the change the
 * commentary is there to notice.
 */

const PROMPT_VERSION = 1;
const MAX_OUTPUT_TOKENS = 240;
const KIND = "ads-insight" as const;

const SCHEMA = {
  type: "object",
  properties: {
    insight: {
      type: "string",
      description: "Two or three sentences on where the ad budget is working.",
    },
  },
  required: ["insight"],
  additionalProperties: false,
} as const;

const INSTRUCTIONS = [
  "You write the commentary line on a small business's ad account dashboard.",
  "You are given every campaign with its state, spend, results, cost per result and ROAS.",
  "Name the campaign that is working hardest and the one wasting budget — a paused campaign",
  "still holding a daily budget, or one whose cost per result is well above the account average.",
  "Two or three sentences. Quote the figures you are reasoning from, and where you suggest",
  "moving budget, say roughly what it would buy at the receiving campaign's cost per result.",
  "Never invent a number that is not in the input.",
].join(" ");

export interface AdsInsightFacts {
  currency: "USD";
  account: {
    spend: string;
    results: number;
    costPerResult: string;
    roas: string;
    dailyBudget: string;
  };
  campaigns: {
    name: string;
    state: string;
    objective: string;
    spend: string;
    results: number;
    resultLabel: string;
    costPerResult: string;
    roas: number;
    dailyBudget: string | null;
  }[];
}

export async function buildAdsInsightFacts(): Promise<AdsInsightFacts | null> {
  const all = await listAdRows();
  const campaigns = rowsAtLevel(all, "campaigns");
  if (campaigns.length === 0) return null;

  const totals = accountTotals(all);

  return {
    currency: "USD",
    account: {
      spend: formatMoney(totals.spendCents, false),
      results: totals.results,
      costPerResult: formatMoney(totals.costPerResultCents),
      roas: totals.roas.toFixed(2),
      dailyBudget: formatMoney(totals.dailyBudgetCents, false),
    },
    campaigns: campaigns.map((row) => ({
      name: row.name,
      state: displayState(row),
      objective: row.objective,
      spend: formatMoney(row.spendCents, false),
      results: row.results,
      resultLabel: row.resultLabel,
      costPerResult: formatMoney(costPerResultCents(row)),
      roas: row.roas,
      dailyBudget:
        row.budgetType === "Daily" ? formatMoney(row.budgetCents, false) : null,
    })),
  };
}

function parseInsight(raw: unknown): string | null {
  const insight = (raw as { insight?: unknown })?.insight;
  if (typeof insight !== "string") return null;
  const trimmed = insight.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Cache read only — safe on a render path, cannot start a billable request. */
export async function cachedAdsInsight(): Promise<string | null> {
  const facts = await buildAdsInsightFacts();
  if (!facts) return null;
  return readCachedOutput<string>(KIND, cacheKeyFor(facts), PROMPT_VERSION);
}

export async function generateAdsInsight(): Promise<AiResult<string>> {
  const facts = await buildAdsInsightFacts();
  if (!facts) return { ok: false, reason: "error" };

  return generate<string>({
    kind: KIND,
    cacheKey: cacheKeyFor(facts),
    promptVersion: PROMPT_VERSION,
    model: AI_MODELS.reasoning,
    instructions: INSTRUCTIONS,
    input: JSON.stringify(facts),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    schemaName: "ads_insight",
    schema: SCHEMA as unknown as Record<string, unknown>,
    parse: parseInsight,
  });
}
