/**
 * Whether each external integration is actually connected.
 *
 * Modelled on `isAiConfigured()` in `src/lib/ai/client.ts`: the presence of the
 * credential is the switch, so the day an integration is connected every
 * surface that asks changes answer without a code change. Until then the honest
 * answer is false, and the interface says so rather than showing a reassuring
 * green dot over seeded data.
 */

export function isMailboxConnected(): boolean {
  return Boolean(process.env.GMAIL_REFRESH_TOKEN?.trim());
}

/** The mailbox address, once one is connected. */
export function mailboxAddress(): string | null {
  return process.env.GMAIL_ACCOUNT?.trim() || null;
}

export function isMetaConnected(): boolean {
  return Boolean(process.env.META_ACCESS_TOKEN?.trim());
}
