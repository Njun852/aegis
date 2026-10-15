import type { AdRow, CampaignBooking, CampaignFunnel, CampaignFunnelRow } from "@/types";

/**
 * Pure maths for the Ads screen's campaign funnel: Meta spend, Meta
 * conversations, AEGIS confirmed bookings, and what one costs per the other.
 * Meta's figures and AEGIS's are only ever divided, never added together, and
 * each keeps its own label, so incompatible result types never mix.
 *
 * Nothing here touches the database; `scripts/booking-attribution-check.ts`
 * proves it, including the owner's own example.
 */

/** The result label Meta's mapping gives a campaign optimised for Messenger conversations. */
export const CONVERSATION_RESULT = "conversations";

/** Flag thresholds against the account's own figures for the period. */
const HIGH_COST_FACTOR = 1.5;
const LOW_COST_FACTOR = 0.6;
const WEAK_CONVERSION_FACTOR = 0.5;
/** Too few to judge: a single booking makes any campaign look best or worst. */
const MIN_BOOKINGS_TO_PRAISE = 3;
const MIN_CONVERSATIONS_TO_JUDGE = 20;

export function costPer(spendCents: number, count: number | null): number | null {
  if (count === null || count <= 0) return null;
  return Math.round(spendCents / count);
}

/** Confirmed bookings / conversations × 100, one decimal. */
export function conversionPercent(bookings: number, conversations: number | null): number | null {
  if (conversations === null || conversations <= 0) return null;
  return Math.round((bookings / conversations) * 1000) / 10;
}

/**
 * "Sep 4 – Oct 3, 2026": the days a Meta preset covers, in the ad account's
 * time zone. `to` is exclusive (the start of today), so the last day shown is
 * the day before it. Null bounds are Meta's whole account history.
 */
export function periodLabel(from: Date | null, to: Date | null, timeZone: string): string {
  if (!from || !to) return "All time";
  let zone = timeZone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    zone = "UTC";
  }
  const last = new Date(to.getTime() - 1);
  const parts = (date: Date) => {
    const fields = new Intl.DateTimeFormat("en-US", { timeZone: zone, month: "short", day: "numeric", year: "numeric" }).formatToParts(date);
    const get = (type: string) => fields.find((part) => part.type === type)?.value ?? "";
    return { month: get("month"), day: get("day"), year: get("year") };
  };
  const start = parts(from);
  const end = parts(last);
  return start.year === end.year
    ? `${start.month} ${start.day} – ${end.month} ${end.day}, ${end.year}`
    : `${start.month} ${start.day}, ${start.year} – ${end.month} ${end.day}, ${end.year}`;
}

export interface FunnelInput {
  /** Campaign-level rows for the period, as the Ads table shows them. */
  campaigns: Pick<AdRow, "id" | "name" | "enabled" | "spendCents" | "results" | "resultLabel">[];
  confirmedByCampaign: Record<string, number>;
  chatsByCampaign: Record<string, number>;
  bookings: CampaignBooking[];
  uncreditedConfirmed: number;
  periodLabel: string;
}

export function buildFunnel(input: FunnelInput): CampaignFunnel {
  const rows: CampaignFunnelRow[] = input.campaigns.map((campaign) => {
    const conversations = campaign.resultLabel === CONVERSATION_RESULT ? campaign.results : null;
    const confirmed = input.confirmedByCampaign[campaign.id] ?? 0;
    return {
      campaignId: campaign.id,
      name: campaign.name,
      enabled: campaign.enabled,
      spendCents: campaign.spendCents,
      conversations,
      costPerConversationCents: costPer(campaign.spendCents, conversations),
      confirmedBookings: confirmed,
      costPerBookingCents: costPer(campaign.spendCents, confirmed),
      conversionPercent: conversionPercent(confirmed, conversations),
      chatsReceived: input.chatsByCampaign[campaign.id] ?? 0,
      flag: null,
    };
  });

  const spendCents = rows.reduce((sum, row) => sum + row.spendCents, 0);
  const confirmedBookings = rows.reduce((sum, row) => sum + row.confirmedBookings, 0);
  const withConversations = rows.filter((row) => row.conversations !== null);
  const conversations = withConversations.length
    ? withConversations.reduce((sum, row) => sum + (row.conversations ?? 0), 0)
    : null;
  // Conversion over the campaigns that report conversations only, so a
  // traffic campaign's bookings do not inflate the rate.
  const convertedFromConversations = withConversations.reduce((sum, row) => sum + row.confirmedBookings, 0);

  const totals = {
    spendCents,
    conversations,
    confirmedBookings,
    costPerBookingCents: costPer(spendCents, confirmedBookings),
    conversionPercent: conversionPercent(convertedFromConversations, conversations),
  };

  return {
    periodLabel: input.periodLabel,
    rows: flagCampaigns(rows, totals),
    totals,
    bookings: input.bookings,
    uncreditedConfirmed: input.uncreditedConfirmed,
  };
}

/**
 * At most one flag per campaign, the most useful first: money spent with no
 * bookings, then an unusually high cost per booking, then weak conversion,
 * then a campaign clearly doing better than the rest. Judged against the
 * account's own period figures, and only with enough volume to mean anything.
 */
export function flagCampaigns(
  rows: CampaignFunnelRow[],
  totals: Pick<CampaignFunnel["totals"], "costPerBookingCents" | "conversionPercent">,
): CampaignFunnelRow[] {
  const average = totals.costPerBookingCents;
  const conversion = totals.conversionPercent;
  const judged = rows.filter((row) => row.spendCents > 0).length;
  return rows.map((row) => {
    let flag: CampaignFunnelRow["flag"] = null;
    if (average !== null && judged > 1) {
      if (row.confirmedBookings === 0 && row.spendCents >= 2 * average) {
        flag = { tone: "warning", text: "Spending with no confirmed bookings" };
      } else if (row.costPerBookingCents !== null && row.costPerBookingCents > average * HIGH_COST_FACTOR) {
        flag = {
          tone: "warning",
          text: `Cost per booking ${(row.costPerBookingCents / average).toFixed(1)}× the account average`,
        };
      } else if (
        conversion !== null &&
        row.conversionPercent !== null &&
        (row.conversations ?? 0) >= MIN_CONVERSATIONS_TO_JUDGE &&
        row.conversionPercent < conversion * WEAK_CONVERSION_FACTOR
      ) {
        flag = { tone: "warning", text: `Weak conversion: ${row.conversionPercent}% against ${conversion}% overall` };
      } else if (
        row.costPerBookingCents !== null &&
        row.confirmedBookings >= MIN_BOOKINGS_TO_PRAISE &&
        row.costPerBookingCents <= average * LOW_COST_FACTOR
      ) {
        flag = { tone: "positive", text: "Bookings well below the account's average cost" };
      }
    }
    return { ...row, flag };
  });
}
