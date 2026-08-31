/** Meta's three-tier hierarchy. The table shows one tier at a time. */
export type AdLevel = "campaigns" | "adsets" | "ads";

/**
 * Delivery state as the ad platform reports it. This is what the row *would*
 * be doing if it were switched on — the displayed status also folds in the
 * row's own on/off toggle, which is why `displayState` exists.
 */
export type AdState =
  | "Active"
  | "Learning"
  | "In review"
  | "Paused"
  | "Rejected"
  | "Completed";

export type AdStateFilter = "All" | AdState;

export interface AdStateStyle {
  tone: "positive" | "accent" | "warning" | "neutral" | "negative";
  dot: string;
}

export interface AdLevelDefinition {
  key: AdLevel;
  /** Tab label — plural. */
  label: string;
  /** Column heading for the name column — singular. */
  column: string;
  icon: string;
}

/**
 * A campaign, ad set or ad. One shape for all three tiers, because the table
 * and the drawer render them identically; `level` and `parent` are what place a
 * row in the hierarchy.
 */
export interface AdRow {
  id: string;
  businessId: string;
  level: AdLevel;
  name: string;
  /** Name of the row one tier up. Empty for campaigns. */
  parent: string;
  objective: string;
  state: AdState;
  /** The row's own switch. Off shows as Paused whatever `state` says. */
  enabled: boolean;
  /** Empty at the ad tier, where budget is inherited from the ad set. */
  budgetType: "Daily" | "Lifetime" | "";
  budgetCents: number;
  spendCents: number;
  results: number;
  /** What a result means here: "leads", "purchases", "link clicks". */
  resultLabel: string;
  roas: number;
  reach: number;
  impressions: number;
  audience: string;
  placements: string;
  schedule: string;
  /** The delivery note Meta shows: learning phase, rejection reason, etc. */
  learning: string;
  optimization: string;
  format: string;
  /** Creative preview: body text, headline, call-to-action label. */
  primary: string;
  headline: string;
  cta: string;
}

/** Stored shape. `businessId` is stamped on by `tenantScope`. */
export interface AdRowDocument extends Omit<AdRow, "businessId"> {
  businessId: string;
  createdAt: Date;
  updatedAt: Date;
}

/** One row of the drawer's placement breakdown. */
export interface AdPlacementShare {
  label: string;
  /** Percentage of spend, 0–100. */
  share: number;
}

/** The connected ad account, as the connection strip reports it. */
export interface AdAccount {
  account: string;
  page: string;
  instagram: string;
  pixel: string;
  attribution: string;
}
