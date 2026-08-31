import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdsWorkspace } from "@/components/ads/ads-workspace";
import { isAiConfigured } from "@/lib/ai/client";
import { cachedAdsInsight } from "@/lib/ai/ads-insight";
import { listAdRows } from "@/lib/dal/ads";
import { getActiveBusiness } from "@/lib/dal/businesses";
import { AD_FALLBACK_INSIGHT } from "@/lib/data/ads";

export const metadata: Metadata = {
  title: "Ads · AEGIS AI",
  description:
    "Meta campaign performance across campaigns, ad sets and ads, with AI commentary on where the budget is working.",
};

export default async function AdsPage() {
  const business = await getActiveBusiness();
  if (!business) redirect("/login");

  // Ads is a core module, so there is no entitlement gate here — every AEGIS
  // business has it.
  const [rows, cached] = await Promise.all([
    listAdRows(),
    // Cache read only; this cannot start a billable request.
    cachedAdsInsight(),
  ]);

  return (
    <AdsWorkspace
      rows={rows}
      businessName={business.name}
      cachedInsight={cached}
      fallbackInsight={AD_FALLBACK_INSIGHT}
      aiEnabled={isAiConfigured()}
    />
  );
}
