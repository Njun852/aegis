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
