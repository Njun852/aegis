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

/**
 * Where a row came from. Sample rows are the seeded design fixtures; Meta rows
 * are a read-only copy of a connected ad account. A business shows one or the
 * other, never both, so a sample figure can never sit beside a real one.
 */
export type AdSource = "meta" | "sample";

/** The date ranges a sync pulls, named as Meta's `date_preset` names them. */
export type AdRange = "today" | "yesterday" | "last_7d" | "last_30d" | "maximum";

/** The two single-day ranges, whose figures belong to one calendar day. */
export type AdDayRange = "today" | "yesterday";

/** What the last sync read for one single-day range. */
export interface AdDayReport {
  /** "2026-10-19": the calendar day Meta reported, in the ad account's time zone. */
  date: string;
  /**
   * Campaigns, ad sets and ads Meta reported spend or impressions on for that
   * day. Zero means Meta reported no delivery for the day, which early in a day
   * usually means it has not reported it yet.
   */
  rows: number;
}

export type AdDayReports = Record<AdDayRange, AdDayReport>;

/** Performance over one date range. Money in the account's minor units. */
export interface AdMetrics {
  spendCents: number;
  results: number;
  /** What a result means here: "leads", "link clicks", or "mixed results". */
  resultLabel: string;
  roas: number;
  reach: number;
  impressions: number;
}

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
  source: AdSource;
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

/**
 * Stored shape. `businessId` is stamped on by `tenantScope`.
 *
 * `source` is optional because rows seeded before it existed are samples. Meta
 * rows carry `metrics` for every synced range; the flat metric fields on them
 * hold the last-30-days figures, so anything reading the flat fields still gets
 * a sensible answer.
 */
export interface AdRowDocument extends Omit<AdRow, "businessId" | "source"> {
  businessId: string;
  source?: AdSource;
  /**
   * The Meta campaign this row belongs to, on every Meta row including ad sets
   * and ads. A Messenger chat names the ad it came from, and this is what turns
   * that into the campaign the chat is credited to.
   */
  campaignId?: string;
  metrics?: Record<AdRange, AdMetrics>;
  createdAt: Date;
  updatedAt: Date;
}

/** One row of the drawer's placement breakdown. */
export interface AdPlacementShare {
  label: string;
  /** Percentage of spend, 0–100. */
  share: number;
}

/**
 * A connected Meta ad account, as stored on the business.
 *
 * The access token is held encrypted (`src/lib/auth/secrets.ts`) and never
 * leaves the server: no read path returns `secretCipher` to a browser.
 */
export interface MetaAdsConfig {
  /** Always `act_` followed by digits. */
  adAccountId: string;
  secretCipher: string;
  /** Read from Meta when the connection was saved or last tested. */
  accountName: string;
  /** ISO 4217, e.g. "PHP". Every amount on the screen is in this currency. */
  currency: string;
  timezone: string;
  /**
   * Whether the token also holds `ads_management`, as `/me/permissions`
   * reported it. AEGIS never writes either way; this only drives the warning
   * that a read-only token would be safer. Null when Meta would not say.
   */
  canWrite: boolean | null;
  /** The Facebook Page whose Messenger chats belong to this business. */
  pageId?: string;
  pageName?: string;
  /** The Page access token, AES-256-GCM encrypted. Server-only, always. */
  pageSecretCipher?: string;
  updatedAt: Date;
}

/** Where the last ads sync got to, kept apart from the business record. */
export interface AdSyncDocument {
  businessId: string;
  /** Last run that completed and wrote rows. Failures never move this. */
  lastSyncAt: Date | null;
  /** Last run of any outcome — the cooldown is measured from here. */
  lastAttemptAt: Date | null;
  lastOutcome: string | null;
  lastError: string | null;
  lastErrorAt: Date | null;
  /** The last successful sync hit the page cap, so some rows may be missing. */
  truncated: boolean;
  rowCount: number;
  /** Today's account spend at the last sync, for the pacing bar. Minor units. */
  spentTodayCents: number | null;
  /** Which days the last sync's Today and Yesterday figures cover. Absent before those ranges existed. */
  days?: AdDayReports | null;
}

/** A synced Meta campaign, as the booking form's Ad source picker offers it. */
export interface AdCampaignOption {
  id: string;
  name: string;
  enabled: boolean;
}

/** One Messenger chat, as the inbox lists it. */
export interface MessengerConversation {
  psid: string;
  /** "Messenger customer · 4821" until the customer gives a name in a booking. */
  label: string;
  campaignId: string | null;
  campaignName: string | null;
  adId: string | null;
  firstSeen: string;
  lastMessage: string;
  lastMessageAt: string;
  messages: { mid: string; text: string; at: string; fromPage: boolean }[];
  /** Bookings already made from this chat, newest first. */
  bookings: { ref: string; status: string; day: string }[];
}

/**
 * One campaign from Meta spend to confirmed bookings, over one period. Kept
 * apart from Meta's own result figures: conversations are Meta's count,
 * bookings are AEGIS's, and the two are only ever divided, never added.
 */
export interface CampaignFunnelRow {
  campaignId: string;
  name: string;
  enabled: boolean;
  spendCents: number;
  /** Meta's "messaging conversations started". Null when the campaign is optimised for something else. */
  conversations: number | null;
  costPerConversationCents: number | null;
  /** Staff-confirmed bookings credited to the campaign, made in the period. Cancelled and unconfirmed are left out. */
  confirmedBookings: number;
  costPerBookingCents: number | null;
  /** Confirmed bookings / conversations × 100, one decimal. */
  conversionPercent: number | null;
  /** Chats AEGIS received from this campaign's ads in the period, for audit. */
  chatsReceived: number;
  flag: { tone: "warning" | "positive"; text: string } | null;
}

/** A booking credited to a campaign, for the drill-down. */
export interface CampaignBooking {
  ref: string;
  campaignId: string;
  customer: string;
  service: string;
  status: string;
  /** Whether it counts toward Confirmed Bookings. */
  counted: boolean;
  origin: "messenger" | "manual";
  /** "Sep 14", when it was made. */
  madeDay: string;
}

export interface CampaignFunnel {
  /** "Sep 4 – Oct 3, 2026", or "All time". The same days for spend, conversations and bookings. */
  periodLabel: string;
  rows: CampaignFunnelRow[];
  totals: {
    spendCents: number;
    conversations: number | null;
    confirmedBookings: number;
    costPerBookingCents: number | null;
    conversionPercent: number | null;
  };
  bookings: CampaignBooking[];
  /** Confirmed bookings made in the period with no campaign: walk-ins, calls, organic chats. */
  uncreditedConfirmed: number;
  /**
   * Set for a single day Meta has no figures for in AEGIS: not synced since the
   * day began, or Meta has not reported it yet. Spend, conversations and cost
   * per booking are then unknown, and the panel says so instead of showing zero.
   */
  missingFigures: string | null;
}

/** What screens may know about a Meta connection. Never the token. */
export interface MetaAdsStatus {
  connected: boolean;
  adAccountId: string | null;
  accountName: string | null;
  currency: string | null;
  timezone: string | null;
  updatedAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  truncated: boolean;
  rowCount: number;
  spentTodayCents: number | null;
  /** Which days the last sync's Today and Yesterday figures cover. */
  days: AdDayReports | null;
  /** Set by a connection test when the token can also change ads. */
  canWrite: boolean | null;
  /** The Page whose chats arrive by webhook, when one is connected. */
  pageId: string | null;
  pageName: string | null;
  /** Whether a Page token is stored. The token itself never leaves the server. */
  pageTokenStored: boolean;
  /** Last delivery Meta successfully signed, ISO 8601. */
  lastEventAt: string | null;
  /** Last delivery rejected because its signature did not match. */
  lastSignatureFailureAt: string | null;
  conversationCount: number;
}

/** One Messenger chat with the Page, as stored. */
export interface MessengerMessage {
  mid: string;
  text: string;
  at: Date;
  /** True for the Page's own replies, kept as context and never acted on. */
  fromPage: boolean;
}

export interface MessengerConversationDocument {
  businessId: string;
  /** Page-scoped id of the customer. Meaningless outside this Page. */
  psid: string;
  pageId: string;
  name: string | null;
  /** Newest last, capped so one long chat cannot grow without bound. */
  messages: MessengerMessage[];
  /** The ad that started the chat, and what it belongs to. Null when organic. */
  adId: string | null;
  campaignId: string | null;
  campaignName: string | null;
  referralSource: string | null;
  firstSeenAt: Date;
  lastMessageAt: Date;
}

/** Webhook health for one business, for the admin panel and System Status. */
export interface MessengerStateDocument {
  businessId: string;
  lastEventAt: Date | null;
  lastSignatureFailureAt: Date | null;
}

/** The connected ad account, as the connection strip reports it. */
export interface AdAccount {
  account: string;
  page: string;
  instagram: string;
  pixel: string;
  attribution: string;
}
