import type {
  AdLevel,
  AdMetrics,
  AdRange,
  AdRow,
  AdState,
} from "@/types";

/**
 * Meta's objects and insights, turned into the `AdRow` shape the Ads screen
 * already renders.
 *
 * Pure: no network, no database, no `server-only`. That is what lets
 * `scripts/ads-check.ts` run it over recorded responses and assert the figures,
 * which matters because the sandbox account has no delivery — its numbers are
 * all zero, so correctness of spend, results and cost per result has to be
 * proved on fixtures until a real account is connected.
 */

// ---- What Meta sends -------------------------------------------------------

export interface MetaCampaign {
  id: string;
  name: string;
  status?: string;
  effective_status?: string;
  objective?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
}

export interface MetaTargeting {
  geo_locations?: { countries?: string[]; cities?: { name?: string }[] };
  age_min?: number;
  age_max?: number;
  genders?: number[];
  publisher_platforms?: string[];
}

export interface MetaAdSet {
  id: string;
  name: string;
  campaign_id: string;
  status?: string;
  effective_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  optimization_goal?: string;
  bid_strategy?: string;
  targeting?: MetaTargeting;
  learning_stage_info?: { status?: string };
  start_time?: string;
  end_time?: string;
}

export interface MetaCreative {
  title?: string;
  body?: string;
  call_to_action_type?: string;
  object_type?: string;
}

export interface MetaAd {
  id: string;
  name: string;
  adset_id: string;
  campaign_id: string;
  status?: string;
  effective_status?: string;
  creative?: MetaCreative;
}

export interface MetaActionValue {
  action_type?: string;
  value?: string;
}

/** Meta's own result fields, where the API version provides them. */
export interface MetaResultValue {
  indicator?: string;
  values?: { value?: string }[];
}

export interface MetaInsight {
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  actions?: MetaActionValue[];
  purchase_roas?: MetaActionValue[];
  results?: MetaResultValue[];
}

export interface MetaInsightSet {
  campaigns: MetaInsight[];
  adsets: MetaInsight[];
  ads: MetaInsight[];
}

export interface MetaSnapshot {
  campaigns: MetaCampaign[];
  adsets: MetaAdSet[];
  ads: MetaAd[];
  insights: Record<AdRange, MetaInsightSet>;
}

// ---- What AEGIS stores ------------------------------------------------------

export const AD_RANGE_KEYS: AdRange[] = ["last_7d", "last_30d", "maximum"];

/** The range whose figures fill the flat metric fields on a stored row. */
export const DEFAULT_AD_RANGE: AdRange = "last_30d";

export type MetaRowDraft = Omit<AdRow, "businessId"> & {
  source: "meta";
  campaignId: string;
  metrics: Record<AdRange, AdMetrics>;
};

// ---- Money ------------------------------------------------------------------

/** Meta reports spend as a decimal string in the account currency: "1234.56". */
export function decimalToMinor(value: string | undefined): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

/** Budgets already arrive in minor units, as strings: "50000" is 500.00. */
export function minorFromString(value: string | undefined): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount) : 0;
}

function count(value: string | undefined): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount) : 0;
}

// ---- State ------------------------------------------------------------------

/**
 * Meta's `effective_status` into the six states the screen knows. The row's
 * own on/off switch is `enabled`, taken from `status`; a switched-off row reads
 * as Paused regardless (`displayState` in `src/lib/ads.ts`).
 */
export function mapState(effective: string | undefined, learning?: string): AdState {
  switch (effective) {
    case "ACTIVE":
      return learning === "LEARNING" ? "Learning" : "Active";
    case "PENDING_REVIEW":
    case "IN_PROCESS":
    case "PREAPPROVED":
      return "In review";
    case "DISAPPROVED":
    case "WITH_ISSUES":
    case "PENDING_BILLING_INFO":
      return "Rejected";
    case "COMPLETED":
      return "Completed";
    default:
      // PAUSED, CAMPAIGN_PAUSED, ADSET_PAUSED, and anything Meta adds later.
      return "Paused";
  }
}

// ---- Results ----------------------------------------------------------------

interface ResultKind {
  label: string;
  /** Action types to look for, in order; the first one present is used. */
  actionTypes: string[];
  /** Read from an insight field rather than the actions list. */
  field?: "reach" | "impressions";
}

/**
 * What a "result" is, by ad set optimisation goal. The first action type found
 * wins — Meta reports the same lead under several action types, so adding them
 * up would count one lead two or three times.
 */
const GOAL_RESULTS: Record<string, ResultKind> = {
  LINK_CLICKS: { label: "link clicks", actionTypes: ["link_click"] },
  LANDING_PAGE_VIEWS: { label: "landing page views", actionTypes: ["landing_page_view"] },
  LEAD_GENERATION: {
    label: "leads",
    actionTypes: ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"],
  },
  QUALITY_LEAD: {
    label: "leads",
    actionTypes: ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"],
  },
  OFFSITE_CONVERSIONS: {
    label: "purchases",
    actionTypes: ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"],
  },
  VALUE: {
    label: "purchases",
    actionTypes: ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"],
  },
  POST_ENGAGEMENT: { label: "post engagements", actionTypes: ["post_engagement"] },
  PAGE_LIKES: { label: "page likes", actionTypes: ["like"] },
  CONVERSATIONS: {
    label: "conversations",
    actionTypes: ["onsite_conversion.messaging_conversation_started_7d"],
  },
  REACH: { label: "people reached", actionTypes: [], field: "reach" },
  IMPRESSIONS: { label: "impressions", actionTypes: [], field: "impressions" },
};

/** Used for a campaign with no ad sets yet, when there is no goal to go on. */
const OBJECTIVE_GOALS: Record<string, string> = {
  OUTCOME_TRAFFIC: "LINK_CLICKS",
  OUTCOME_LEADS: "LEAD_GENERATION",
  OUTCOME_SALES: "OFFSITE_CONVERSIONS",
  OUTCOME_AWARENESS: "REACH",
  OUTCOME_ENGAGEMENT: "POST_ENGAGEMENT",
};

const MIXED = "mixed results";

function humanise(value: string | undefined): string {
  if (!value) return "";
  const words = value.replace(/^OUTCOME_/, "").toLowerCase().split("_");
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function resultKind(goal: string | null): ResultKind | null {
  if (!goal) return null;
  return GOAL_RESULTS[goal] ?? { label: humanise(goal).toLowerCase(), actionTypes: [] };
}

/**
 * Meta's own `results` field, when the API version returns it. It already
 * applies Meta's definition of a result for the row, which is exactly what Ads
 * Manager shows, so it is preferred over working it out from `actions`.
 */
function metaResults(insight: MetaInsight): number | null {
  if (!insight.results || insight.results.length === 0) return null;
  let total = 0;
  let found = false;
  for (const result of insight.results) {
    for (const entry of result.values ?? []) {
      const value = Number(entry.value);
      if (Number.isFinite(value)) {
        total += value;
        found = true;
      }
    }
  }
  return found ? Math.round(total) : null;
}

function resultsFor(insight: MetaInsight | undefined, kind: ResultKind | null): number {
  if (!insight || !kind) return 0;

  const reported = metaResults(insight);
  if (reported !== null) return reported;

  if (kind.field) return count(insight[kind.field]);
  for (const type of kind.actionTypes) {
    const match = insight.actions?.find((action) => action.action_type === type);
    if (match) return count(match.value);
  }
  return 0;
}

function metricsFor(
  insight: MetaInsight | undefined,
  kind: ResultKind | null,
  mixed: boolean,
): AdMetrics {
  const roas = Number(insight?.purchase_roas?.[0]?.value);
  return {
    spendCents: decimalToMinor(insight?.spend),
    // A campaign whose ad sets chase different results has no single number
    // that means anything — adding clicks to leads would be invented. It shows
    // "mixed results" and the ad sets underneath carry the real figures.
    results: mixed ? 0 : resultsFor(insight, kind),
    resultLabel: mixed ? MIXED : (kind?.label ?? ""),
    roas: Number.isFinite(roas) ? Math.round(roas * 100) / 100 : 0,
    reach: count(insight?.reach),
    impressions: count(insight?.impressions),
  };
}

// ---- Descriptions -----------------------------------------------------------

function formatDate(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function schedule(start?: string, end?: string): string {
  const from = formatDate(start);
  const to = formatDate(end);
  if (from && to) return `${from} – ${to}`;
  if (from) return `Ongoing since ${from}`;
  return "";
}

function audience(targeting: MetaTargeting | undefined): string {
  if (!targeting) return "";
  const parts: string[] = [];

  const countries = targeting.geo_locations?.countries ?? [];
  const cities = (targeting.geo_locations?.cities ?? [])
    .map((city) => city.name)
    .filter(Boolean) as string[];
  if (cities.length) parts.push(cities.slice(0, 3).join(", "));
  else if (countries.length) parts.push(countries.join(", "));

  if (targeting.age_min || targeting.age_max) {
    parts.push(`${targeting.age_min ?? 18}–${targeting.age_max ?? "65+"}`);
  }
  if (targeting.genders?.length === 1) {
    parts.push(targeting.genders[0] === 1 ? "Men" : "Women");
  }
  return parts.join(" · ");
}

function placements(targeting: MetaTargeting | undefined): string {
  const platforms = targeting?.publisher_platforms;
  if (!platforms || platforms.length === 0) return "Advantage+ placements";
  return platforms.map(humanise).join(", ");
}

function budget(
  daily: string | undefined,
  lifetime: string | undefined,
): Pick<AdRow, "budgetType" | "budgetCents"> {
  if (daily && Number(daily) > 0) {
    return { budgetType: "Daily", budgetCents: minorFromString(daily) };
  }
  if (lifetime && Number(lifetime) > 0) {
    return { budgetType: "Lifetime", budgetCents: minorFromString(lifetime) };
  }
  return { budgetType: "", budgetCents: 0 };
}

function learningNote(adset: MetaAdSet | undefined): string {
  switch (adset?.learning_stage_info?.status) {
    case "LEARNING":
      return "Learning phase";
    case "FAIL":
      return "Learning limited";
    case "SUCCESS":
      return "Learning complete";
    default:
      return "";
  }
}

// ---- The mapping ------------------------------------------------------------

function byId(list: MetaInsight[], key: "campaign_id" | "adset_id" | "ad_id") {
  const map = new Map<string, MetaInsight>();
  for (const insight of list) {
    const id = insight[key];
    if (id) map.set(id, insight);
  }
  return map;
}

function metricsByRange(
  snapshot: MetaSnapshot,
  level: AdLevel,
  id: string,
  kind: ResultKind | null,
  mixed: boolean,
): Record<AdRange, AdMetrics> {
  const key = level === "campaigns" ? "campaign_id" : level === "adsets" ? "adset_id" : "ad_id";
  const result = {} as Record<AdRange, AdMetrics>;
  for (const range of AD_RANGE_KEYS) {
    const insight = byId(snapshot.insights[range][level], key).get(id);
    result[range] = metricsFor(insight, kind, mixed);
  }
  return result;
}

/**
 * Every campaign, ad set and ad in the snapshot as a stored row. The flat
 * metric fields carry the default range, so a row is complete on its own.
 */
export function mapSnapshot(snapshot: MetaSnapshot): MetaRowDraft[] {
  const campaignsById = new Map(snapshot.campaigns.map((c) => [c.id, c]));
  const adsetsById = new Map(snapshot.adsets.map((a) => [a.id, a]));
  const rows: MetaRowDraft[] = [];

  const flat = (metrics: Record<AdRange, AdMetrics>) => metrics[DEFAULT_AD_RANGE];

  for (const campaign of snapshot.campaigns) {
    const goals = new Set(
      snapshot.adsets
        .filter((adset) => adset.campaign_id === campaign.id)
        .map((adset) => adset.optimization_goal)
        .filter(Boolean) as string[],
    );
    const mixed = goals.size > 1;
    const goal =
      goals.size === 1 ? [...goals][0] : (OBJECTIVE_GOALS[campaign.objective ?? ""] ?? null);
    const metrics = metricsByRange(snapshot, "campaigns", campaign.id, resultKind(goal), mixed);

    rows.push({
      id: campaign.id,
      source: "meta",
      campaignId: campaign.id,
      level: "campaigns",
      name: campaign.name,
      parent: "",
      objective: humanise(campaign.objective),
      state: mapState(campaign.effective_status),
      enabled: campaign.status === "ACTIVE",
      ...budget(campaign.daily_budget, campaign.lifetime_budget),
      ...flat(metrics),
      metrics,
      audience: "",
      placements: "",
      schedule: schedule(campaign.start_time, campaign.stop_time),
      learning: "",
      optimization: goal ? `Optimizing for ${resultKind(goal)?.label}` : "",
      format: "",
      primary: "",
      headline: "",
      cta: "",
    });
  }

  for (const adset of snapshot.adsets) {
    const campaign = campaignsById.get(adset.campaign_id);
    const kind = resultKind(adset.optimization_goal ?? null);
    const metrics = metricsByRange(snapshot, "adsets", adset.id, kind, false);

    rows.push({
      id: adset.id,
      source: "meta",
      campaignId: adset.campaign_id,
      level: "adsets",
      name: adset.name,
      parent: campaign?.name ?? "",
      objective: humanise(campaign?.objective),
      state: mapState(adset.effective_status, adset.learning_stage_info?.status),
      enabled: adset.status === "ACTIVE",
      ...budget(adset.daily_budget, adset.lifetime_budget),
      ...flat(metrics),
      metrics,
      audience: audience(adset.targeting),
      placements: placements(adset.targeting),
      schedule: schedule(adset.start_time, adset.end_time),
      learning: learningNote(adset),
      optimization: kind
        ? `Optimizing for ${kind.label}${adset.bid_strategy ? ` · ${humanise(adset.bid_strategy).toLowerCase()}` : ""}`
        : "",
      format: "",
      primary: "",
      headline: "",
      cta: "",
    });
  }

  for (const ad of snapshot.ads) {
    const adset = adsetsById.get(ad.adset_id);
    const campaign = campaignsById.get(ad.campaign_id);
    const kind = resultKind(adset?.optimization_goal ?? null);
    const metrics = metricsByRange(snapshot, "ads", ad.id, kind, false);

    rows.push({
      id: ad.id,
      source: "meta",
      campaignId: ad.campaign_id,
      level: "ads",
      name: ad.name,
      parent: adset?.name ?? "",
      objective: humanise(campaign?.objective),
      state: mapState(ad.effective_status, adset?.learning_stage_info?.status),
      enabled: ad.status === "ACTIVE",
      // Ads inherit their budget from the ad set.
      budgetType: "",
      budgetCents: 0,
      ...flat(metrics),
      metrics,
      audience: audience(adset?.targeting),
      placements: placements(adset?.targeting),
      schedule: schedule(adset?.start_time, adset?.end_time),
      learning: learningNote(adset),
      optimization: kind ? `Optimizing for ${kind.label}` : "",
      format: humanise(ad.creative?.object_type),
      primary: ad.creative?.body ?? "",
      headline: ad.creative?.title ?? "",
      cta: humanise(ad.creative?.call_to_action_type),
    });
  }

  return rows;
}
