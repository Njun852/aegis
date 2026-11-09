import "server-only";

import { listBookings } from "@/lib/dal/bookings";
import { getActiveBusiness } from "@/lib/dal/businesses";
import { listInventory } from "@/lib/dal/inventory";
import { revenueBetween } from "@/lib/dal/ledger";
import { mailStatsBetween } from "@/lib/dal/mail";
import { listQuotationSummaries } from "@/lib/dal/quotations";
import { manilaDateKey } from "@/lib/booking-slots";
import { isModuleEnabled } from "@/lib/businesses";
import { addDaysToKey } from "@/lib/finance-periods";
import { formatMoney } from "@/lib/format";
import { belowReorder } from "@/lib/inventory";
import { AI_MODELS } from "./client";
import { generate } from "./generate";
import { hourlyReport, latestReport, type TimedReport } from "./hourly-report";
import type { AiResult } from "@/types";

/**
 * The dashboard's daily report: a few sentences on how today is going.
 *
 * Refreshed at most once an hour, and only when the figures have moved since
 * the last one; see `hourly-report.ts`. Like the period insight, the model
 * sees counts and totals only — no names, no email text, no customer records.
 */

// 2: today so far, refreshed hourly, rather than yesterday once a day.
const PROMPT_VERSION = 2;
const MAX_OUTPUT_TOKENS = 260;
const KIND = "dashboard-daily" as const;

const SCHEMA = {
  type: "object",
  properties: {
    report: {
      type: "string",
      description: "Three or four sentences reporting on the day so far.",
    },
  },
  required: ["report"],
  additionalProperties: false,
} as const;

const INSTRUCTIONS = [
  "You write the daily report on a small business's operations dashboard.",
  "You are given today's figures so far, as of the time given, with yesterday and the seven-day average for comparison.",
  "Say how the day is going: money in so far against yesterday and the seven-day average, today's bookings and",
  "how many are still to come, the quotations and mail that came in, and anything that needs attention before close.",
  "The day is not over, so never call a figure final or the day slow simply because it is early.",
  "Three or four sentences, plain and specific. Quote the figures you are reasoning from.",
  "Only mention a section that is in the input. Never invent a number that is not in the input,",
  "and never speculate about causes you cannot see. If the day is quiet so far, say so plainly.",
].join(" ");

/** Today's figures. Sections appear only for modules the person can open. */
export interface DailyFacts {
  day: string;
  currency: "PHP";
  revenue?: { todaySoFar: string; yesterday: string; sevenDayAverage: string };
  bookings?: {
    scheduledToday: number;
    completed: number;
    cancelled: number;
    unconfirmed: number;
    stillToCome: number;
  };
  quotations?: { writtenToday: number; valueWritten: string; awaitingAnswer: number };
  mail?: { receivedToday: number; urgentOrHigh: number; needingApproval: number; stillUnread: number };
  inventory?: { belowReorderPoint: number };
}

/** Midnight at the start of a Manila day. */
function manilaMidnight(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00+08:00`);
}

function dayLabel(dayKey: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${dayKey}T12:00:00+08:00`));
}

function timeLabel(now: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }).format(now);
}

/** Assembles today's figures so far from the tenant's own collections. */
async function buildDailyFacts(now: Date): Promise<{ today: string; facts: DailyFacts } | null> {
  const business = await getActiveBusiness();
  if (!business) return null;

  const today = manilaDateKey(now);
  const yesterday = addDaysToKey(today, -1);
  const midnight = manilaMidnight(today);
  const facts: DailyFacts = { day: dayLabel(today), currency: "PHP" };

  // A role sees only its own modules, and the report says nothing about the rest.
  if (isModuleEnabled(business, "finance")) {
    const [soFar, before, week] = await Promise.all([
      revenueBetween(midnight, now),
      revenueBetween(manilaMidnight(yesterday), midnight),
      revenueBetween(manilaMidnight(addDaysToKey(today, -7)), midnight),
    ]);
    facts.revenue = {
      todaySoFar: formatMoney(soFar, false),
      yesterday: formatMoney(before, false),
      sevenDayAverage: formatMoney(Math.round(week / 7), false),
    };
  }

  if (isModuleEnabled(business, "bookings")) {
    const todays = (await listBookings()).filter((booking) => booking.dateKey === today);
    facts.bookings = {
      scheduledToday: todays.length,
      completed: todays.filter((booking) => booking.status === "Completed").length,
      cancelled: todays.filter((booking) => booking.status === "Cancelled").length,
      unconfirmed: todays.filter((booking) => booking.status === "Pending").length,
      stillToCome: todays.filter(
        (booking) =>
          (booking.status === "Pending" || booking.status === "Confirmed") && new Date(booking.startsAt) > now,
      ).length,
    };
  }

  if (isModuleEnabled(business, "quotes")) {
    const quotes = await listQuotationSummaries();
    const written = quotes.filter((quote) => quote.quoteDate === today);
    facts.quotations = {
      writtenToday: written.length,
      valueWritten: formatMoney(written.reduce((sum, quote) => sum + quote.totalCents, 0), false),
      awaitingAnswer: quotes.filter((quote) => quote.status === "Sent").length,
    };
  }

  if (isModuleEnabled(business, "mail")) {
    const mail = await mailStatsBetween(midnight, now);
    facts.mail = {
      receivedToday: mail.length,
      urgentOrHigh: mail.filter((entry) => entry.priority === "Urgent" || entry.priority === "High").length,
      needingApproval: mail.filter((entry) => entry.needsApproval).length,
      stillUnread: mail.filter((entry) => entry.unread).length,
    };
  }

  if (isModuleEnabled(business, "inventory")) {
    facts.inventory = { belowReorderPoint: belowReorder(await listInventory()).length };
  }

  return { today, facts };
}

function parseReport(raw: unknown): string | null {
  const report = (raw as { report?: unknown })?.report;
  if (typeof report !== "string") return null;
  const trimmed = report.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** The latest report written today, or null. Reads the cache only, so it is safe while rendering. */
export async function cachedDailyReport(now = new Date()): Promise<TimedReport | null> {
  return latestReport(KIND, manilaDateKey(now), PROMPT_VERSION);
}

/** Today's report: the stored one, or a fresh one when it is over an hour old and the figures moved. */
export async function generateDailyReport(now = new Date()): Promise<AiResult<TimedReport>> {
  const built = await buildDailyFacts(now);
  if (!built) return { ok: false, reason: "error" };

  return hourlyReport(KIND, built.today, PROMPT_VERSION, built.facts, (cacheKey) =>
    generate<string>({
      kind: KIND,
      cacheKey,
      promptVersion: PROMPT_VERSION,
      model: AI_MODELS.reasoning,
      instructions: INSTRUCTIONS,
      // The time is for the model only; it is not part of the key, so the
      // report is not rewritten just because the clock moved.
      input: JSON.stringify({ ...built.facts, asOf: timeLabel(now) }),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      schemaName: "dashboard_daily_report",
      schema: SCHEMA as unknown as Record<string, unknown>,
      parse: parseReport,
    }),
    now,
  );
}
