import { getActiveBusiness } from "@/lib/dal/businesses";
import { isModuleEnabled } from "@/lib/businesses";
import { explainMailFailure } from "@/lib/mail/failures";
import { readMailAttachment } from "@/lib/mail/ingest";

/**
 * One file attached to an email: `?message=<message id>&index=<n>`. Looked up
 * within the signed-in business's own inbox only, read from Gmail the first
 * time and kept for 30 days after. Photos and PDFs open in the browser; any
 * other type is downloaded, never rendered, since an email attachment is
 * whatever a stranger chose to send. `&download=1` always saves.
 */

/** Types the browser may show in place. Not SVG or HTML: those can carry scripts. */
const SHOWN_IN_PLACE = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp", "application/pdf", "text/plain"]);

export async function GET(request: Request) {
  const business = await getActiveBusiness();
  if (!business || !isModuleEnabled(business, "mail")) {
    return new Response("Mail is not available for this account.", { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const messageId = (params.get("message") ?? "").slice(0, 500);
  const index = Number(params.get("index"));
  if (!messageId || !Number.isInteger(index) || index < 0 || index > 200) {
    return new Response("That attachment address is not valid.", { status: 400 });
  }

  const file = await readMailAttachment(messageId, index);
  if (file === "missing") return new Response("That attachment is no longer on the email.", { status: 404 });
  // Not in this business's inbox (or never read from a mailbox): nothing to fetch.
  if (file === "mailbox-missing") return new Response("That email is not in this inbox.", { status: 404 });
  if (typeof file === "string") return new Response(explainMailFailure(file), { status: 502 });

  const inPlace = SHOWN_IN_PLACE.has(file.contentType) && params.get("download") !== "1";
  const filename = file.filename.replace(/[^\w.\- ()]+/g, "_").slice(0, 150) || "attachment";
  return new Response(new Uint8Array(file.content), {
    headers: {
      "Content-Type": inPlace ? file.contentType : "application/octet-stream",
      "Content-Disposition": `${inPlace ? "inline" : "attachment"}; filename="${filename}"`,
      "Content-Length": String(file.content.length),
      // The business's own correspondence: never kept by a shared cache.
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      // A PDF runs in the browser's viewer with no scripts and no access to the app.
      "Content-Security-Policy": "sandbox",
    },
  });
}
