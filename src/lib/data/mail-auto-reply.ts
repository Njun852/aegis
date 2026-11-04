/**
 * Indexes automatic mail replies rely on, kept in one place so `scripts/seed.ts`
 * (a fresh database), `scripts/auto-reply-check.ts` (an existing one) and the
 * DAL itself create the same set.
 */
export interface MailAutoReplyIndex {
  collection: "mailAutoReplies";
  keys: Record<string, 1 | -1>;
  options?: { unique?: boolean };
}

export const MAIL_AUTO_REPLY_INDEXES: MailAutoReplyIndex[] = [
  // Once per conversation: the claim is written before sending, so a second
  // sync, a second tab or a second server process is refused here rather than
  // answering the same thread twice.
  { collection: "mailAutoReplies", keys: { businessId: 1, threadId: 1 }, options: { unique: true } },
  // The daily limit and the admin panel's recent list.
  { collection: "mailAutoReplies", keys: { businessId: 1, createdAt: -1 } },
  // Once per sender a day.
  { collection: "mailAutoReplies", keys: { businessId: 1, to: 1, createdAt: -1 } },
];
