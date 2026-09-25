import "server-only";

import { decryptSecret, encryptSecret } from "@/lib/auth/secrets";
import { explainMetaFailure, type MetaFailure } from "@/lib/meta/failures";
import { adSyncCollection, businessesCollection, getDb } from "./db";
import { readMessengerHealth } from "./messenger";
import { requireAdmin, verifySession } from "./session";
import type { AdSyncDocument, MetaAdsStatus } from "@/types";

/**
 * Meta ad account credentials and sync state, per business.
 *
 * Modelled on `src/lib/dal/mailbox.ts`. The access token is stored encrypted on
 * the business record and decrypted only here, at the moment a request is made.
 * Nothing in this file returns a token to a caller that could reach a browser:
 * screens get `MetaAdsStatus`, which has no field that could carry one.
 *
 * Writes to the configuration assert `requireAdmin` themselves, so the check
 * holds even for a caller that skips the action layer.
 */

export interface MetaCredentials {
  adAccountId: string;
  token: string;
}

export interface MetaAccountInfo {
  accountName: string;
  currency: string;
  timezone: string;
}

/**
 * Credentials for one business. Null when nothing is connected, and also when
 * the stored token cannot be decrypted — a rotated credential key leaves a row
 * that is unreadable rather than wrong, and the honest answer to that is the
 * same as having no connection: report it and ask for it to be reconnected.
 */
export async function readMetaCredentialsFor(
  businessId: string,
): Promise<MetaCredentials | null> {
  const businesses = await businessesCollection();
  const business = await businesses.findOne({ businessId });
  const config = business?.metaAds;
  if (!config?.adAccountId || !config.secretCipher) return null;

  const token = decryptSecret(config.secretCipher);
  if (!token) return null;
  return { adAccountId: config.adAccountId, token };
}

/** Whether a business has a Meta ad account configured at all. */
export async function isMetaConfiguredFor(businessId: string): Promise<boolean> {
  const businesses = await businessesCollection();
  const business = await businesses.findOne(
    { businessId },
    { projection: { "metaAds.adAccountId": 1 } },
  );
  return Boolean(business?.metaAds?.adAccountId);
}

/** The same, for the business the caller is signed in to. */
export async function isMetaConfigured(): Promise<boolean> {
  const { activeBusinessId } = await verifySession();
  return isMetaConfiguredFor(activeBusinessId);
}

/**
 * Stores a connection. The token is encrypted before it reaches the database
 * and is never written anywhere in the clear.
 *
 * Pointing a business at a different ad account throws away the rows and sync
 * state of the old one: they describe an account this business no longer
 * reads, and showing them under the new name would be showing wrong data.
 */
export async function saveMetaAds(
  businessId: string,
  credentials: MetaCredentials,
  info: MetaAccountInfo,
  canWrite: boolean | null,
): Promise<void> {
  await requireAdmin();

  const businesses = await businessesCollection();
  const previous = await businesses.findOne(
    { businessId },
    { projection: { "metaAds.adAccountId": 1 } },
  );

  await businesses.updateOne(
    { businessId },
    {
      $set: {
        metaAds: {
          adAccountId: credentials.adAccountId,
          secretCipher: encryptSecret(credentials.token),
          accountName: info.accountName,
          currency: info.currency,
          timezone: info.timezone,
          canWrite,
          updatedAt: new Date(),
        },
      },
    },
  );

  if (previous?.metaAds?.adAccountId !== credentials.adAccountId) {
    await clearMetaData(businessId);
  }
}

/** Refreshes what a connection test learned, without touching the token. */
export async function updateMetaAccountInfo(
  businessId: string,
  info: MetaAccountInfo,
  canWrite: boolean | null,
): Promise<void> {
  await requireAdmin();
  const businesses = await businessesCollection();
  await businesses.updateOne(
    { businessId, metaAds: { $exists: true } },
    {
      $set: {
        "metaAds.accountName": info.accountName,
        "metaAds.currency": info.currency,
        "metaAds.timezone": info.timezone,
        "metaAds.canWrite": canWrite,
      },
    },
  );
}

/**
 * Removes the connection, and with it the stored copy of the account. The rows
 * are a cache of something Meta holds, so nothing is lost that a reconnect
 * cannot fetch again — and the screen falls back to its labelled sample data
 * instead of showing figures nobody is keeping up to date.
 */
export async function clearMetaAds(businessId: string): Promise<void> {
  await requireAdmin();
  const businesses = await businessesCollection();
  await businesses.updateOne({ businessId }, { $unset: { metaAds: "" } });
  await clearMetaData(businessId);
}

/**
 * Explicit business id, not `tenantScope`: an administrator disconnects a
 * business other than the one they are switched to. Every caller above has
 * already asserted `requireAdmin`.
 */
async function clearMetaData(businessId: string): Promise<void> {
  const db = await getDb();
  await db.collection("adRows").deleteMany({ businessId, source: "meta" });
  const sync = await adSyncCollection();
  await sync.deleteOne({ businessId });
}

/**
 * Connects the Facebook Page whose Messenger chats belong to this business.
 *
 * The Page id is what a webhook delivery is matched on, so it is stored in the
 * clear; the Page token is encrypted like every other credential. A business
 * must already have its ad account connected: the Page's chats are only useful
 * beside the ads they came from.
 */
export async function saveMetaPage(
  businessId: string,
  pageId: string,
  pageName: string,
  token: string | null,
): Promise<void> {
  await requireAdmin();
  const businesses = await businessesCollection();
  await businesses.updateOne(
    { businessId, metaAds: { $exists: true } },
    {
      $set: {
        "metaAds.pageId": pageId,
        "metaAds.pageName": pageName,
        ...(token ? { "metaAds.pageSecretCipher": encryptSecret(token) } : {}),
      },
    },
  );
}

export async function clearMetaPage(businessId: string): Promise<void> {
  await requireAdmin();
  const businesses = await businessesCollection();
  await businesses.updateOne(
    { businessId },
    {
      $unset: {
        "metaAds.pageId": "",
        "metaAds.pageName": "",
        "metaAds.pageSecretCipher": "",
      },
    },
  );
}

/** The Page token for server-side reads. Null when none is stored. */
export async function readPageTokenFor(businessId: string): Promise<string | null> {
  const businesses = await businessesCollection();
  const business = await businesses.findOne({ businessId });
  const cipher = business?.metaAds?.pageSecretCipher;
  return cipher ? decryptSecret(cipher) : null;
}

// ---- Sync state -------------------------------------------------------------

export async function readAdSync(businessId: string): Promise<AdSyncDocument | null> {
  const sync = await adSyncCollection();
  return sync.findOne({ businessId });
}

/** Marks the start of a run, so the cooldown holds even if the run fails. */
export async function recordAdSyncAttempt(businessId: string, at = new Date()): Promise<void> {
  const sync = await adSyncCollection();
  await sync.updateOne(
    { businessId },
    {
      $set: { lastAttemptAt: at },
      $setOnInsert: {
        lastSyncAt: null,
        lastOutcome: null,
        lastError: null,
        lastErrorAt: null,
        truncated: false,
        rowCount: 0,
        spentTodayCents: null,
      },
    },
    { upsert: true },
  );
}

export async function recordAdSyncSuccess(
  businessId: string,
  result: { rowCount: number; truncated: boolean; spentTodayCents: number | null },
  at = new Date(),
): Promise<void> {
  const sync = await adSyncCollection();
  await sync.updateOne(
    { businessId },
    {
      $set: {
        lastSyncAt: at,
        lastOutcome: "ok",
        lastError: null,
        lastErrorAt: null,
        truncated: result.truncated,
        rowCount: result.rowCount,
        spentTodayCents: result.spentTodayCents,
      },
    },
    { upsert: true },
  );
}

/**
 * A failure never moves `lastSyncAt`. "When the figures were last current" and
 * "when we last tried" are different questions, and the screens must be able
 * to say both: the last attempt failed, and the data is this old.
 */
export async function recordAdSyncFailure(
  businessId: string,
  reason: MetaFailure,
  at = new Date(),
): Promise<void> {
  const sync = await adSyncCollection();
  await sync.updateOne(
    { businessId },
    {
      $set: {
        lastOutcome: reason,
        lastError: explainMetaFailure(reason),
        lastErrorAt: at,
      },
    },
    { upsert: true },
  );
}

/** A connection test succeeded: clear a failure it has just disproved. */
export async function clearAdSyncError(businessId: string): Promise<void> {
  const sync = await adSyncCollection();
  await sync.updateOne(
    { businessId },
    { $set: { lastError: null, lastErrorAt: null } },
  );
}

// ---- Status -------------------------------------------------------------------

/**
 * Everything a screen may know about a business's Meta connection. Explicit
 * id because the admin screen inspects a business other than the active one;
 * callers are gated by `requireAdmin` or pass the active business.
 */
export async function readMetaAdsStatus(businessId: string): Promise<MetaAdsStatus> {
  const businesses = await businessesCollection();
  const [business, sync, messenger] = await Promise.all([
    businesses.findOne(
      { businessId },
      { projection: { "metaAds.secretCipher": 0, "metaAds.pageSecretCipher": 0 } },
    ),
    readAdSync(businessId),
    readMessengerHealth(businessId),
  ]);
  const config = business?.metaAds;

  return {
    connected: Boolean(config?.adAccountId),
    adAccountId: config?.adAccountId ?? null,
    accountName: config?.accountName ?? null,
    currency: config?.currency ?? null,
    timezone: config?.timezone ?? null,
    updatedAt: config?.updatedAt?.toISOString() ?? null,
    lastSyncAt: sync?.lastSyncAt?.toISOString() ?? null,
    lastError: sync?.lastError ?? null,
    lastErrorAt: sync?.lastErrorAt?.toISOString() ?? null,
    truncated: sync?.truncated ?? false,
    rowCount: sync?.rowCount ?? 0,
    spentTodayCents: sync?.spentTodayCents ?? null,
    canWrite: config?.canWrite ?? null,
    pageId: config?.pageId ?? null,
    pageName: config?.pageName ?? null,
    pageTokenStored: Boolean(config?.pageSecretCipher),
    lastEventAt: messenger.lastEventAt?.toISOString() ?? null,
    lastSignatureFailureAt: messenger.lastSignatureFailureAt?.toISOString() ?? null,
    conversationCount: messenger.conversationCount,
  };
}

/** The same, for the business the caller is signed in to. */
export async function readActiveMetaAdsStatus(): Promise<MetaAdsStatus> {
  const { activeBusinessId } = await verifySession();
  return readMetaAdsStatus(activeBusinessId);
}
