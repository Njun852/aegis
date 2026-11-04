import { syncAdsAction } from "@/app/actions/ads";
import { isModuleEnabled } from "@/lib/businesses";
import { getActiveBusiness } from "@/lib/dal/businesses";

/**
 * The automatic Meta sync the app shell runs every five minutes. A route
 * rather than a server action for the same reason as the mail sync: Meta can
 * take several seconds, and server actions wait for one another.
 */
export async function POST() {
  const business = await getActiveBusiness();
  if (!business) return new Response("No business is selected.", { status: 403 });
  // Nothing to sync for someone whose role has no Ads; the shell treats this as a quiet turn.
  if (!isModuleEnabled(business, "ads")) return new Response(null, { status: 204 });

  return Response.json(await syncAdsAction(), { headers: { "Cache-Control": "no-store" } });
}
