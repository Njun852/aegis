import { MAIL_CATEGORIES } from "@/lib/data/mail";
import { clip } from "@/lib/format";
import { PRIORITY_ORDER } from "@/lib/mail";
import type {
  MailCategory,
  MailMessageDocument,
  MailPriority,
  MailTriageResult,
} from "@/types";

/**
 * What the triage model is asked for, and what counts as an acceptable answer.
 *
 * Deliberately separate from `mail-triage.ts` and free of `server-only`: the
 * prompt and the validation are the parts most worth testing directly, and a
 * module that reaches the database cannot be exercised from a script. Nothing
 * here touches the network, the database or the API key.
 *
 * Bump `PROMPT_VERSION` only when the prompt genuinely changes: it re-triages
 * every message in every tenant, and that is the most expensive thing anyone
 * can do to this install.
 */

/** v2 — checklist categories, deadline extraction and commitment guardrails. */
export const PROMPT_VERSION = 2;

/** Messages per request. Large enough to amortise, small enough to stay whole. */
export const BATCH_SIZE = 6;

/** Characters of body text sent per message. */
export const BODY_BUDGET = 700;

/** Output ceiling per message, plus a little slack for the envelope. */
export const TOKENS_PER_MESSAGE = 260;

export const SCHEMA = {
  type: "object",
  properties: {
    messages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          priority: { type: "string", enum: PRIORITY_ORDER },
          category: { type: "string", enum: MAIL_CATEGORIES },
          summary: { type: "string" },
          actionItems: { type: "array", items: { type: "string" } },
          // Empty string rather than null: strict schemas require the field to
          // be present, and an empty string is unambiguous to validate.
          deadline: { type: "string" },
          needsApproval: { type: "boolean" },
          approvalReason: { type: "string" },
          replies: { type: "array", items: { type: "string" } },
        },
        required: [
          "id",
          "priority",
          "category",
          "summary",
          "actionItems",
          "deadline",
          "needsApproval",
          "approvalReason",
          "replies",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["messages"],
  additionalProperties: false,
} as const;

/**
 * The nine things a suggested reply must never assert on the business's behalf,
 * named individually. A general instruction to "be careful" does not reliably
 * stop a model agreeing to a price.
 */
const NEVER_INVENT = [
  "a price or quotation",
  "approval of a discount",
  "confirmation that a payment has been made or received",
  "stock availability",
  "a repair diagnosis",
  "insurance approval or coverage",
  "appointment availability",
  "management approval",
  "acceptance of a contract or of terms",
].join("; ");

export const INSTRUCTIONS = [
  "You triage a vehicle service business's shared inbox. For each message you are given, return the fields below.",

  "category — exactly one of: Customer (an individual customer enquiry, booking or complaint);",
  "Fleet (a business managing several vehicles); Insurance (insurers, claims, assessors);",
  "Supplier (parts, materials, subcontractors); Billing (invoices, payments, statements, chasers);",
  "Employee (internal staff matters); Government (regulators, tax, licensing, compliance notices);",
  "Marketing (promotions, newsletters, advertising platforms); Spam (unsolicited or fraudulent);",
  "Other (anything that genuinely fits none of these).",

  "priority — Urgent only for something with a deadline or money at risk; High for something needing a reply this week;",
  "Normal for routine correspondence; Low for newsletters and automated notices.",

  "summary — one or two sentences stating what the sender wants and any deadline or figure,",
  "written for someone who has not read the message.",

  "actionItems — at most three, each under six words, phrased as a task. Empty array when nothing is needed.",

  "deadline — copy a date or deadline ONLY if the email states one explicitly, in the words the email uses",
  "(for example 'before August 28' or 'by Friday'). If the email states no deadline, return an empty string.",
  "Never infer, calculate or invent a deadline, and never treat a general urgency phrase as a deadline.",

  "needsApproval — true when the message asks the business to commit to something a person must authorise:",
  "accepting a charge, cost or invoice; agreeing a price, discount or contract; confirming payment;",
  "authorising work; or accepting liability. When true, give approvalReason in one short phrase",
  "(for example 'Accepts a 500,000 charge'). When false, approvalReason is an empty string.",

  "replies — at most three suggested reply options, each a short button label under five words",
  "('Ask for extension', 'Request written quote'), not the reply text itself.",

  `A suggested reply must NEVER assert any of the following on the business's behalf: ${NEVER_INVENT}.`,
  "If answering would require information you have not been given, the reply option must ask for clarification",
  "or refer the matter onward — never assert the fact.",
  "When needsApproval is true, every reply option must route the matter to a person:",
  "refer to management, request written terms, or acknowledge without agreeing.",
  "Never offer an option that accepts, confirms or agrees.",

  "Return exactly one entry per message, reusing the id you were given.",
  "Work only from the text provided. Never invent a figure, a date or a name that is not in it.",
].join(" ");

export interface TriageInput {
  id: string;
  from: string;
  subject: string;
  body: string;
}

export function toInput(
  doc: Pick<MailMessageDocument, "messageId" | "from" | "subject" | "body">,
): TriageInput {
  return {
    id: doc.messageId,
    from: doc.from,
    subject: clip(doc.subject, 160),
    body: clip(doc.body.join("\n\n"), BODY_BUDGET),
  };
}

function isPriority(value: unknown): value is MailPriority {
  return (
    typeof value === "string" &&
    (PRIORITY_ORDER as readonly string[]).includes(value)
  );
}

function isCategory(value: unknown): value is MailCategory {
  return (
    typeof value === "string" &&
    (MAIL_CATEGORIES as readonly string[]).includes(value)
  );
}

/**
 * Structured output guarantees the shape, not the sense. This drops anything
 * that would render badly — an id we never sent, an empty summary, a "reply
 * option" that is a paragraph — rather than writing it to the database.
 */
export function parseBatch(
  raw: unknown,
  sent: Set<string>,
): MailTriageResult[] | null {
  const list = (raw as { messages?: unknown })?.messages;
  if (!Array.isArray(list)) return null;

  const results: MailTriageResult[] = [];
  for (const entry of list) {
    const item = entry as Record<string, unknown>;
    if (typeof item.id !== "string" || !sent.has(item.id)) continue;
    if (!isPriority(item.priority)) continue;
    if (!isCategory(item.category)) continue;
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

    // A deadline long enough to be a sentence is the model narrating rather
    // than quoting, so it is discarded rather than shown as a date.
    const deadlineRaw =
      typeof item.deadline === "string" ? item.deadline.trim() : "";
    const deadline =
      deadlineRaw && deadlineRaw.length <= 60 ? deadlineRaw : null;

    const needsApproval = item.needsApproval === true;
    const reasonRaw =
      typeof item.approvalReason === "string" ? item.approvalReason.trim() : "";

    results.push({
      id: item.id,
      priority: item.priority,
      category: item.category,
      summary: item.summary.trim(),
      actionItems: strings(item.actionItems, 3, 48),
      replies: strings(item.replies, 3, 32),
      deadline,
      needsApproval,
      // A flag with no stated reason is worse than no flag; give it wording.
      approvalReason: needsApproval
        ? reasonRaw.slice(0, 120) || "Commits the business — needs approval"
        : "",
    });
  }

  return results.length > 0 ? results : null;
}
