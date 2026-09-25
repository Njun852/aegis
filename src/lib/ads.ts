import {
  AD_PACING_FRACTION,
  AD_PLACEMENT_MIX,
  AD_STATE_STYLES,
} from "@/lib/data/ads";
import type { AdLevel, AdRow, AdState, AdStateFilter } from "@/types";

/**
 * Pure helpers over ad rows the server already loaded and tenant-scoped.
 * Database access lives in `src/lib/dal/ads.ts` — nothing here touches Mongo,
 * so these are safe in client components.
 */

/**
 * What the row's badge says. A row that is switched off reads as Paused
 * whatever the platform's own state is, because that is what a person just did
 * to it — the underlying state is what it would return to when switched back on.
 */
export function displayState(row: Pick<AdRow, "state" | "enabled">): AdState {
  return row.enabled ? row.state : "Paused";
}

export function getStateStyle(state: AdState) {
  return AD_STATE_STYLES[state];
}

export function rowsAtLevel(rows: AdRow[], level: AdLevel) {
  return rows.filter((row) => row.level === level);
}

export interface AdFilter {
  level: AdLevel;
  state?: AdStateFilter;
  search?: string;
}

export function filterAds(
  rows: AdRow[],
  { level, state = "All", search = "" }: AdFilter,
) {
  const term = search.trim().toLowerCase();

  return rowsAtLevel(rows, level).filter((row) => {
    if (state !== "All" && displayState(row) !== state) return false;
    if (!term) return true;
    return (
      row.name.toLowerCase().includes(term) ||
      row.id.toLowerCase().includes(term) ||
      row.objective.toLowerCase().includes(term) ||
      row.parent.toLowerCase().includes(term) ||
      row.audience.toLowerCase().includes(term)
    );
  });
}

export function countByState(rows: AdRow[], state: AdStateFilter) {
  if (state === "All") return rows.length;
  return rows.filter((row) => displayState(row) === state).length;
}

export function costPerResultCents(row: Pick<AdRow, "spendCents" | "results">) {
  return row.results ? Math.round(row.spendCents / row.results) : 0;
}

export interface AdAccountTotals {
  spendCents: number;
  results: number;
  /**
   * What the account-level results count, when every delivering campaign
   * counts the same thing. Null when they differ — leads plus link clicks is
   * not a number that means anything.
   */
  resultLabel: string | null;
  /** Spend-weighted, so a big cheap campaign cannot be outvoted by a tiny one. */
  roas: number;
  costPerResultCents: number;
  /** Sum of daily budgets currently switched on. */
  dailyBudgetCents: number;
  spentTodayCents: number;
}

/** What only a live account can supply. Absent for sample data. */
export interface LiveAccountFacts {
  /** Today's spend as Meta reported it at the last sync. */
  spentTodayCents: number | null;
}

/**
 * Account-level figures. Campaigns only — ad sets and ads restate the same
 * spend one tier down, so counting every level would multiply the totals.
 *
 * Sample data keeps the design's behaviour: results summed across objectives
 * (the screen labels them "mixed objectives") and today's spend drawn from a
 * fixed pacing fraction. A live account is held to the real rules:
 *
 * - Results and cost per result are totalled only when every campaign that
 *   delivered counts the same kind of result; otherwise they are withheld.
 * - The daily budget includes ad-set budgets, because most real accounts
 *   budget at the ad-set level and would otherwise read as having none.
 * - Today's spend is Meta's figure, not an estimate.
 */
export function accountTotals(rows: AdRow[], live?: LiveAccountFacts): AdAccountTotals {
  const campaigns = rowsAtLevel(rows, "campaigns");

  const spendCents = campaigns.reduce((sum, row) => sum + row.spendCents, 0);
  const weighted = campaigns.reduce(
    (sum, row) => sum + row.spendCents * row.roas,
    0,
  );
  const roas = spendCents ? weighted / spendCents : 0;
  const campaignDaily = campaigns
    .filter((row) => row.budgetType === "Daily" && row.enabled)
    .reduce((sum, row) => sum + row.budgetCents, 0);

  if (!live) {
    const results = campaigns.reduce((sum, row) => sum + row.results, 0);
    return {
      spendCents,
      results,
      resultLabel: null,
      roas,
      costPerResultCents: results ? Math.round(spendCents / results) : 0,
      dailyBudgetCents: campaignDaily,
      spentTodayCents: Math.round(campaignDaily * AD_PACING_FRACTION),
    };
  }

  const delivering = campaigns.filter((row) => row.spendCents > 0 || row.results > 0);
  const labels = new Set(delivering.map((row) => row.resultLabel));
  const comparable = labels.size <= 1 && !labels.has("mixed results");
  const results = comparable ? delivering.reduce((sum, row) => sum + row.results, 0) : 0;
  const deliveringSpend = delivering.reduce((sum, row) => sum + row.spendCents, 0);

  // Ad sets carry the budget when their campaign has none — but only inside a
  // campaign that is switched on. An ad set left on inside a paused campaign
  // cannot spend, and counting it overstated the first real account's daily
  // budget by more than half. Matched by name, which is what an ad set row
  // records of its parent.
  const unbudgeted = new Set(
    campaigns
      .filter((row) => row.budgetType === "" && row.enabled)
      .map((row) => row.name),
  );
  const adsetDaily = rowsAtLevel(rows, "adsets")
    .filter(
      (row) => row.budgetType === "Daily" && row.enabled && unbudgeted.has(row.parent),
    )
    .reduce((sum, row) => sum + row.budgetCents, 0);

  return {
    spendCents,
    results,
    resultLabel: comparable ? ([...labels][0] ?? null) : null,
    roas,
    costPerResultCents: comparable && results ? Math.round(deliveringSpend / results) : 0,
    dailyBudgetCents: campaignDaily + adsetDaily,
    spentTodayCents: live.spentTodayCents ?? 0,
  };
}

/** How far through the day's budget the account is, 0–100. */
export function pacingPercent(totals: AdAccountTotals) {
  if (!totals.dailyBudgetCents) return 0;
  return Math.min(
    100,
    Math.round((totals.spentTodayCents / totals.dailyBudgetCents) * 100),
  );
}

export interface AdPlacementRow {
  label: string;
  share: number;
  spendCents: number;
  fill: string;
}

/** The drawer's placement breakdown, with this row's spend split across it. */
export function placementBreakdown(row: AdRow): AdPlacementRow[] {
  return AD_PLACEMENT_MIX.map((placement) => ({
    label: placement.label,
    share: placement.share,
    spendCents: Math.round((row.spendCents * placement.share) / 100),
    fill:
      placement.share >= 40
        ? "var(--accent-primary)"
        : placement.share >= 20
          ? "var(--blue-400)"
          : "var(--blue-200)",
  }));
}

/** "3.8x", or an em dash where nothing has delivered yet. */
export function formatRoas(roas: number) {
  return roas ? `${roas.toFixed(1)}x` : "—";
}

export function formatCount(value: number) {
  return value.toLocaleString("en-US");
}

/** Impressions per person reached. Blank when nothing has delivered. */
export function frequency(row: Pick<AdRow, "impressions" | "reach">) {
  if (!row.impressions) return null;
  return row.reach ? (row.impressions / row.reach).toFixed(2) : "0";
}
