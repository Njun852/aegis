import { getActiveBusiness } from "@/lib/dal/businesses";
import { readIntakeFile } from "@/lib/dal/finance-intake";

/**
 * An upload waiting in the Review Queue, for checking the AI's reading
 * against it. Looked up within the signed-in business only. Once posted, the
 * file is served as the record's attachment instead.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/finance/intake/[ref]">) {
  const business = await getActiveBusiness();
  if (!business) return new Response("No business is selected.", { status: 403 });

  const { ref } = await ctx.params;
  const file = await readIntakeFile(ref);
  if (!file) return new Response("That upload is not in the queue.", { status: 404 });

  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `inline; filename="${file.name.replace(/[^\w.\- ]+/g, "_")}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
