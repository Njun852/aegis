import type { BadgeTone } from "@/components/ui";

export type MailPriority = "Urgent" | "High" | "Normal" | "Low";

/** Every priority filter, plus the "All" pseudo-filter shown in the rail. */
export type MailPriorityFilter = MailPriority | "All";

export type MailLabel =
  | "Suppliers"
  | "Finance"
  | "Sales"
  | "Internal"
  | "Marketing"
  | "Compliance"
  | "Updates";

/** "Inbox" means every thread, regardless of label. */
export type MailFolderName = "Inbox" | MailLabel;

export interface MailMessage {
  id: string;
  from: string;
  email: string;
  label: MailLabel;
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
  label: MailLabel;
  subject: string;
  time: string;
  date: string;
  priority: MailPriority;
  unread: boolean;
  aiSummary: string;
  actionItems: string[];
  body: string[];
  replies: string[];
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
