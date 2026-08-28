import type { NavLink } from "@/types";

/**
 * `name` is the pre-auth label only — the sign-in screen renders before there
 * is a session, so no tenant is known yet. Everywhere inside the app the
 * business name comes from the database via `useBusiness()`, not from here.
 */
export const ORGANIZATION = {
  name: "AUTOBLITZ",
  product: "AEGIS AI",
  mailbox: "ops@autoblitz.com",
};

export const CURRENT_USER = {
  name: "Ahmed Ben",
  firstName: "Ahmed",
  role: "Administrator",
};

/** Core modules — every business has these, so they are never gated. */
export const WORKSPACE_NAV: NavLink[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: "layout-dashboard",
    title: "Dashboard",
  },
  { href: "/mail", label: "Mail", icon: "mail", title: "Mail" },
  {
    href: "/modules/ads",
    label: "Ads",
    icon: "megaphone",
    title: "Ads",
  },
];

/** AEGIS-internal tooling, not part of any customer's module plan. */
export const INTERNAL_NAV: NavLink[] = [
  {
    href: "/admin/businesses",
    label: "Business Management",
    icon: "building-2",
    title: "Business Management",
  },
];
