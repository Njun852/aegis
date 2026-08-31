import { MAIL_FOLDERS, PRIORITY_STYLES } from "@/lib/data/mail";
import type {
  MailFolder,
  MailFolderName,
  MailFlagFilter,
  MailMessage,
  MailPriority,
  MailPriorityFilter,
  MailPriorityOption,
} from "@/types";

/**
 * Pure helpers over messages the server already loaded and tenant-scoped.
 * Database access lives in `src/lib/dal/mail.ts` — nothing here touches Mongo,
 * so these are safe in client components.
 *
 * Every function takes its messages explicitly. They used to default to the
 * sample inbox, which quietly pulled the whole fixture into any client bundle
 * that called one; the inbox now comes from the database, so the caller has to
 * say which messages it means.
 */

export const PRIORITY_ORDER: MailPriority[] = [
  "Urgent",
  "High",
  "Normal",
  "Low",
];

export function getPriorityStyle(priority: MailPriority) {
  return PRIORITY_STYLES[priority];
}

export function countUnread(messages: MailMessage[]) {
  return messages.filter((message) => message.unread).length;
}

export function countByPriority(
  messages: MailMessage[],
  priority: MailPriority,
) {
  return messages.filter((message) => message.priority === priority).length;
}

export function countByCategory(messages: MailMessage[], category: string) {
  return messages.filter((message) => message.category === category).length;
}

/**
 * A message needs action when the model listed something to do on it, or when
 * it asks the business to commit to something a person must approve.
 */
export function needsAction(message: MailMessage) {
  return message.actionItems.length > 0 || message.needsApproval;
}

/** "Inbox" shows everything; every other folder filters on the category. */
export function filterMessages(
  messages: MailMessage[],
  folder: MailFolderName,
  priority: MailPriorityFilter,
  flag: MailFlagFilter = "All",
) {
  return messages.filter((message) => {
    const inFolder = folder === "Inbox" || message.category === folder;
    const matchesPriority = priority === "All" || message.priority === priority;
    const matchesFlag =
      flag === "All" ||
      (flag === "Unread" ? message.unread : needsAction(message));
    return inFolder && matchesPriority && matchesFlag;
  });
}

export function buildFolders(messages: MailMessage[]): MailFolder[] {
  return MAIL_FOLDERS.map(({ label, icon }) => ({
    label: label as MailFolderName,
    icon,
    count:
      label === "Inbox" ? messages.length : countByCategory(messages, label),
  }));
}

export function buildPriorityFilters(
  messages: MailMessage[],
): MailPriorityOption[] {
  return [
    { label: "All" as const, dot: "#A3ACBB", count: messages.length },
    ...PRIORITY_ORDER.map((priority) => ({
      label: priority,
      dot: PRIORITY_STYLES[priority].dot,
      count: countByPriority(messages, priority),
    })),
  ];
}

/** The three-line summary the dashboard's Email Summary card shows. */
export function recentMessages(messages: MailMessage[], count = 3) {
  return messages.slice(0, count);
}

/** How many messages a model has actually analysed, for the "AI sorted" note. */
export function countAnalysed(messages: MailMessage[]) {
  return messages.filter((message) => message.aiGeneratedAt !== null).length;
}

/** Counts for the Needs Action and Unread chips in the rail. */
export function countByFlag(messages: MailMessage[], flag: MailFlagFilter) {
  if (flag === "All") return messages.length;
  if (flag === "Unread") return messages.filter((m) => m.unread).length;
  return messages.filter(needsAction).length;
}
