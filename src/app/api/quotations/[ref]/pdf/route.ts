import { getActiveBusiness } from "@/lib/dal/businesses";
import { findQuotation, readQuotationSettings } from "@/lib/dal/quotations";
import { quotePdfFilename, renderQuotePdf } from "@/lib/quote-pdf";

/**
 * The quotation PDF, for the preview pane (`inline`) and the Download button
 * (`?download=1`). The session and the tenant filter apply here as on every
 * screen: the ref is looked up only within the signed-in business.
 *
 * A quotation with an unpriced line can be previewed while it is being
 * drafted, but not downloaded, since a download is usually on its way to a
 * customer.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/quotations/[ref]/pdf">) {
  const business = await getActiveBusiness();
  if (!business?.modules.includes("quotes")) {
    return new Response("Quotations are not enabled for this business.", { status: 403 });
  }

  const { ref } = await ctx.params;
  const quotation = await findQuotation(ref);
  if (!quotation) return new Response("That quotation is not on file.", { status: 404 });

  const download = new URL(request.url).searchParams.get("download") === "1";
  if (download && quotation.totals.unpricedCount > 0) {
    return new Response("Price every line before downloading this quotation.", { status: 409 });
  }

  const settings = await readQuotationSettings();
  const pdf = await renderQuotePdf({ quotation, settings, businessName: business.name });
  const filename = quotePdfFilename(business.name, quotation.ref);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      // A quotation changes with every save; the browser must not show a stale one.
      "Cache-Control": "private, no-store",
    },
  });
}
