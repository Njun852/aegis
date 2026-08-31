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
  /** Spend-weighted, so a big cheap campaign cannot be outvoted by a tiny one. */
  roas: number;
  costPerResultCents: number;
  /** Sum of daily budgets across campaigns currently switched on. */
  dailyBudgetCents: number;
  spentTodayCents: number;
}

/**
 * Account-level figures. Campaigns only — ad sets and ads restate the same
 * spend one tier down, so counting every level would multiply the totals.
 */
export function accountTotals(rows: AdRow[]): AdAccountTotals {
  const campaigns = rowsAtLevel(rows, "campaigns");

  const spendCents = campaigns.reduce((sum, row) => sum + row.spendCents, 0);
  const results = campaigns.reduce((sum, row) => sum + row.results, 0);
  const weighted = campaigns.reduce(
    (sum, row) => sum + row.spendCents * row.roas,
    0,
  );
  const dailyBudgetCents = campaigns
    .filter((row) => row.budgetType === "Daily" && row.enabled)
    .reduce((sum, row) => sum + row.budgetCents, 0);

  return {
    spendCents,
    results,
    roas: spendCents ? weighted / spendCents : 0,
    costPerResultCents: results ? Math.round(spendCents / results) : 0,
    dailyBudgetCents,
    spentTodayCents: Math.round(dailyBudgetCents * AD_PACING_FRACTION),
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
