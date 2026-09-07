import type { FreshnessTone } from "@/lib/freshness";
import type { BadgeTone } from "@/components/ui";

export type MailPriority = "Urgent" | "High" | "Normal" | "Low";

/** Every priority filter, plus the "All" pseudo-filter shown in the rail. */
export type MailPriorityFilter = MailPriority | "All";

/**
 * The categories the acceptance checklist specifies. Assigned by the model at
 * triage rather than carried on the message, so a newly arrived email is
 * classified rather than filed by whatever the sending system called it.
 */
export type MailCategory =
  | "Customer"
  | "Fleet"
  | "Insurance"
  | "Supplier"
  | "Billing"
  | "Employee"
  | "Government"
  | "Marketing"
  | "Spam"
  | "Other";

/** "Inbox" means every thread, regardless of category. */
export type MailFolderName = "Inbox" | MailCategory;

/**
 * The two cross-cutting views the checklist asks for alongside priority: work
 * that still needs doing, and mail nobody has opened.
 */
export type MailFlagFilter = "All" | "Needs Action" | "Unread";

export interface MailMessage {
  id: string;
  from: string;
  email: string;
  category: MailCategory;
  subject: string;
  /** Short form shown in the list ("09:42", "Yesterday", "Mon"). */
  time: string;
  /** Long form shown in the detail header ("May 31, 2026 · 09:42 AM"). */
  date: string;
  priority: MailPriority;
  unread: boolean;
  aiSummary: string;
  actionItems: string[];
  body: string[];
  replies: string[];
  /**
   * An explicit deadline stated in the email, in the words the email used.
   * `null` renders as "None mentioned" — the model never infers one.
   */
  deadline: string | null;
  /**
   * True when the email asks the business to commit to something a person must
   * authorise: a charge, a contract, a discount, an approval. The suggested
   * replies must not accept on the business's behalf.
   */
  needsApproval: boolean;
  /** Why approval is required, in one short phrase. Empty when it is not. */
  approvalReason: string;
  /** ISO 8601 once a model has analysed this message; null while sampled. */
  aiGeneratedAt: string | null;
  /**
   * The full draft reply shown as the Suggested Reply field. Null until one has
   * been written, and stays null for categories `replyPolicy` says not to reply
   * to — the screen shows that policy's reason instead.
   */
  suggestedReply: string | null;
  /** Replies actually sent from AEGIS, oldest first. */
  sentReplies: SentReply[];
}

export interface MailPriorityStyle {
  tone: BadgeTone;
  dot: string;
  /** Left border on the list row; transparent for the calmer priorities. */
  accent: string;
  icon: string;
  color: string;
}

export interface MailFolder {
  label: MailFolderName;
  icon: string;
  count: number;
}

export interface MailPriorityOption {
  label: MailPriorityFilter;
  dot: string;
  count: number;
}

/**
 * Stored shape. `businessId` is stamped on by `tenantScope`.
 *
 * The AI fields carry the sample copy from the fixtures until a model has
 * actually read the message. `aiPromptVersion` records which prompt produced
 * them, and is what stops triage re-running — and re-billing — for a message
 * that has already been analysed.
 */
/** A reply that really left the building, recorded after SMTP accepted it. */
export interface SentReply {
  body: string;
  /** ISO 8601 on the wire, a Date in storage. */
  sentAt: string;
}

export interface MailMessageDocument {
  businessId: string;
  /** Stable per tenant. Becomes the Gmail message id once that lands. */
  messageId: string;
  from: string;
  email: string;
  category: MailCategory;
  subject: string;
  time: string;
  date: string;
  priority: MailPriority;
  unread: boolean;
  aiSummary: string;
  actionItems: string[];
  body: string[];
  replies: string[];
  deadline: string | null;
  needsApproval: boolean;
  approvalReason: string;
  /** Null until a model has analysed this message. */
  aiGeneratedAt: Date | null;
  aiPromptVersion: number | null;
  /** The stored full draft reply, or null if none has been written. */
  suggestedReply: string | null;
  /**
   * Which reply prompt produced it. This is what stops the sweep re-drafting —
   * and re-billing for — a message that already has a current draft.
   */
  replyPromptVersion: number | null;
  /** Sent replies, stored so a reload still shows what was sent. */
  sentReplies?: { body: string; sentAt: Date }[];
  /**
   * How the mail server names this message. Needed to set the \Seen flag,
   * which is addressed by UID rather than by Message-ID. Absent on anything
   * stored before retrieval existed.
   */
  uid?: number;
  uidValidity?: string;
  receivedAt: Date;
  createdAt: Date;
}

/**
 * What the shell is told about mail freshness at render time.
 *
 * `label` and `tone` are computed on the server and reused as the client's
 * first values, so hydration cannot mismatch on a clock that moved between the
 * two renders.
 */
export interface MailFreshnessState {
  /**
   * Whose freshness this is. Mail is connected per business, so switching
   * business replaces every value below — the shell keys the provider on this
   * so none of it can survive the switch.
   */
  businessId: string;
  /** ISO of the last successful retrieval, or null when none has succeeded. */
  newestReceivedAt: string | null;
  /** False until a real mailbox is connected. */
  connected: boolean;
  label: string;
  tone: FreshnessTone;
}
