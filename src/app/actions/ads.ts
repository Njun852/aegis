"use server";

import { revalidatePath } from "next/cache";
import { explainMetaFailure } from "@/lib/meta/failures";
import { syncAds } from "@/lib/meta/sync";
import { requireModule } from "@/lib/dal/businesses";
import { setAdEnabled } from "@/lib/dal/ads";

export interface AdToggleState {
  error: string | null;
}

/**
 * Switches one sample campaign, ad set or ad on or off.
 *
 * The table renders the switch optimistically, so this is the write that makes
 * it true; the row is re-read on the next render. `requireModule` gates it even
 * though Ads is a core module — the check also proves there is a session and a
 * tenant behind the request.
 *
 * Rows from a connected Meta account are refused: AEGIS never changes a real
 * ad account, and the switch is disabled for them on screen too.
 */
export async function setAdEnabledAction(
  id: string,
  enabled: boolean,
): Promise<AdToggleState> {
  await requireModule("ads");

  const trimmed = id.trim();
  if (!trimmed) return { error: "That row could not be identified." };

  const outcome = await setAdEnabled(trimmed, enabled);
  if (outcome === "read-only") {
    return {
      error: "AEGIS only reads your Meta account. Switch this on or off in Meta Ads Manager.",
    };
  }
  if (outcome === "not-found") {
    return { error: "That row is no longer in this ad account." };
  }

  revalidatePath("/ads");
  return { error: null };
}

export interface SyncAdsState {
  rows: number;
  /** Set when the run failed, already worded for a person. */
  error: string | null;
  /** Set when a run was refused because the last one was too recent. */
  retryInSeconds: number | null;
  truncated: boolean;
}

/**
 * Pulls the connected Meta ad account, read-only. Anyone who can see the Ads
 * screen may refresh it; what they can refresh is limited to their own
 * business by the session.
 */
export async function syncAdsAction(): Promise<SyncAdsState> {
  await requireModule("ads");

  const report = await syncAds();

  if (!report.failed && report.retryInSeconds === null) {
    revalidatePath("/ads");
    revalidatePath("/status");
    revalidatePath("/dashboard");
  } else if (report.failed) {
    revalidatePath("/status");
  }

  return {
    rows: report.rows,
    error: report.failed ? explainMetaFailure(report.failed) : null,
    retryInSeconds: report.retryInSeconds,
    truncated: report.truncated,
  };
}
