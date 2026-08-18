import type { ComingSoonModule, NavLink } from "@/types";

export const ORGANIZATION = {
  name: "Northwind Group",
  product: "AEGIS AI",
  mailbox: "ops@northwindgroup.com",
};

export const CURRENT_USER = {
  name: "Ahmed Ben",
  firstName: "Ahmed",
  role: "Administrator",
};

/** Modules that are live today. Each one is a real route. */
export const WORKSPACE_NAV: NavLink[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: "layout-dashboard",
    title: "Dashboard",
  },
  { href: "/mail", label: "Mail", icon: "mail", title: "Mail" },
];

/** Sidebar placeholders — no routes behind these yet. */
export const COMING_SOON_MODULES: ComingSoonModule[] = [
  { label: "Ads", icon: "megaphone", badge: "Soon" },
  { label: "CRM", icon: "users", badge: "Soon" },
  { label: "Inventory", icon: "package", badge: "Soon" },
  { label: "Fleet", icon: "truck", badge: "Soon" },
];
