"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/dal/businesses";
import { setAdEnabled } from "@/lib/dal/ads";

export interface AdToggleState {
  error: string | null;
}

/**
 * Switches one campaign, ad set or ad on or off.
 *
 * The table renders the switch optimistically, so this is the write that makes
 * it true; the row is re-read on the next render. `requireModule` gates it even
 * though Ads is a core module — the check also proves there is a session and a
 * tenant behind the request.
 */
export async function setAdEnabledAction(
  id: string,
  enabled: boolean,
): Promise<AdToggleState> {
  await requireModule("ads");

  const trimmed = id.trim();
  if (!trimmed) return { error: "That row could not be identified." };

  const matched = await setAdEnabled(trimmed, enabled);
  if (!matched) {
    return { error: "That row is no longer in this ad account." };
  }

  revalidatePath("/ads");
  return { error: null };
}
