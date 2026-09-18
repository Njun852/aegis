import "server-only";

import {
  readAdSync,
  readMetaCredentialsFor,
  recordAdSyncAttempt,
  recordAdSyncFailure,
  recordAdSyncSuccess,
} from "@/lib/dal/ad-account";
import { replaceMetaRows } from "@/lib/dal/ads";
import { verifySession } from "@/lib/dal/session";
import { fetchAccount } from "./fetch";
import type { MetaFailure } from "./failures";
import { mapSnapshot } from "./mapping";

/**
 * Retrieval: a read-only copy of the active business's Meta ad account,
 * written to `adRows`.
 *
 * Nothing is written unless every read succeeded (`fetchAccount`). A failure
 * is recorded and the previous rows stay exactly as they were, so the screen
 * keeps showing the last good figures with an honest "last synced" beside them.
 */

/** Minimum gap between runs for one business. Meta rate-limits by account. */
export const SYNC_COOLDOWN_MS = 2 * 60 * 1000;

export interface SyncAdsReport {
  rows: number;
  truncated: boolean;
  failed: MetaFailure | null;
  /** Seconds until another sync is allowed, when this one was refused for it. */
  retryInSeconds: number | null;
}

export async function syncAds(): Promise<SyncAdsReport> {
  const { activeBusinessId: businessId } = await verifySession();
  const idle = { rows: 0, truncated: false, retryInSeconds: null };

  const credentials = await readMetaCredentialsFor(businessId);
  if (!credentials) return { ...idle, failed: "not-configured" };

  const previous = await readAdSync(businessId);
  const since = previous?.lastAttemptAt
    ? Date.now() - previous.lastAttemptAt.getTime()
    : Infinity;
  if (since < SYNC_COOLDOWN_MS) {
    return {
      ...idle,
      failed: null,
      retryInSeconds: Math.ceil((SYNC_COOLDOWN_MS - since) / 1000),
    };
  }
  await recordAdSyncAttempt(businessId);

  const fetched = await fetchAccount(credentials);
  if (!fetched.ok) {
    await recordAdSyncFailure(businessId, fetched.reason);
    return { ...idle, failed: fetched.reason };
  }

  const { snapshot, truncated, spentTodayCents } = fetched.data;
  const rows = await replaceMetaRows(mapSnapshot(snapshot), truncated);
  await recordAdSyncSuccess(businessId, { rowCount: rows, truncated, spentTodayCents });

  return { rows, truncated, failed: null, retryInSeconds: null };
}
