"use server";

import { requireModule } from "@/lib/dal/businesses";
import { readMailFreshness } from "@/lib/dal/mail";
import { isMailboxConnected } from "@/lib/integrations";

/**
 * Re-reads how current the mail data is.
 *
 * Cheap and side-effect free: one indexed read plus a count. It exists so the
 * top bar can refresh its age without a full page render, and so pressing
 * "Sync now" reports the state that actually resulted rather than an animation.
 */
export async function refreshMailFreshnessAction(): Promise<{
  newestReceivedAt: string | null;
  connected: boolean;
}> {
  await requireModule("mail");

  const { newestReceivedAt } = await readMailFreshness();
  return { newestReceivedAt, connected: isMailboxConnected() };
}
