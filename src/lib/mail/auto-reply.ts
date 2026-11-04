import type {
  MailAutoReplyConfig,
  MailCategory,
  MailPriority,
  MailSignals,
} from "@/types";

/**
 * Automatic replies: which incoming mail may be answered without a person.
 *
 * The rule is deliberately narrow and built only from what AEGIS already has —
 * the stored triage and the stored Suggested Reply. It asks the model nothing
 * new, so switching it on costs no tokens: a reply that goes out automatically
 * is the same draft a person would have seen in the reply box.
 *
 * Everything here is pure and free of `server-only`, so the rule can be tested
 * from a script and quoted by the admin screen without either reaching the
 * database or the mailbox. The daily limit and the once-per-thread guarantee
 * need the database and live in `src/lib/dal/mail-auto-reply.ts`.
 *
 * The bias is one way on purpose. A routine message held back costs a person a
 * minute; a complaint or a price answered by a machine costs a customer. Every
 * test below is a reason to hold, and anything the rule cannot vouch for is
 * held.
 */

export const DEFAULT_AUTO_REPLY: MailAutoReplyConfig = {
  enabled: false,
  dailyLimit: 10,
  enabledAt: null,
};

export const MAX_AUTO_REPLY_DAILY_LIMIT = 50;

/** People writing to the business. Suppliers, insurers and billing involve money or terms. */
export const AUTO_REPLY_CATEGORIES: MailCategory[] = ["Customer", "Fleet"];

/** Triage keeps Urgent and High for deadlines, money and this week's work. */
export const AUTO_REPLY_PRIORITIES: MailPriority[] = ["Normal", "Low"];

/** A quick answer asks for at most one thing. */
export const AUTO_REPLY_MAX_ACTIONS = 1;

/** A reply this long is not a quick acknowledgement. */
export const AUTO_REPLY_MAX_CHARS = 1_200;

/** An automatic reply is only useful while it is quick; older mail waits for a person. */
export const AUTO_REPLY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** One automatic reply per sender in this window, whatever the thread. */
export const AUTO_REPLY_SENDER_GAP_MS = 24 * 60 * 60 * 1000;

/** What the admin switch says it will do, in the order the rule checks. */
export const AUTO_REPLY_RULES: string[] = [
  "Only customer and fleet mail that the AI rated Normal or Low priority.",
  "Only when the AI analysis succeeded, nothing needs management approval, no deadline is stated and at most one thing is asked.",
  "Never when the email or the reply mentions money, prices, quotes, payments, complaints, refunds, insurance, damage, bookings or anything legal.",
  "Only the stored Suggested Reply, and only when it is complete: a draft with a [gap] for a person to fill is never sent.",
  "Never to no-reply or automated senders, mailing lists, other auto-replies, or this business's own mailbox.",
  "Once per conversation, once per sender a day, only for mail that arrived after the switch was turned on and within the last day, and never more than the daily limit.",
];

export function autoReplyConfigOf(
  stored: Partial<MailAutoReplyConfig> | undefined,
): MailAutoReplyConfig {
  return {
    enabled: stored?.enabled ?? DEFAULT_AUTO_REPLY.enabled,
    dailyLimit: stored?.dailyLimit ?? DEFAULT_AUTO_REPLY.dailyLimit,
    enabledAt: stored?.enabledAt ?? DEFAULT_AUTO_REPLY.enabledAt,
  };
}

// ---- Headers -------------------------------------------------------------------

/** One header value as mailparser hands it over: a string, a structure, or nothing. */
function headerText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(headerText).filter(Boolean).join(", ");
  if (typeof value === "object") {
    const shaped = value as { text?: unknown; value?: unknown };
    if (typeof shaped.text === "string") return shaped.text.trim();
    if (typeof shaped.value === "string") return shaped.value.trim();
    return "";
  }
  return String(value).trim();
}

function idList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const list = Array.isArray(value) ? value : value.split(/\s+/);
  return list.map((entry) => entry.trim()).filter(Boolean);
}

/**
 * The few headers that say whether a machine sent this and which conversation
 * it belongs to, read once at retrieval. Stored rather than the whole header
 * block: they are all the rule needs, and the rest is correspondence metadata
 * AEGIS has no reason to keep.
 */
export function readMailSignals(
  headers: Map<string, unknown>,
  ids: { messageId: string; inReplyTo?: string; references?: string | string[] },
): MailSignals {
  const references = idList(ids.references);
  const inReplyTo = idList(ids.inReplyTo)[0] ?? null;
  const returnPath = headerText(headers.get("return-path"));

  return {
    autoSubmitted: headerText(headers.get("auto-submitted")),
    precedence: headerText(headers.get("precedence")),
    // mailparser folds every List-* header into one `list` entry; the raw names
    // are kept for any parser that does not.
    mailingList: ["list", "list-id", "list-unsubscribe", "list-post", "mailing-list"].some((name) =>
      headers.has(name),
    ),
    autoResponseSuppress: headerText(headers.get("x-auto-response-suppress")),
    autoReplyHeader: ["x-autoreply", "x-autorespond", "x-auto-reply-from", "x-autoresponder"].some(
      (name) => headers.has(name),
    ),
    returnPathEmpty: returnPath !== null && /^<?\s*>?$/.test(returnPath),
    // The conversation is named by its first message: every reply carries that
    // id at the head of References, or in In-Reply-To when it is the first reply.
    threadId: references[0] ?? inReplyTo ?? ids.messageId,
    references: [...references, ...(inReplyTo && !references.includes(inReplyTo) ? [inReplyTo] : [])].slice(-10),
  };
}

/** Why the headers say no person is waiting for an answer, or null. */
export function automatedReason(signals: MailSignals): string | null {
  const submitted = signals.autoSubmitted?.toLowerCase();
  if (submitted && submitted !== "no") return "Sent automatically (Auto-Submitted header)";
  const precedence = signals.precedence?.toLowerCase();
  if (precedence && /bulk|list|junk|auto[_-]?reply/.test(precedence)) {
    return `Bulk or automated mail (Precedence: ${precedence})`;
  }
  if (signals.mailingList) return "Mailing list or newsletter";
  if (signals.autoReplyHeader) return "An auto-reply from another system";
  if (signals.autoResponseSuppress && /all|oof|autoreply/i.test(signals.autoResponseSuppress)) {
    return "The sender asked not to receive auto-replies";
  }
  if (signals.returnPathEmpty) return "A bounce or delivery notice";
  return null;
}

const NO_REPLY_ANYWHERE = /no[-_.]?reply|do[-_.]?not[-_.]?reply|mailer[-_.]?daemon|bounce/;
const NO_REPLY_ROLES =
  /^(postmaster|notifications?|notify|alerts?|automated|auto[-_.]?reply|daemon|newsletters?|news|marketing|mailer|system|root|billing|invoices?|receipts?|accounts?[-_.]?payable)([-_.+].*)?$/;

/** Addresses that are not a person, by the conventions senders use to say so. */
export function isNoReplyAddress(email: string): boolean {
  const local = email.trim().toLowerCase().split("@")[0] ?? "";
  return !local || NO_REPLY_ANYWHERE.test(local) || NO_REPLY_ROLES.test(local);
}

// ---- Content -------------------------------------------------------------------

/**
 * Subjects a machine must never answer, whatever the triage said. A keyword
 * screen is crude, and that is the point: it does not depend on the model
 * having rated the message correctly. A few Filipino words are included because
 * the customers write in them.
 */
const SENSITIVE =
  /\b(complain\w*|unhappy|disappointed|dissatisfied|angry|terrible|worst|refund\w*|reimburs\w*|money|price[sd]?|pricing|quot(e|es|ed|ation|ations)|estimate[sd]?|costs?|invoices?|bill(s|ing)?|payments?|pay|paid|charge[sd]?|fees?|discounts?|deposit|balance|warrant(y|ies)|guarantee|insur\w*|claims?|damage[sd]?|broken|accident|injur\w*|lawyer|attorney|legal|court|sue|cancel\w*|urgent|asap|emergency|contract|agreement|approv\w*|book(ing|ings|ed)?|appointments?|reschedul\w*|availab\w*|stock|how much|magkano|presyo|bayad|reklamo|sira|utang)\b|[₱$€£]\s?\d|\b(php|usd)\s?\d/i;

/** The first sensitive word in the text, for the reason shown to a person. */
export function sensitiveWord(text: string): string | null {
  const match = SENSITIVE.exec(text);
  return match ? match[0] : null;
}

/** `[confirm price]` and the like: the drafter's mark for a fact it was not given. */
const PLACEHOLDER = /\[[^\]\n]{1,80}\]/;

// ---- The rule ------------------------------------------------------------------

export interface AutoReplyCandidate {
  email: string;
  subject: string;
  body: string[];
  category: MailCategory;
  priority: MailPriority;
  aiSummary: string;
  actionItems: string[];
  deadline: string | null;
  needsApproval: boolean;
  /** Triage at the current prompt version produced this analysis. */
  triaged: boolean;
  suggestedReply: string | null;
  /** The draft was written by the current reply prompt. */
  draftCurrent: boolean;
  /** Null for mail retrieved before the headers were recorded. */
  signals: MailSignals | null;
  /** This message, or another in its conversation, already has a reply. */
  answered: boolean;
  receivedAt: Date;
}

export interface AutoReplyContext {
  /** The business's own mailbox, never answered. */
  mailbox: string;
  /** When automatic replies were switched on; nothing older is answered. */
  enabledAt: Date;
  now: Date;
}

export type AutoReplyVerdict = { send: true } | { send: false; reason: string };

const hold = (reason: string): AutoReplyVerdict => ({ send: false, reason });

/**
 * Whether one message may be answered automatically, and if not, why.
 *
 * The order is cheapest and most certain first, and the first reason to hold
 * wins: that reason is what the mail screen shows beside the message.
 */
export function autoReplyVerdict(
  message: AutoReplyCandidate,
  context: AutoReplyContext,
): AutoReplyVerdict {
  // Unsure triage: never analysed, or analysed into nothing usable. A batch the
  // model failed on is marked attempted with an empty summary and the default
  // "Other" category, so both are treated as the model not knowing.
  if (!message.triaged || !message.aiSummary.trim()) {
    return hold("The AI analysis did not succeed, so it is not sure what this needs");
  }
  if (!message.signals) return hold("Arrived before automatic replies could check its headers");
  if (message.answered) return hold("Already answered in this conversation");

  const email = message.email.trim().toLowerCase();
  if (!email || !email.includes("@")) return hold("No reply address");
  if (email === context.mailbox.trim().toLowerCase()) return hold("Sent from this business's own mailbox");
  if (isNoReplyAddress(email)) return hold("A no-reply or automated address");
  const automated = automatedReason(message.signals);
  if (automated) return hold(automated);

  if (message.receivedAt < context.enabledAt) return hold("Arrived before automatic replies were switched on");
  if (context.now.getTime() - message.receivedAt.getTime() > AUTO_REPLY_MAX_AGE_MS) {
    return hold("Older than a day, so a person should answer it");
  }

  if (!AUTO_REPLY_CATEGORIES.includes(message.category)) {
    return hold(`${message.category} mail is always left for a person`);
  }
  if (!AUTO_REPLY_PRIORITIES.includes(message.priority)) {
    return hold(`Rated ${message.priority} priority`);
  }
  if (message.needsApproval) return hold("Needs management approval");
  if (message.deadline) return hold("States a deadline");
  if (message.actionItems.length > AUTO_REPLY_MAX_ACTIONS) {
    return hold("Asks for more than one thing");
  }

  const incoming = [message.subject, message.aiSummary, ...message.actionItems, ...message.body]
    .join("\n")
    .slice(0, 4_000);
  const word = sensitiveWord(incoming);
  if (word) return hold(`Mentions "${word}", which a person should handle`);

  const draft = message.suggestedReply?.trim() ?? "";
  if (!draft || !message.draftCurrent) return hold("No current Suggested Reply to send");
  if (PLACEHOLDER.test(draft)) return hold("The Suggested Reply has gaps a person must fill");
  if (draft.length > AUTO_REPLY_MAX_CHARS) return hold("The Suggested Reply is too long for a quick answer");
  const draftWord = sensitiveWord(draft);
  if (draftWord) return hold(`The Suggested Reply mentions "${draftWord}"`);

  return { send: true };
}

/**
 * Appended to every automatic reply, so the customer knows no person read it
 * yet and that answering brings one in. Their answer lands in the same
 * conversation, which is never answered automatically a second time.
 */
export function autoReplyFooter(businessName: string): string {
  const from = businessName.trim() || "our team";
  return `—\nThis reply was sent automatically by ${from}. If you need anything else, just reply and a member of the team will pick it up.`;
}

export function autoReplySubject(subject: string): string {
  return subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
}
