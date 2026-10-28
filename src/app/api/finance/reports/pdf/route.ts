import { getActiveBusiness } from "@/lib/dal/businesses";
import { findReportPdf } from "@/lib/dal/finance-close";
import { verifySession } from "@/lib/dal/session";
import { financePdfFilename } from "@/lib/finance-pdf";
import { isMonthKey, isYearKey } from "@/lib/finance-periods";

/**
 * A frozen report's PDF, exactly as it was made when the revision was
 * written: `?kind=income|standing&period=2026-09&rev=1`, or
 * `kind=annual-income|year-end-standing&period=2026`; inline for viewing,
 * `&download=1` to save. Administrators only, and only within the signed-in
 * business: the business comes from the session, never from the request.
 */
export async function GET(request: Request) {
  const business = await getActiveBusiness();
  if (!business) return new Response("No business is selected.", { status: 403 });
  const { role, activeBusinessId } = await verifySession();
  if (role !== "aegis_admin") return new Response("Reports are for administrators.", { status: 403 });

  const params = new URL(request.url).searchParams;
  const kind = params.get("kind");
  const period = params.get("period") ?? "";
  const revision = Number.parseInt(params.get("rev") ?? "", 10);
  // Monthly reports are for a month ("2026-09"), the year-end pair for a year ("2026").
  const monthly = kind === "income" || kind === "standing";
  const annual = kind === "annual-income" || kind === "year-end-standing";
  const periodOk = monthly ? isMonthKey(period) : isYearKey(period);
  if ((!monthly && !annual) || !periodOk || !Number.isInteger(revision) || revision < 1) {
    return new Response("That report is not valid.", { status: 400 });
  }

  const pdf = await findReportPdf(activeBusinessId, kind, period, revision);
  if (!pdf) return new Response("That report is not on file.", { status: 404 });

  const filename = financePdfFilename(business.name, kind, period, revision);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${params.get("download") === "1" ? "attachment" : "inline"}; filename="${filename}"`,
      // A revision never changes, but it is the owner's private figures.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
