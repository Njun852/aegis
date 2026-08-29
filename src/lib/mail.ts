import { MAIL_FOLDERS, PRIORITY_STYLES } from "@/lib/data/mail";
import type {
  MailFolder,
  MailFolderName,
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

export function countByLabel(messages: MailMessage[], label: string) {
  return messages.filter((message) => message.label === label).length;
}

/** "Inbox" shows everything; every other folder filters on the message label. */
export function filterMessages(
  messages: MailMessage[],
  folder: MailFolderName,
  priority: MailPriorityFilter,
) {
  return messages.filter((message) => {
    const inFolder = folder === "Inbox" || message.label === folder;
    const matchesPriority = priority === "All" || message.priority === priority;
    return inFolder && matchesPriority;
  });
}

export function buildFolders(messages: MailMessage[]): MailFolder[] {
  return MAIL_FOLDERS.map(({ label, icon }) => ({
    label: label as MailFolderName,
    icon,
    count: label === "Inbox" ? messages.length : countByLabel(messages, label),
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
