import "server-only";

import { manilaDateKey } from "@/lib/booking-slots";
import {
  ASK_PERIODS,
  MAX_HISTORY_CHARS,
  MAX_HISTORY_TURNS,
  MAX_TOOL_CALLS,
  parsePlan,
  type AskActionKind,
  type AskProposal,
  type AskTool,
  type AskTurn,
} from "@/lib/ask";
import { actionsFor, buildProposals, type RawAskAction } from "@/lib/dal/ask-actions";
import { runAskTool, toolsFor } from "@/lib/dal/ask-data";
import { AI_MODELS } from "./client";
import { cacheKeyFor, generate } from "./generate";
import type { AiFailure, Business } from "@/types";

/**
 * Ask AEGIS: a question in plain words, answered from the business's own
 * records. Two calls through `generate`, so the cache, the monthly budget and
 * the usage log apply as everywhere else:
 *
 * 1. **Plan** (fast model): which read-only tools to run, and with what
 *    period, status or search. The model sees the question and the tool list,
 *    no records.
 * 2. **Answer**: the question and what the tools returned, and nothing else
 *    to answer from. Figures arrive already formatted, so the model copies
 *    them rather than doing arithmetic.
 *
 * The same question over the same records is served from the cache, both
 * steps. Nothing here can write: the tools are reads, and the answer is text.
 */

const PLAN_VERSION = 2;
const ANSWER_VERSION = 2;
/** Kept well under the model's context: the answer step is billed on it. */
const MAX_DATA_CHARS = 14_000;

/** Questions per business per day, whatever the cache saves. */
export const ASK_PER_DAY = Number(process.env.OPENAI_ASK_PER_DAY) || 60;
/** Ask AEGIS stops at this share of the monthly budget, keeping the rest for mail triage. */
export const ASK_BUDGET_SHARE = 0.75;

const TOOL_GUIDE: Record<AskTool, string> = {
  bookings: "appointments by appointment date: counts by status, booked value, and the list (period, status)",
  quotations: "quotations by quote date: counts by status (Draft, Sent, Approved, Partially Approved, Declined, Expired) and the list (period, status)",
  job_orders: "job orders from approved quotations: Open, In progress, Completed, Cancelled (status)",
  ads: "Meta ads against bookings: spend, conversations, confirmed bookings, cost per booking, per campaign (period)",
  money: "revenue, purchases, revenue minus purchases and quoted totals for this month, last month, this quarter",
  inventory: "stock items: on hand, reorder point, average cost, supplier (search, low_stock_only)",
  customers: "one customer or car: their cars, bookings, booked value, last visit, service history (search: name, company, phone or plate)",
  service_due: "customer cars overdue or due for service soon",
  mail: "unread mail, pressing unread messages, messages needing action",
  app_help: "where things are in AEGIS and its rules, for how-to questions",
};

const ACTION_GUIDE: Record<AskActionKind, string> = {
  open: "go to a record (ref) or a screen (screen: one of the screen names). No confirmation needed; use it when they ask to see or open something",
  booking_status: "move a booking (ref BK-…) to status Pending, Confirmed, In progress, Completed or Cancelled",
  draft_quotation: "save a new Draft quotation: customer (name) or ref of a booking BK-…, and lines with section parts or labor, description, qty, unit_price in pesos (0 if they gave no price). Never invent prices",
  quote_mark_given: "record that quotation QT-… reached the customer outside AEGIS email (how: Printed and handed over, Shown on screen, Sent by Messenger or text, Read out by phone)",
  quote_answer: "record that the customer approved or declined quotation QT-… in full (outcome Approved or Declined; customer: who answered, if said)",
  approve_pricing: "approve the discount or below-cost pricing on quotation QT-…",
  make_job_order: "make the job order from approved quotation QT-…",
  job_status: "move job order JO-… to status Open, In progress, Completed or Cancelled",
};

function answerSchema(kinds: AskActionKind[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["answer", "actions"],
    properties: {
      answer: { type: "string" },
      actions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "ref", "screen", "status", "outcome", "customer", "how", "lines"],
          properties: {
            kind: { type: "string", enum: kinds },
            ref: { type: "string" },
            screen: { type: "string" },
            status: { type: "string" },
            outcome: { type: "string" },
            customer: { type: "string" },
            how: { type: "string" },
            lines: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["section", "description", "qty", "unit_price"],
                properties: {
                  section: { type: "string", enum: ["parts", "labor"] },
                  description: { type: "string" },
                  qty: { type: "number" },
                  unit_price: { type: "number" },
                },
              },
            },
          },
        },
      },
    },
  };
}

function clipHistory(history: AskTurn[]): AskTurn[] {
  return history
    .filter((turn) => (turn.role === "user" || turn.role === "assistant") && typeof turn.text === "string")
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => ({ role: turn.role, text: turn.text.slice(0, MAX_HISTORY_CHARS) }));
}

function planSchema(tools: AskTool[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["calls"],
    properties: {
      calls: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["tool", "period", "status", "search", "low_stock_only"],
          properties: {
            tool: { type: "string", enum: tools },
            period: { type: "string", enum: [...ASK_PERIODS] },
            status: { type: "string" },
            search: { type: "string" },
            low_stock_only: { type: "boolean" },
          },
        },
      },
    },
  };
}

export type AskOutcome =
  | { ok: true; answer: string; proposals: AskProposal[]; tools: AskTool[]; billed: boolean }
  | { ok: false; reason: AiFailure };

export async function askAegis(
  business: Business,
  question: string,
  rawHistory: AskTurn[],
  options: { isAdmin: boolean },
  now = new Date(),
): Promise<AskOutcome> {
  const tools = toolsFor(business);
  const kinds = actionsFor(business, options.isAdmin);
  const history = clipHistory(rawHistory);
  const today = manilaDateKey(now);
  const weekday = new Date(`${today}T12:00:00+08:00`).toLocaleDateString("en-US", { weekday: "long", timeZone: "Asia/Manila" });

  const planInput = JSON.stringify({ today: `${weekday} ${today}`, business: business.name, history, question });
  const plan = await generate({
    kind: "ask-plan",
    cacheKey: cacheKeyFor({ planInput, tools }),
    promptVersion: PLAN_VERSION,
    model: AI_MODELS.fast,
    instructions: [
      `You choose which read-only tools AEGIS should run to answer a question from staff at ${business.name}, an auto service shop in Davao. You never answer the question yourself.`,
      "Tools:",
      ...tools.map((tool) => `- ${tool}: ${TOOL_GUIDE[tool]}`),
      `Choose the fewest calls needed, at most ${MAX_TOOL_CALLS}. Use period "all" when none is implied; status "any" unless one is asked for; search "" unless a name, plate, phone or part is given; low_stock_only false unless low stock is asked about.`,
      "Use the history to resolve follow-ups such as \"and last month?\". For greetings or questions that need no records, return no calls, or app_help for how-to questions.",
      "When they ask for something to be done (confirm or cancel a booking, draft a quotation, record an approval, make or move a job order, open a record), read the records needed to identify it: the booking, the quotation or the job order it is about.",
    ].join("\n"),
    input: planInput,
    maxOutputTokens: 300,
    schemaName: "ask_plan",
    schema: planSchema(tools),
    parse: (raw) => parsePlan(raw, tools),
  });
  if (!plan.ok) return { ok: false, reason: plan.reason };

  const results: Record<string, unknown> = {};
  for (const [index, call] of plan.data.entries()) {
    results[`${index + 1}. ${call.tool}${call.period !== "all" ? ` ${call.period}` : ""}${call.status && call.status !== "any" ? ` ${call.status}` : ""}${call.search ? ` "${call.search}"` : ""}`] =
      await runAskTool(business, call, now);
  }
  let data = JSON.stringify(results);
  if (data.length > MAX_DATA_CHARS) data = `${data.slice(0, MAX_DATA_CHARS)} …(cut short)`;

  const answer = await generate({
    kind: "ask-answer",
    cacheKey: cacheKeyFor({ today, question, history, data, kinds }),
    promptVersion: ANSWER_VERSION,
    model: AI_MODELS.reasoning,
    instructions: [
      `You are Ask AEGIS, the assistant inside AEGIS for ${business.name}. Today is ${weekday} ${today} in Manila.`,
      "Answer only from DATA. Copy figures, names, dates and refs exactly as DATA gives them; never calculate new totals, estimate or invent anything.",
      "If DATA does not hold the answer, say so plainly and name the AEGIS screen where a person can check.",
      "Mention record refs such as QT-1004, BK-8251 or JO-1001 as they appear; they become links.",
      "Be brief: one to four sentences, or up to eight short lines starting with \"- \". Plain text only: no headings, tables, bold or code.",
      "",
      "ACTIONS. You may propose actions, but only ones the person asked for, and nothing happens until they press Confirm on each. Kinds you may use:",
      ...kinds.map((kind) => `- ${kind}: ${ACTION_GUIDE[kind]}`),
      "Use refs exactly as they appear in DATA; never guess one. If more than one record could be meant, ask which instead of proposing.",
      "When you propose, say in one short sentence what you have prepared and that they confirm it below. Never claim it is done.",
      "Sending emails, partial approvals, changing prices on a quotation and anything not listed above are done on the screen: say so and propose open for that record.",
      "Fill unused action fields with \"\" (or [] for lines). Propose no actions for a plain question.",
    ].join("\n"),
    input: JSON.stringify({ history, question, DATA: data }),
    maxOutputTokens: 1_000,
    schemaName: "ask_answer",
    schema: answerSchema(kinds),
    parse: (raw) => {
      const value = raw as { answer?: unknown; actions?: unknown };
      if (typeof value?.answer !== "string" || !value.answer.trim()) return null;
      return {
        answer: value.answer.trim().slice(0, 2_000),
        actions: Array.isArray(value.actions) ? (value.actions as RawAskAction[]) : [],
      };
    },
  });
  if (!answer.ok) return { ok: false, reason: answer.reason };

  return {
    ok: true,
    answer: answer.data.answer,
    // Checked against the records as they are now, even when the answer came from the cache.
    proposals: await buildProposals(business, options.isAdmin, answer.data.actions),
    tools: plan.data.map((call) => call.tool),
    billed: !plan.cached || !answer.cached,
  };
}
