import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdsWorkspace } from "@/components/ads/ads-workspace";
import { isAiConfigured } from "@/lib/ai/client";
import { cachedAdsInsight } from "@/lib/ai/ads-insight";
import { readActiveMetaAdsStatus } from "@/lib/dal/ad-account";
import { buildFunnel, periodLabel } from "@/lib/ad-funnel";
import { listAdRows } from "@/lib/dal/ads";
import { countConfirmedByCampaign, countUncreditedConfirmed, listCampaignBookings } from "@/lib/dal/bookings";
import { countChatsByCampaign } from "@/lib/dal/messenger";
import { windowForRange } from "@/lib/meta/ranges";
import { getActiveBusiness } from "@/lib/dal/businesses";
import { AD_FALLBACK_INSIGHT } from "@/lib/data/ads";
import { AD_RANGE_KEYS, DEFAULT_AD_RANGE } from "@/lib/meta/mapping";
import type { AdRange } from "@/types";

export const metadata: Metadata = {
  title: "Ads · AEGIS AI",
  description:
    "Meta campaign performance across campaigns, ad sets and ads, with AI commentary on where the budget is working.",
};

function parseRange(value: string | string[] | undefined): AdRange {
  return AD_RANGE_KEYS.find((key) => key === value) ?? DEFAULT_AD_RANGE;
}

export default async function AdsPage(props: PageProps<"/ads">) {
  const business = await getActiveBusiness();
  if (!business) redirect("/login");

  const range = parseRange((await props.searchParams).range);

  // Ads is a core module, so there is no entitlement gate here — every AEGIS
  // business has it. Whether the rows are live Meta data or the labelled
  // samples is decided by the connection, not by this page.
  const [rows, meta, cached] = await Promise.all([
    listAdRows(range),
    readActiveMetaAdsStatus(),
    // Cache read only; this cannot start a billable request.
    cachedAdsInsight(),
  ]);

  // Spend to confirmed bookings, over exactly the days Meta's figures cover,
  // so Cost per Booking divides like by like. Only for a connected account on
  // a business that keeps its bookings in AEGIS: sample campaigns are never
  // set against real bookings.
  let funnel = null;
  if (meta.connected && business.modules.includes("bookings")) {
    const timeZone = meta.timezone ?? "Asia/Manila";
    const period = windowForRange(range, timeZone);
    const [confirmed, chats, bookings, uncredited] = await Promise.all([
      countConfirmedByCampaign(period.from, period.to),
      countChatsByCampaign(period.from, period.to),
      listCampaignBookings(period.from, period.to),
      countUncreditedConfirmed(period.from, period.to),
    ]);
    funnel = buildFunnel({
      campaigns: rows.filter((row) => row.level === "campaigns"),
      confirmedByCampaign: confirmed,
      chatsByCampaign: chats,
      bookings,
      uncreditedConfirmed: uncredited,
      periodLabel: periodLabel(period.from, period.to, timeZone),
    });
  }

  return (
    <AdsWorkspace
      funnel={funnel}
      rows={rows}
      businessName={business.name}
      cachedInsight={cached}
      fallbackInsight={AD_FALLBACK_INSIGHT}
      aiEnabled={isAiConfigured()}
      source={meta.connected ? "meta" : "sample"}
      meta={meta.connected ? meta : null}
      range={range}
    />
  );
}
