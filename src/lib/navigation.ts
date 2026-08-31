import { findStubPage, getBusiness } from "@/lib/businesses";
import { INTERNAL_NAV, WORKSPACE_NAV } from "@/lib/data/workspace";
import type { Business } from "@/types";

/**
 * The top bar's title for any route in the app shell. Dynamic segments resolve
 * to something a person recognises (a business name, a module name) rather than
 * the raw id in the path.
 */
export function routeTitle(pathname: string, businesses: Business[]): string {
  if (pathname.startsWith("/admin/businesses/")) {
    const id = pathname.split("/")[3];
    return getBusiness(id, businesses)?.name ?? "Business";
  }

  const internal = INTERNAL_NAV.find((item) => pathname.startsWith(item.href));
  if (internal) return internal.title;

  if (pathname.startsWith("/bookings")) return "Bookings";
  if (pathname.startsWith("/inventory")) return "Inventory";
  if (pathname.startsWith("/ads")) return "Ads";

  if (pathname.startsWith("/modules/")) {
    const key = pathname.split("/")[2];
    return findStubPage(key)?.name ?? "Module";
  }

  const workspace = WORKSPACE_NAV.find((item) => pathname.startsWith(item.href));
  return workspace?.title ?? "AEGIS AI";
}
