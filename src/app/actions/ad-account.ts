"use server";

import { revalidatePath } from "next/cache";
import { canStoreSecrets } from "@/lib/auth/secrets";
import { explainMetaFailure } from "@/lib/meta/failures";
import { inspectAdAccount } from "@/lib/meta/fetch";
import {
  clearAdSyncError,
  clearMetaAds,
  readMetaAdsStatus,
  readMetaCredentialsFor,
  recordAdSyncFailure,
  saveMetaAds,
  updateMetaAccountInfo,
} from "@/lib/dal/ad-account";
import { getBusinessForUser } from "@/lib/dal/businesses";
import { requireAdmin } from "@/lib/dal/session";
import type { MetaAdsStatus } from "@/types";

/**
 * Connecting and disconnecting a business's Meta ad account.
 *
 * Every entry point is administrator-only and re-checks that the business is
 * one this account may administer, exactly as the mailbox actions do.
 *
 * The token travels one way: it arrives here, is checked against Meta, is
 * encrypted and stored. Nothing in this file returns it, and `MetaAdsStatus`
 * has no field that could carry it back.
 */

export interface MetaAdsActionState {
  error: string | null;
  status: MetaAdsStatus | null;
}

/** Accepts "act_123", "123" or "act_ 123" and returns "act_123", or null. */
function normaliseAccountId(value: string): string | null {
  const digits = value.trim().replace(/^act_?/i, "").trim();
  return /^\d{5,20}$/.test(digits) ? `act_${digits}` : null;
}

function revalidate(businessId: string) {
  revalidatePath(`/admin/businesses/${businessId}`);
  revalidatePath("/ads");
  revalidatePath("/status");
}

/**
 * Checks the token against Meta **before** storing anything, so a wrong token
 * or account id is reported at the moment it is typed instead of being saved
 * and failing later on the Ads screen.
 */
export async function saveMetaAdsAction(
  businessId: string,
  adAccountId: string,
  token: string,
): Promise<MetaAdsActionState> {
  await requireAdmin();

  if (!(await getBusinessForUser(businessId))) {
    return { error: "That business could not be found.", status: null };
  }
  if (!canStoreSecrets()) {
    return {
      error:
        "This server has no MAIL_CREDENTIAL_KEY set, so the token cannot be stored securely. Generate one with: openssl rand -hex 32",
      status: null,
    };
  }

  const account = normaliseAccountId(adAccountId);
  if (!account) {
    return {
      error: "Enter the ad account id from Ads Manager. It looks like act_1234567890.",
      status: null,
    };
  }

  const trimmedToken = token.trim();
  if (!/^[A-Za-z0-9]{40,}$/.test(trimmedToken)) {
    return {
      error: "That does not look like a Meta access token. Copy the whole token generated for the system user.",
      status: null,
    };
  }

  const credentials = { adAccountId: account, token: trimmedToken };
  const inspection = await inspectAdAccount(credentials);
  if (!inspection.ok) {
    return { error: explainMetaFailure(inspection.reason), status: null };
  }

  await saveMetaAds(businessId, credentials, inspection.data.info, inspection.data.canWrite);
  revalidate(businessId);
  return { error: null, status: await readMetaAdsStatus(businessId) };
}

/** Reads the account's name, currency and timezone again. Writes nothing to Meta. */
export async function testMetaAdsAction(businessId: string): Promise<MetaAdsActionState> {
  await requireAdmin();

  if (!(await getBusinessForUser(businessId))) {
    return { error: "That business could not be found.", status: null };
  }

  const credentials = await readMetaCredentialsFor(businessId);
  if (!credentials) {
    return {
      error: explainMetaFailure("not-configured"),
      status: await readMetaAdsStatus(businessId),
    };
  }

  const inspection = await inspectAdAccount(credentials);
  if (!inspection.ok) {
    await recordAdSyncFailure(businessId, inspection.reason);
    revalidate(businessId);
    return {
      error: explainMetaFailure(inspection.reason),
      status: await readMetaAdsStatus(businessId),
    };
  }

  await updateMetaAccountInfo(businessId, inspection.data.info, inspection.data.canWrite);
  await clearAdSyncError(businessId);
  revalidate(businessId);
  return { error: null, status: await readMetaAdsStatus(businessId) };
}

export async function disconnectMetaAdsAction(
  businessId: string,
): Promise<MetaAdsActionState> {
  await requireAdmin();

  if (!(await getBusinessForUser(businessId))) {
    return { error: "That business could not be found.", status: null };
  }

  await clearMetaAds(businessId);
  revalidate(businessId);
  return { error: null, status: await readMetaAdsStatus(businessId) };
}
