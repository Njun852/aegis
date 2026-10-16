import { manilaDateKey } from "@/lib/booking-slots";
import { addDays } from "@/lib/quotations";

/**
 * Ask AEGIS, the pure parts: the tools the model may ask for, the periods it
 * may name, and turning record refs in an answer into links. Shared by the
 * server and the chat bubble.
 */

export const ASK_TOOLS = [
  "bookings",
  "quotations",
  "job_orders",
  "ads",
  "money",
  "inventory",
  "customers",
  "service_due",
  "mail",
  "app_help",
] as const;
export type AskTool = (typeof ASK_TOOLS)[number];

export const ASK_PERIODS = [
  "today",
  "tomorrow",
  "this_week",
  "next_7_days",
  "last_7_days",
  "last_30_days",
  "this_month",
  "last_month",
  "all",
] as const;
export type AskPeriod = (typeof ASK_PERIODS)[number];

/**
 * What Ask AEGIS may propose doing. Every kind but `open` waits for the person
 * to press Confirm, and then runs through the same server action the screen's
 * own button uses, so the same permissions and rules apply.
 */
export const ASK_ACTION_KINDS = [
  "open",
  "booking_status",
  "draft_quotation",
  "quote_mark_given",
  "quote_answer",
  "approve_pricing",
  "make_job_order",
  "job_status",
] as const;
export type AskActionKind = (typeof ASK_ACTION_KINDS)[number];

/** Screens `open` may go to by name, when there is no record ref. */
export const ASK_SCREENS = {
  dashboard: "/dashboard",
  report: "/dashboard/report",
  bookings: "/bookings",
  messenger: "/bookings/messenger",
  quotations: "/quotations",
  job_orders: "/quotations?tab=jobs",
  price_list: "/quotations?tab=prices",
  ads: "/ads",
  inventory: "/inventory",
  suppliers: "/suppliers",
  crm: "/crm",
  fleet: "/fleet",
  mail: "/mail",
  text_blast: "/text-blast",
  status: "/status",
} as const;
export type AskScreen = keyof typeof ASK_SCREENS;

/** One line of a quotation drafted from a sentence. A price of 0 means not priced yet. */
export interface AskDraftLine {
  section: "parts" | "labor";
  description: string;
  qty: number;
  unitPriceCents: number | null;
}

/**
 * A proposed action, as the server checked it against the real record. The
 * title and details are written from the record, not from the model's words,
 * so the card says what will actually happen.
 */
export interface AskProposal {
  id: string;
  kind: AskActionKind;
  title: string;
  details: string[];
  /** Where it happens: the bubble goes there before running it. */
  href: string | null;
  /** Why it cannot be done, when it cannot. The card then offers no Confirm. */
  blocked: string | null;
  params: {
    ref?: string;
    status?: string;
    outcome?: "Approved" | "Declined";
    customerName?: string;
    how?: string;
    /** The pricing the approver is shown, so a change in between refuses the approval. */
    pricingKey?: string;
    draft?: {
      bookingRef: string | null;
      customerName: string;
      lines: AskDraftLine[];
    };
  };
}

export const MAX_QUESTION_CHARS = 500;
/** Earlier turns sent with a question, so "and last month?" makes sense. */
export const MAX_HISTORY_TURNS = 4;
export const MAX_HISTORY_CHARS = 600;
export const MAX_TOOL_CALLS = 4;

export interface AskTurn {
  role: "user" | "assistant";
  text: string;
}

/** One read the model asked for, after checking. */
export interface AskCall {
  tool: AskTool;
  period: AskPeriod;
  /** A status to narrow to, as the screens spell it, or "any". */
  status: string;
  /** A name, plate, phone or part to look for. Empty for none. */
  search: string;
  lowStockOnly: boolean;
}

/** The model's plan, checked: tools this business has only, at most four, duplicates dropped. */
export function parsePlan(raw: unknown, tools: readonly AskTool[]): AskCall[] | null {
  const calls = (raw as { calls?: unknown })?.calls;
  if (!Array.isArray(calls)) return null;
  const seen = new Set<string>();
  const plan: AskCall[] = [];
  for (const entry of calls) {
    const call = (entry ?? {}) as Record<string, unknown>;
    const tool = tools.find((name) => name === call.tool);
    if (!tool) continue;
    const period = (ASK_PERIODS as readonly string[]).includes(String(call.period)) ? (call.period as AskPeriod) : "all";
    const parsed: AskCall = {
      tool,
      period,
      status: typeof call.status === "string" ? call.status.trim().slice(0, 30) : "",
      search: typeof call.search === "string" ? call.search.trim().slice(0, 60) : "",
      lowStockOnly: call.low_stock_only === true,
    };
    const key = JSON.stringify(parsed);
    if (seen.has(key)) continue;
    seen.add(key);
    plan.push(parsed);
    if (plan.length === MAX_TOOL_CALLS) break;
  }
  return plan;
}

/**
 * A period as Manila calendar days: `from` inclusive, `to` exclusive, null for
 * open-ended. Weeks start on Monday, as the shop's week does.
 */
export function periodRange(period: AskPeriod, now: Date): { from: Date | null; to: Date | null; label: string } {
  const today = manilaDateKey(now);
  const at = (key: string) => new Date(`${key}T00:00:00+08:00`);
  const [year, month, day] = today.split("-").map(Number);
  // Monday 0 … Sunday 6, read from the calendar day itself: Manila midnight
  // is still the day before in UTC.
  const weekday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
  const monthKey = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}-01`;
  const span = (fromKey: string, toKey: string, label: string) => ({ from: at(fromKey), to: at(toKey), label });

  switch (period) {
    case "today":
      return span(today, addDays(today, 1), `today, ${today}`);
    case "tomorrow":
      return span(addDays(today, 1), addDays(today, 2), `tomorrow, ${addDays(today, 1)}`);
    case "this_week":
      return span(addDays(today, -weekday), addDays(today, 7 - weekday), `this week from ${addDays(today, -weekday)}`);
    case "next_7_days":
      return span(today, addDays(today, 7), `${today} to ${addDays(today, 6)}`);
    case "last_7_days":
      return span(addDays(today, -6), addDays(today, 1), `${addDays(today, -6)} to ${today}`);
    case "last_30_days":
      return span(addDays(today, -29), addDays(today, 1), `${addDays(today, -29)} to ${today}`);
    case "this_month":
      return span(monthKey(year, month), month === 12 ? monthKey(year + 1, 1) : monthKey(year, month + 1), `this month, ${today.slice(0, 7)}`);
    case "last_month": {
      const [py, pm] = month === 1 ? [year - 1, 12] : [year, month - 1];
      return span(monthKey(py, pm), monthKey(year, month), `last month, ${monthKey(py, pm).slice(0, 7)}`);
    }
    default:
      return { from: null, to: null, label: "all time" };
  }
}

/** Where a record ref in an answer links to. Unknown prefixes stay plain text. */
export function refHref(ref: string): string | null {
  const prefix = ref.split("-")[0];
  const encoded = encodeURIComponent(ref);
  switch (prefix) {
    case "QT":
      return `/quotations/${encoded}`;
    case "JO":
      return `/quotations/jobs/${encoded}`;
    case "BK":
      return `/bookings?booking=${encoded}`;
    case "CU":
      return `/crm?customer=${encoded}`;
    case "PO":
      return `/suppliers/orders/${encoded}`;
    case "GR":
      return `/suppliers/receipts/${encoded}`;
    case "SP":
      return `/suppliers?supplier=${encoded}`;
    default:
      return null;
  }
}

export const REF_PATTERN = /\b(?:QT|JO|BK|CU|PO|GR|SP)-\d{3,6}\b/g;

/** An answer split into text and linkable refs, for the bubble to render. */
export function splitRefs(text: string): { text: string; href: string | null }[] {
  const parts: { text: string; href: string | null }[] = [];
  let last = 0;
  for (const match of text.matchAll(REF_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ text: text.slice(last, index), href: null });
    parts.push({ text: match[0], href: refHref(match[0]) });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), href: null });
  return parts;
}

/** The questions offered on an empty chat, chosen from what the business has. */
export function suggestedQuestions(modules: string[]): string[] {
  const has = (key: string) => modules.includes(key);
  return [
    has("bookings") ? "What bookings do we have this week?" : "",
    has("quotes") ? "Which quotations are waiting for an answer?" : "",
    "How much revenue did we make this month?",
    has("inventory") ? "What stock is running low?" : "",
    has("bookings") ? "What is our cost per booking from ads?" : "",
    has("fleet") ? "Which cars are due for service?" : "",
  ]
    .filter(Boolean)
    .slice(0, 4);
}
