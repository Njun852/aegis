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

export interface MailMonitorEntry {
  label: string;
  meta: string;
  dot: string;
}

/** A canned "AI Assist" reply the compose modal can drop into the draft. */
export interface ComposeDraftSuggestion {
  label: string;
  to: string;
  subject: string;
  body: string;
}

/**
 * Stored shape. `businessId` is stamped on by `tenantScope`.
 *
 * The AI fields carry the sample copy from the fixtures until a model has
 * actually read the message. `aiPromptVersion` records which prompt produced
 * them, and is what stops triage re-running — and re-billing — for a message
 * that has already been analysed.
 */
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
  /** Null while the AI fields are still the seeded samples. */
  aiGeneratedAt: Date | null;
  aiPromptVersion: number | null;
  receivedAt: Date;
  createdAt: Date;
}

/**
 * The sample inbox's shape: a message as it exists before anything has analysed
 * it. The fixture in `src/lib/data/mail.ts` is a seed, not a loaded message —
 * `aiGeneratedAt` is set by the database, once a model has actually run.
 */
export type MailMessageSeed = Omit<MailMessage, "aiGeneratedAt">;
