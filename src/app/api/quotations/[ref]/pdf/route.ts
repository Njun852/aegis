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
 * A quotation with an unpriced line, or special pricing nobody approved, can
 * be previewed while it is being drafted, but not downloaded, since a
 * download is usually on its way to a customer.
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
  if (download && quotation.totals.unpricedCount > 0) {
    return new Response("Price every line before downloading this quotation.", { status: 409 });
  }
  if (download && !pricingCleared(quotation)) {
    return new Response("An administrator must approve the discount or below-cost pricing first.", { status: 409 });
  }

  const settings = await readQuotationSettings();
  const pdf = await renderQuotePdf({ quotation, settings, businessName: business.name });
  const filename = quotePdfFilename(business.name, quotation.ref, quotation.revision);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      // A quotation changes with every save; the browser must not show a stale one.
      "Cache-Control": "private, no-store",
    },
  });
}
