import { getActiveBusiness } from "@/lib/dal/businesses";
import { readPhotoImage } from "@/lib/dal/quotations";

/**
 * The photo a draft quotation was read from, for staff checking the draft
 * against it. Looked up within the signed-in business only.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/quotations/photos/[ref]">) {
  const business = await getActiveBusiness();
  if (!business?.modules.includes("quotes")) {
    return new Response("Quotations are not enabled for this business.", { status: 403 });
  }

  const { ref } = await ctx.params;
  const photo = await readPhotoImage(ref);
  if (!photo) return new Response("That photo is not on file.", { status: 404 });

  const bytes = Buffer.from(photo.dataUrl.slice(photo.dataUrl.indexOf(",") + 1), "base64");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/jpeg",
      // A photo never changes once stored, but it is a customer's document.
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
