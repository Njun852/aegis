import type {
  Business,
  ModuleDefinition,
  OptionalModuleKey,
} from "@/types";

/**
 * SEED FIXTURE ONLY. The app reads businesses from MongoDB through
 * `src/lib/dal/businesses.ts`; this array is the input `scripts/seed.ts` loads
 * on a fresh database and is not imported by any screen.
 */
export const BUSINESSES: Business[] = [
  {
    id: "BIZ-1001",
    name: "AUTOBLITZ",
    meta: "Automotive services · Enterprise",
    onboarded: "Aug 01, 2026",
    modules: ["bookings", "inventory", "crm"],
  },
];

/** Bundled with every AEGIS business; the admin screen renders these locked. */
export const CORE_MODULES: ModuleDefinition[] = [
  {
    key: "dashboard",
    name: "Dashboard",
    icon: "layout-dashboard",
    desc: "Metrics & AI insight",
    href: "/dashboard",
  },
  { key: "mail", name: "Mail", icon: "mail", desc: "Unified inbox", href: "/mail" },
  {
    key: "ads",
    name: "Ads",
    icon: "megaphone",
    desc: "Campaign performance",
    href: "/modules/ads",
  },
];

/** Sold per business. An AEGIS admin grants these in Business Management. */
export const OPTIONAL_MODULES: ModuleDefinition[] = [
  {
    key: "bookings",
    name: "Bookings",
    icon: "calendar",
    desc: "Appointment scheduling, availability windows and automated customer reminders.",
    href: "/bookings",
  },
  {
    key: "inventory",
    name: "Inventory",
    icon: "package",
    desc: "Stock levels, purchase orders and low-stock alerts across every location.",
    href: "/modules/inventory",
  },
  {
    key: "crm",
    name: "CRM",
    icon: "users",
    desc: "Customer records, pipeline stages and follow-up tasks for the sales team.",
    href: "/modules/crm",
  },
  {
    key: "fleet",
    name: "Fleet",
    icon: "truck",
    desc: "Vehicle assignments, maintenance schedules and route history.",
    href: "/modules/fleet",
  },
];

export const OPTIONAL_MODULE_KEYS: OptionalModuleKey[] = OPTIONAL_MODULES.map(
  (module) => module.key as OptionalModuleKey,
);

/**
 * Pages reachable from the user menu that are not modules. They share the
 * module page's layout so every unbuilt destination behaves the same way.
 */
export const ACCOUNT_PAGES: Record<
  string,
  { name: string; icon: string; desc: string }
> = {
  profile: {
    name: "Profile",
    icon: "user",
    desc: "Your name, contact details and notification preferences.",
  },
  settings: {
    name: "Account Settings",
    icon: "settings",
    desc: "Workspace security, connected accounts and billing contacts.",
  },
};
