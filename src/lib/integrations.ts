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

/**
 * Meta follows mail: an ad account is connected per business, in Business
 * Management, and stored encrypted on the business record. It used to be the
 * presence of a `META_ACCESS_TOKEN` environment variable, which made System
 * Status report Meta as ONLINE the moment the variable was set, while nothing
 * was being retrieved at all. `src/lib/dal/ad-account.ts` owns it now.
 */
export { isMetaConfigured as isMetaConnected } from "./dal/ad-account";
