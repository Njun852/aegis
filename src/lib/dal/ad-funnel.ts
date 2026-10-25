import "server-only";

import { buildFunnel, periodLabel } from "@/lib/ad-funnel";
import { dayFigures, isDayRange, windowForRange } from "@/lib/meta/ranges";
import { readActiveMetaAdsStatus } from "./ad-account";
import { listAdRows } from "./ads";
import { countConfirmedByCampaign, countUncreditedConfirmed, listCampaignBookings } from "./bookings";
import { countChatsByCampaign } from "./messenger";
import type { AdRange, AdRow, Business, CampaignFunnel } from "@/types";

/**
 * Spend to confirmed bookings, over exactly the days Meta's figures cover, so
 * Cost per Booking divides like by like. Only for a connected account on a
 * business that keeps its bookings in AEGIS: sample campaigns are never set
 * against real bookings. Shared by the Ads screen and Ask AEGIS, so both
 * quote the same figures.
 *
 * For Today and Yesterday the bookings are still counted when Meta's figures
 * for the day are not in AEGIS, and `missingFigures` says why the spend side
 * is unknown rather than letting it read as zero.
 */
export async function loadCampaignFunnel(
  business: Business,
  range: AdRange,
  rows?: AdRow[],
): Promise<CampaignFunnel | null> {
  const meta = await readActiveMetaAdsStatus();
  if (!meta.connected || !business.modules.includes("bookings")) return null;

  const timeZone = meta.timezone || "Asia/Manila";
  const now = new Date();
  const period = windowForRange(range, timeZone, now);
  const missingFigures = isDayRange(range) ? dayFigures(range, meta.days, timeZone, now).missing : null;
  const [campaignRows, confirmed, chats, bookings, uncredited] = await Promise.all([
    rows ? Promise.resolve(rows) : listAdRows(range),
    countConfirmedByCampaign(period.from, period.to),
    countChatsByCampaign(period.from, period.to),
    listCampaignBookings(period.from, period.to),
    countUncreditedConfirmed(period.from, period.to),
  ]);
  return buildFunnel({
    campaigns: campaignRows.filter((row) => row.level === "campaigns"),
    confirmedByCampaign: confirmed,
    chatsByCampaign: chats,
    bookings,
    uncreditedConfirmed: uncredited,
    periodLabel: periodLabel(period.from, period.to, timeZone),
    missingFigures,
  });
}
