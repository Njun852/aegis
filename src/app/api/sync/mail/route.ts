import { syncInboxAction } from "@/app/actions/ai";
import { refreshMailFreshnessAction } from "@/app/actions/mail";
import { getActiveBusiness } from "@/lib/dal/businesses";

/**
 * The automatic inbox sync the app shell runs every two minutes: retrieval,
 * then triage and suggested replies for what arrived, then how fresh the
 * inbox now is for the top bar.
 *
 * A route rather than a server action because Next runs a page's server
 * actions one at a time: a sync spending twenty seconds on IMAP and the model
 * would hold up every save the person made meanwhile.
 */
export async function POST() {
  const business = await getActiveBusiness();
  if (!business) return new Response("No business is selected.", { status: 403 });

  const result = await syncInboxAction();
  const freshness = await refreshMailFreshnessAction();
  return Response.json({ ...result, ...freshness }, { headers: { "Cache-Control": "no-store" } });
}
