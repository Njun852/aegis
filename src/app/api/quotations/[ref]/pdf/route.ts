import { getActiveBusiness } from "@/lib/dal/businesses";
import { findQuotation, findQuotationRevision, readQuotationSettings } from "@/lib/dal/quotations";
import { quotePdfFilename, renderQuotePdf } from "@/lib/quote-pdf";
import { pricingCleared } from "@/lib/quotations";

/**
 * The quotation PDF, for the preview pane (`inline`) and the Download button
 * (`?download=1`). The session and the tenant filter apply here as on every
 * screen: the ref is looked up only within the signed-in business.
 *
 * `?rev=2` prints an earlier revision exactly as it was kept, so the version
 * a customer was given can be shown again after the quotation changed.
 *
 * `?internal=1` is the staff copy: the same form with each line's cost and
 * the profit, marked as not for the customer. Anyone who can open the
 * quotation can open it, since the editor already shows them those costs.
 *
 * A quotation with special pricing nobody approved can be previewed while
 * it is being drafted, but not downloaded, since a download is usually on its
 * way to a customer. Unpriced lines print blank, so a draft can be printed
 * and handed over or priced by hand.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/quotations/[ref]/pdf">) {
  const business = await getActiveBusiness();
  if (!business?.modules.includes("quotes")) {
    return new Response("Quotations are not enabled for this business.", { status: 403 });
  }

  const { ref } = await ctx.params;
  const params = new URL(request.url).searchParams;
  const rev = params.get("rev");
  const revision = rev === null ? null : Number.parseInt(rev, 10);
  if (revision !== null && (!Number.isInteger(revision) || revision < 1)) {
    return new Response("That revision number is not valid.", { status: 400 });
  }
  const quotation = revision === null ? await findQuotation(ref) : await findQuotationRevision(ref, revision);
  if (!quotation) return new Response("That quotation is not on file.", { status: 404 });

  const download = params.get("download") === "1";
  // The staff copy with costs. It never goes to the customer, so unapproved
  // pricing does not stop it: checking a price against its cost is what it is for.
  const internal = params.get("internal") === "1";
  if (download && !internal && !pricingCleared(quotation)) {
    return new Response("An administrator must approve the discount or below-cost pricing first.", { status: 409 });
  }

  const settings = await readQuotationSettings();
  const pdf = await renderQuotePdf({ quotation, settings, businessName: business.name, internal });
  const filename = quotePdfFilename(business.name, quotation.ref, quotation.revision, internal);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      // A quotation changes with every save; the browser must not show a stale one.
      "Cache-Control": "private, no-store",
    },
  });
}
