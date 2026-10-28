import { getActiveBusiness } from "@/lib/dal/businesses";
import { readAttachment } from "@/lib/dal/finance-attachments";

/**
 * The photo or PDF behind a finance record, for checking the record against
 * it. Looked up within the signed-in business only; `?download=1` saves it.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/finance/attachments/[ref]">) {
  const business = await getActiveBusiness();
  if (!business) return new Response("No business is selected.", { status: 403 });

  const { ref } = await ctx.params;
  const file = await readAttachment(ref);
  if (!file) return new Response("That attachment is not on file.", { status: 404 });

  const download = new URL(request.url).searchParams.get("download") === "1";
  const filename = file.name.replace(/[^\w.\- ]+/g, "_");
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      // An attachment never changes once stored, but it is the business's document.
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      // An uploaded PDF runs in the browser's viewer; it gets no scripts and no access to the app.
      "Content-Security-Policy": "sandbox",
    },
  });
}
