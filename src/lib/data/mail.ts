import type {
  MailCategory,
  MailPriority,
  MailPriorityStyle,
} from "@/types";

/**
 * Per-priority styling: badge tone, rail dot, list-row accent and icon.
 * Colors come from the data-viz sequence so they never invent a new hue.
 */
export const PRIORITY_STYLES: Record<MailPriority, MailPriorityStyle> = {
  Urgent: {
    tone: "negative",
    dot: "#D92D20",
    accent: "#D92D20",
    icon: "circle-alert",
    color: "var(--viz-6)",
  },
  High: {
    tone: "warning",
    dot: "#C77A0E",
    accent: "#C77A0E",
    icon: "alert-triangle",
    color: "var(--viz-4)",
  },
  Normal: {
    tone: "accent",
    dot: "#2C6EF2",
    accent: "transparent",
    icon: "mail",
    color: "var(--viz-1)",
  },
  Low: {
    tone: "neutral",
    dot: "#A3ACBB",
    accent: "transparent",
    icon: "inbox",
    color: "var(--viz-2)",
  },
};

/**
 * The categories the acceptance checklist specifies, in the order the rail
 * lists them. Also the enum the triage model is constrained to.
 */
export const MAIL_CATEGORIES: MailCategory[] = [
  "Customer",
  "Fleet",
  "Insurance",
  "Supplier",
  "Billing",
  "Employee",
  "Government",
  "Marketing",
  "Spam",
  "Other",
];

/** Order the folder rail lists labels in. "Inbox" always comes first. */
export const MAIL_FOLDERS: { label: string; icon: string }[] = [
  { label: "Inbox", icon: "inbox" },
  { label: "Customer", icon: "user" },
  { label: "Fleet", icon: "truck" },
  { label: "Insurance", icon: "shield-check" },
  { label: "Supplier", icon: "package" },
  { label: "Billing", icon: "credit-card" },
  { label: "Employee", icon: "briefcase" },
  { label: "Government", icon: "file-text" },
  { label: "Marketing", icon: "megaphone" },
  { label: "Spam", icon: "alert-triangle" },
  { label: "Other", icon: "layers" },
];
