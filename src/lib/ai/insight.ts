import "server-only";

import { listBookings } from "@/lib/dal/bookings";
import { getActiveBusiness } from "@/lib/dal/businesses";
import { listInventory } from "@/lib/dal/inventory";
import { revenueByMonth } from "@/lib/dal/ledger";
import { readCachedOutput } from "@/lib/dal/ai";
import { buildLedgerRevenue, revenueWindow } from "@/lib/dashboard";
import { belowReorder, totalValueCents } from "@/lib/inventory";
import { formatMoney } from "@/lib/format";
import { AI_MODELS } from "./client";
import { cacheKeyFor, generate } from "./generate";
import type { AiResult, DateRange } from "@/types";

/**
 * The dashboard's "AI Insights" card.
 *
 * This is the cheapest surface in the app to run, by design: the model is sent
 * a few dozen tokens of figures — no names, no email, no customer records — and
 * the answer is cached against a hash of those figures. A business that views
 * its dashboard fifty times a day pays for one generation, and only when the
 * numbers themselves have moved.
 */

const PROMPT_VERSION = 1;
const MAX_OUTPUT_TOKENS = 220;

const KIND = "dashboard-insight" as const;

const SCHEMA = {
  type: "object",
  properties: {
    insight: {
      type: "string",
      description:
        "Two or three sentences of commentary on the figures provided.",
    },
  },
  required: ["insight"],
  additionalProperties: false,
} as const;

const INSTRUCTIONS = [
  "You write the commentary line on a small-business operations dashboard.",
  "You are given figures for one reporting period. Say what actually stands out in them:",
  "the direction of revenue, anything at risk, and at most one concrete suggestion.",
  "Two or three sentences, plain and specific. Quote the figures you are reasoning from.",
  "Never invent a number that is not in the input, and never speculate about causes you cannot see.",
  "If the figures are unremarkable, say so plainly rather than manufacturing drama.",
].join(" ");

/**
 * The numbers the model reasons over. Deliberately narrow: figures only, so
 * nothing identifying leaves the tenant and the input stays a few dozen tokens.
 * This object is also the cache key, so anything added here that changes often
 * makes the cache miss more.
 */
export interface InsightFacts {
  range: DateRange;
  currency: "USD";
  revenue: { total: string; changeVsPrevious: string };
  revenueByMonth: { month: string; total: number }[];
  bookings?: {
    total: number;
    pending: number;
    confirmed: number;
    cancelled: number;
  };
  inventory?: { trackedSkus: number; belowReorder: number; stockValue: string };
}

/**
 * Assembles the figures server-side from the tenant's own collections. The
 * client never supplies any of this — a client-supplied fact sheet would be a
 * way to put arbitrary text into a prompt we pay for.
 */
export async function buildInsightFacts(
  range: DateRange,
): Promise<InsightFacts | null> {
  const business = await getActiveBusiness();
  if (!business) return null;

  const today = new Date();
  const { from, to } = revenueWindow(today);
  const revenue = buildLedgerRevenue(await revenueByMonth(from, to), today);
  const figures = revenue[range];

  const facts: InsightFacts = {
    range,
    currency: "USD",
    revenue: { total: figures.total, changeVsPrevious: figures.delta },
    revenueByMonth: figures.months.map((month) => ({
      month: month.label,
      total: month.value,
    })),
  };

  // Only include a module's figures when the business actually has it, so the
  // commentary never references a screen they cannot open.
  if (business.modules.includes("bookings")) {
    const bookings = await listBookings();
    facts.bookings = {
      total: bookings.length,
      pending: bookings.filter((booking) => booking.status === "Pending").length,
      confirmed: bookings.filter((booking) => booking.status === "Confirmed")
        .length,
      cancelled: bookings.filter((booking) => booking.status === "Cancelled")
        .length,
    };
  }

  if (business.modules.includes("inventory")) {
    const items = await listInventory();
    facts.inventory = {
      trackedSkus: items.length,
      belowReorder: belowReorder(items).length,
      stockValue: formatMoney(totalValueCents(items), false),
    };
  }

  return facts;
}

function parseInsight(raw: unknown): string | null {
  const insight = (raw as { insight?: unknown })?.insight;
  if (typeof insight !== "string") return null;
  const trimmed = insight.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * A previously generated insight for the current figures, or `null`. Reads the
 * cache and nothing else — safe to call from a render path, because it can
 * never start a billable request.
 */
export async function cachedInsight(range: DateRange): Promise<string | null> {
  const facts = await buildInsightFacts(range);
  if (!facts) return null;
  return readCachedOutput<string>(KIND, cacheKeyFor(facts), PROMPT_VERSION);
}

/** Generates the insight for a range, or returns why it could not. */
export async function generateInsight(
  range: DateRange,
): Promise<AiResult<string>> {
  const facts = await buildInsightFacts(range);
  if (!facts) return { ok: false, reason: "error" };

  return generate<string>({
    kind: KIND,
    cacheKey: cacheKeyFor(facts),
    promptVersion: PROMPT_VERSION,
    model: AI_MODELS.reasoning,
    instructions: INSTRUCTIONS,
    input: JSON.stringify(facts),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    schemaName: "dashboard_insight",
    schema: SCHEMA as unknown as Record<string, unknown>,
    parse: parseInsight,
  });
}
