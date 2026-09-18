import "server-only";

import { graphGet, graphGetAll, type MetaOutcome } from "./client";
import {
  AD_RANGE_KEYS,
  decimalToMinor,
  type MetaAd,
  type MetaAdSet,
  type MetaCampaign,
  type MetaInsight,
  type MetaInsightSet,
  type MetaSnapshot,
} from "./mapping";
import type { AdRange } from "@/types";

/**
 * Reading a whole ad account, and nothing else.
 *
 * Kept apart from `sync.ts`, which adds the session, the cooldown and the
 * database write: this file needs only credentials, so `npm run ads:check` can
 * run exactly the same reads from the command line and show what a sync would
 * store — without a signed-in user and without writing anything.
 */

export interface MetaCredentialsInput {
  adAccountId: string;
  token: string;
}

export interface FetchedAccount {
  snapshot: MetaSnapshot;
  /** A list hit the page cap, so some rows may be missing. */
  truncated: boolean;
  spentTodayCents: number;
}

/**
 * Only states worth reading. DELETED and ARCHIVED are left out, as Ads Manager
 * leaves them out by default.
 */
const LIVE_STATUSES = JSON.stringify([
  "ACTIVE",
  "PAUSED",
  "PENDING_REVIEW",
  "DISAPPROVED",
  "PREAPPROVED",
  "PENDING_BILLING_INFO",
  "CAMPAIGN_PAUSED",
  "ADSET_PAUSED",
  "IN_PROCESS",
  "WITH_ISSUES",
]);

const CAMPAIGN_FIELDS =
  "id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time";
const ADSET_FIELDS =
  "id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,optimization_goal,bid_strategy,targeting{geo_locations,age_min,age_max,genders,publisher_platforms},learning_stage_info,start_time,end_time";
const AD_FIELDS =
  "id,name,adset_id,campaign_id,status,effective_status,creative{title,body,call_to_action_type,object_type}";

const INSIGHT_BASE = "spend,impressions,reach,actions,purchase_roas";

const LEVELS = [
  { level: "campaign", key: "campaigns", id: "campaign_id" },
  { level: "adset", key: "adsets", id: "adset_id" },
  { level: "ad", key: "ads", id: "ad_id" },
] as const;

/**
 * Insights for one level and range. Asks for Meta's own `results` field first,
 * which is what Ads Manager shows; if a future API version rejects it, asks
 * again without it and the mapping works results out from `actions` instead.
 */
async function insights(
  token: string,
  account: string,
  level: (typeof LEVELS)[number],
  range: AdRange,
): Promise<MetaOutcome<{ items: MetaInsight[]; truncated: boolean }>> {
  const ask = (fields: string) =>
    graphGetAll<MetaInsight>(token, `/${account}/insights`, {
      level: level.level,
      date_preset: range,
      fields: `${level.id},${fields}`,
    });

  const first = await ask(`${INSIGHT_BASE},results`);
  if (first.ok || first.reason !== "error") return first;
  return ask(INSIGHT_BASE);
}

/**
 * About fourteen GET requests: three for the structure, nine for insights
 * (three levels × three date ranges), one for today's spend. Stops at the first
 * failure and says which kind it was.
 */
export async function fetchAccount(
  credentials: MetaCredentialsInput,
): Promise<MetaOutcome<FetchedAccount>> {
  const { token, adAccountId: account } = credentials;

  const structure = { effective_status: LIVE_STATUSES };
  const [campaigns, adsets, ads] = await Promise.all([
    graphGetAll<MetaCampaign>(token, `/${account}/campaigns`, { ...structure, fields: CAMPAIGN_FIELDS }),
    graphGetAll<MetaAdSet>(token, `/${account}/adsets`, { ...structure, fields: ADSET_FIELDS }),
    graphGetAll<MetaAd>(token, `/${account}/ads`, { ...structure, fields: AD_FIELDS }),
  ]);
  if (!campaigns.ok) return campaigns;
  if (!adsets.ok) return adsets;
  if (!ads.ok) return ads;

  let truncated = campaigns.data.truncated || adsets.data.truncated || ads.data.truncated;

  const byRange = {} as Record<AdRange, MetaInsightSet>;
  for (const range of AD_RANGE_KEYS) {
    const results = await Promise.all(
      LEVELS.map((level) => insights(token, account, level, range)),
    );
    const set: MetaInsightSet = { campaigns: [], adsets: [], ads: [] };
    for (const [index, result] of results.entries()) {
      if (!result.ok) return result;
      truncated ||= result.data.truncated;
      set[LEVELS[index].key] = result.data.items;
    }
    byRange[range] = set;
  }

  const today = await graphGet<{ data?: { spend?: string }[] }>(
    token,
    `/${account}/insights`,
    { date_preset: "today", fields: "spend" },
  );
  if (!today.ok) return today;

  return {
    ok: true,
    data: {
      snapshot: {
        campaigns: campaigns.data.items,
        adsets: adsets.data.items,
        ads: ads.data.items,
        insights: byRange,
      },
      truncated,
      // No row at all means nothing was spent today, which is a real zero.
      spentTodayCents: decimalToMinor(today.data.data?.[0]?.spend ?? "0"),
    },
  };
}

export interface AdAccountInspection {
  info: { accountName: string; currency: string; timezone: string };
  canWrite: boolean | null;
}

/**
 * Proves a token can read an ad account, and reads its name, currency and
 * timezone. Reads nothing else and writes nothing.
 *
 * Also asks which permissions the token holds. AEGIS never writes either way;
 * a token that could is simply worth warning about, because a read-only one
 * limits what a leak could do.
 */
export async function inspectAdAccount(
  credentials: MetaCredentialsInput,
): Promise<MetaOutcome<AdAccountInspection>> {
  const account = await graphGet<{ name?: string; currency?: string; timezone_name?: string }>(
    credentials.token,
    `/${credentials.adAccountId}`,
    { fields: "name,currency,timezone_name" },
  );
  if (!account.ok) return account;

  const permissions = await graphGet<{ data?: { permission?: string; status?: string }[] }>(
    credentials.token,
    "/me/permissions",
  );
  const canWrite = permissions.ok
    ? (permissions.data.data ?? []).some(
        (entry) => entry.permission === "ads_management" && entry.status === "granted",
      )
    : null;

  return {
    ok: true,
    data: {
      info: {
        accountName: account.data.name ?? credentials.adAccountId,
        currency: account.data.currency ?? "USD",
        timezone: account.data.timezone_name ?? "",
      },
      canWrite,
    },
  };
}
