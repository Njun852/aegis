/**
 * Whether each external integration is actually connected.
 *
 * Modelled on `isAiConfigured()` in `src/lib/ai/client.ts`: the presence of the
 * credential is the switch, so the day an integration is connected every
 * surface that asks changes answer without a code change. Until then the honest
 * answer is false, and the interface says so rather than showing a reassuring
 * green dot over seeded data.
 */

/**
 * Mail is the exception to the env-var rule above: a mailbox is connected per
 * business, not per install, so its state lives on the business record and
 * these are async reads. `src/lib/dal/mailbox.ts` owns them.
 */
export {
  isMailboxConfigured as isMailboxConnected,
  readMailboxAddress as mailboxAddress,
} from "./dal/mailbox";

export function isMetaConnected(): boolean {
  return Boolean(process.env.META_ACCESS_TOKEN?.trim());
}
