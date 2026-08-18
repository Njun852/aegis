import { MAIL_FOLDERS, MESSAGES, PRIORITY_STYLES } from "@/lib/data/mail";
import type {
  MailFolder,
  MailFolderName,
  MailMessage,
  MailPriority,
  MailPriorityFilter,
  MailPriorityOption,
} from "@/types";

export const PRIORITY_ORDER: MailPriority[] = [
  "Urgent",
  "High",
  "Normal",
  "Low",
];

export function getPriorityStyle(priority: MailPriority) {
  return PRIORITY_STYLES[priority];
}

export function countUnread(messages: MailMessage[] = MESSAGES) {
  return messages.filter((message) => message.unread).length;
}

export function countByPriority(
  priority: MailPriority,
  messages: MailMessage[] = MESSAGES,
) {
  return messages.filter((message) => message.priority === priority).length;
}

export function countByLabel(label: string, messages: MailMessage[] = MESSAGES) {
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

export function buildFolders(messages: MailMessage[] = MESSAGES): MailFolder[] {
  return MAIL_FOLDERS.map(({ label, icon }) => ({
    label: label as MailFolderName,
    icon,
    count: label === "Inbox" ? messages.length : countByLabel(label, messages),
  }));
}

export function buildPriorityFilters(
  messages: MailMessage[] = MESSAGES,
): MailPriorityOption[] {
  return [
    { label: "All" as const, dot: "#A3ACBB", count: messages.length },
    ...PRIORITY_ORDER.map((priority) => ({
      label: priority,
      dot: PRIORITY_STYLES[priority].dot,
      count: countByPriority(priority, messages),
    })),
  ];
}

/** The three-line summary the dashboard's Email Summary card shows. */
export function recentMessages(count = 3, messages: MailMessage[] = MESSAGES) {
  return messages.slice(0, count);
}
