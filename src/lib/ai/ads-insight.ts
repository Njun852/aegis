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
import { manilaDateKey } from "@/lib/booking-slots";
import { formatMoneyIn } from "@/lib/format";
import { AI_MODELS } from "./client";
import { cacheKeyFor, generate } from "./generate";
import { hourlyReport, latestReport, type TimedReport } from "./hourly-report";
import type { AdRange, AiResult } from "@/types";

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

/**
 * The account's figures for one window. Without a range, the default period
 * the commentary has always covered; with "today", the daily report's.
 */
export async function buildAdsInsightFacts(range?: Extract<AdRange, "today">): Promise<AdsInsightFacts | null> {
  const [all, meta] = await Promise.all([range ? listAdRows(range) : listAdRows(), readActiveMetaAdsStatus()]);
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
    period: !live ? "sample period" : range === "today" ? "today so far" : "last 30 days",
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

// ---- The daily report ---------------------------------------------------------------

/**
 * How the account is doing today, for the Ads screen's daily report.
 *
 * Refreshed at most once an hour, and only when the figures have moved since
 * the last one; see `hourly-report.ts`. Meta's figures for today change with
 * every five-minute sync, so keying on them alone would pay for a new report
 * every few minutes. Only for a connected account: a daily report on sample
 * figures would describe a day that did not happen.
 */
// 2: today so far, refreshed hourly, rather than yesterday once a day.
const DAILY_PROMPT_VERSION = 2;
const DAILY_KIND = "ads-daily" as const;

const DAILY_SCHEMA = {
  type: "object",
  properties: {
    report: {
      type: "string",
      description: "Three sentences on how the ad account is doing today.",
    },
  },
  required: ["report"],
  additionalProperties: false,
} as const;

const DAILY_INSTRUCTIONS = [
  "You write the daily report on a small business's ad account dashboard.",
  "You are given today's figures so far, as of the time given, for the account and every campaign.",
  "Say what the account has spent today and what it has got for it, which campaign is doing best and which",
  "worst by cost per result, and one thing worth checking before the day ends, such as a campaign spending",
  "with no results. The day is not over, so never treat a figure as final.",
  "Three sentences. Quote the figures you are reasoning from. Never invent a number that is not in the input.",
  "Amounts are in the currency given; write them the way they appear in the input.",
  "If the account's results are marked mixed, compare campaigns by their own cost per result",
  "and do not add up results of different kinds. If nothing has run yet today, say so in one sentence.",
].join(" ");

function timeLabel(now: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }).format(now);
}

function parseReport(raw: unknown): string | null {
  const report = (raw as { report?: unknown })?.report;
  if (typeof report !== "string") return null;
  const trimmed = report.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** The latest report written today, or null. Cache read only — safe on a render path. */
export async function cachedAdsDailyReport(now = new Date()): Promise<TimedReport | null> {
  return latestReport(DAILY_KIND, manilaDateKey(now), DAILY_PROMPT_VERSION);
}

/** Null when there is nothing to report on: no connected account, or no campaigns today. */
export async function generateAdsDailyReport(now = new Date()): Promise<AiResult<TimedReport> | null> {
  const meta = await readActiveMetaAdsStatus();
  if (!meta.connected) return null;
  const facts = await buildAdsInsightFacts("today");
  if (!facts) return null;

  return hourlyReport(DAILY_KIND, manilaDateKey(now), DAILY_PROMPT_VERSION, facts, (cacheKey) =>
    generate<string>({
      kind: DAILY_KIND,
      cacheKey,
      promptVersion: DAILY_PROMPT_VERSION,
      model: AI_MODELS.reasoning,
      instructions: DAILY_INSTRUCTIONS,
      // The time is for the model only; it is not part of the key.
      input: JSON.stringify({ ...facts, asOf: timeLabel(now) }),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      schemaName: "ads_daily_report",
      schema: DAILY_SCHEMA as unknown as Record<string, unknown>,
      parse: parseReport,
    }),
    now,
  );
}
