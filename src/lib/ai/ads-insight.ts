import "server-only";

import { readActiveMetaAdsStatus } from "@/lib/dal/ad-account";
import { readCachedOutput } from "@/lib/dal/ai";
import { listAdRows } from "@/lib/dal/ads";
import {
  accountTotals,
  costPerResultCents,
  displayState,
  rowsAtLevel,
} from "@/lib/ads";
import { formatMoneyIn } from "@/lib/format";
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

// 2: facts carry the account's currency, the period, and whether the figures
// are live or samples; mixed result types are no longer totalled.
// 3: bookings and cost per booking per campaign, where bookings are tracked.
// 4: those booking figures removed again; bookings no longer name an ad.
const PROMPT_VERSION = 4;
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
  "Amounts are in the currency given; write them the way they appear in the input.",
  "If the account's results are marked mixed, compare campaigns by their own cost per result",
  "and do not add up results of different kinds.",
].join(" ");

export interface AdsInsightFacts {
  currency: string;
  /** "live Meta account" or "sample data", so the cache never crosses them. */
  source: string;
  period: string;
  account: {
    spend: string;
    /** A count, or "mixed" when campaigns count different kinds of result. */
    results: number | "mixed";
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
  const [all, meta] = await Promise.all([listAdRows(), readActiveMetaAdsStatus()]);
  const campaigns = rowsAtLevel(all, "campaigns");
  if (campaigns.length === 0) return null;

  const live = meta.connected;
  const currency = live ? (meta.currency ?? "USD") : "USD";
  const formatMoney = (cents: number, withCents = true) =>
    formatMoneyIn(cents, currency, withCents);
  const totals = accountTotals(
    all,
    live ? { spentTodayCents: meta.spentTodayCents } : undefined,
  );
  const mixed = live && !totals.resultLabel && totals.spendCents > 0;

  return {
    currency,
    source: live ? "live Meta account" : "sample data",
    // listAdRows() without a range reads the default period.
    period: live ? "last 30 days" : "sample period",
    account: {
      spend: formatMoney(totals.spendCents, false),
      results: mixed ? "mixed" : totals.results,
      costPerResult: totals.costPerResultCents ? formatMoney(totals.costPerResultCents) : "n/a",
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
      costPerResult: costPerResultCents(row) ? formatMoney(costPerResultCents(row)) : "n/a",
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
