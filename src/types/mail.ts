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
  /**
   * What automatic replies decided about this message, or null when they never
   * looked at it (switched off, or it was not yet eligible to be judged).
   */
  autoReply: MailAutoReplyOutcome | null;
  /** Files attached to the email. Null when not read yet (mail stored before this was recorded). */
  attachments: MailAttachmentInfo[] | null;
  /** Links in the email. Null when not read yet. */
  links: MailLink[] | null;
  /** Whether the mail server can still be asked for this message (it has a UID). */
  canReadFromMailbox: boolean;
  /** A purchase order read from it, when it was one. Null otherwise. */
  poScan: MailPoScan | null;
}

/**
 * One file attached to an email, as recorded when the email is read. The file
 * itself stays in Gmail and is fetched when someone opens it.
 */
export interface MailAttachmentInfo {
  /** Its position among the email's attachments, which is how it is fetched. */
  index: number;
  filename: string;
  contentType: string;
  /** Bytes. */
  size: number;
  /** Shown in the body (a pasted photo, a signature logo) rather than attached as a file. */
  inline: boolean;
}

/** One link in an email: where it really goes, and the words it was shown as. */
export interface MailLink {
  url: string;
  text: string;
}

/** `sent` went out, `failed` was tried once and refused, `held` waits for a person. */
export type MailAutoReplyStatus = "sent" | "failed" | "held";

export interface MailAutoReplyOutcome {
  status: MailAutoReplyStatus;
  /** Why it was held or failed, worded for a person. Empty when sent. */
  reason: string;
  /** ISO 8601. */
  at: string;
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
  /** True when AEGIS sent it on its own under the automatic-reply rule. */
  auto: boolean;
}

/**
 * The headers that say whether a machine sent a message and which conversation
 * it belongs to, read at retrieval by `readMailSignals`.
 */
export interface MailSignals {
  autoSubmitted: string | null;
  precedence: string | null;
  /** List-Id, List-Unsubscribe or a similar mailing-list header is present. */
  mailingList: boolean;
  autoResponseSuppress: string | null;
  /** X-Autoreply or one of its relatives is present. */
  autoReplyHeader: boolean;
  /** Return-Path is `<>`: a bounce or delivery notice. */
  returnPathEmpty: boolean;
  /** The Message-ID that started the conversation, or this message's own. */
  threadId: string;
  /** Message-IDs this one answers, for threading a reply. At most ten. */
  references: string[];
}

/** Stored on the business. Absent means switched off. */
export interface MailAutoReplyConfig {
  enabled: boolean;
  /** Automatic replies per Manila day, counted across every attempt. */
  dailyLimit: number;
  /** When it was last switched on; mail that arrived earlier is never answered. */
  enabledAt: Date | null;
}

/**
 * One automatic reply, written before it is sent. The unique index on
 * `{ businessId, threadId }` is what makes "once per conversation" hold even
 * when two syncs race.
 */
export interface MailAutoReplyDocument {
  businessId: string;
  messageId: string;
  threadId: string;
  to: string;
  subject: string;
  body: string;
  /** `sending` stays only if the process died mid-send; it is never retried. */
  status: "sending" | "sent" | "failed";
  reason: string;
  createdAt: Date;
}

/** What the admin panel shows. */
export interface MailAutoReplyPanelData {
  enabled: boolean;
  dailyLimit: number;
  /** ISO 8601, or null while it has never been switched on. */
  enabledAt: string | null;
  mailboxConnected: boolean;
  sentToday: number;
  recent: { to: string; subject: string; status: MailAutoReplyDocument["status"]; reason: string; at: string }[];
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
  sentReplies?: { body: string; sentAt: Date; auto?: boolean }[];
  /** Absent on mail retrieved before headers were recorded, and on seeded mail. */
  signals?: MailSignals;
  /** Set once automatic replies have judged this message; it is judged once. */
  autoReply?: { status: MailAutoReplyStatus; reason: string; at: Date };
  /**
   * How the mail server names this message. Needed to set the \Seen flag,
   * which is addressed by UID rather than by Message-ID. Absent on anything
   * stored before retrieval existed.
   */
  uid?: number;
  uidValidity?: string;
  /** Recorded when the email is read in; absent on mail stored before 13 Nov 2026 until it is opened. */
  attachments?: MailAttachmentInfo[];
  links?: MailLink[];
  /** What the purchase-order reader made of it. Absent until it has looked (or on mail it skips). */
  poScan?: MailPoScanDocument;
  receivedAt: Date;
  createdAt: Date;
}

/**
 * The purchase-order reader's verdict on one email: was it a customer
 * approving a quotation, and which quotations it recorded as Approved.
 *
 * - `none`: not an approval (or not worth asking the AI about).
 * - `applied`: recorded on every quotation in `quotationRefs`.
 * - `review`: looks like an approval, but the AI could not tie it to an open
 *   quotation with enough certainty, so a person records it.
 */
export type MailPoScanOutcome = "none" | "applied" | "review";

export interface MailPoScan {
  outcome: MailPoScanOutcome;
  poNumber: string;
  company: string;
  quotationRefs: string[];
  /** One line on what was read, for the mail screen. */
  note: string;
}

export type MailPoScanDocument = MailPoScan & { version: number; at: Date };

/**
 * An attachment's bytes, kept after the first time it is fetched from Gmail so
 * the next view does not open another mailbox connection. Expires after 30 days.
 */
export interface MailAttachmentCacheDocument {
  businessId: string;
  messageId: string;
  index: number;
  filename: string;
  contentType: string;
  content: Buffer;
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
