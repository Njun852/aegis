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
    roleHidden: [],
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
    href: "/ads",
  },
  {
    key: "finance",
    name: "Finance",
    icon: "wallet",
    desc: "Books, cash & reports",
    href: "/finance",
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
    href: "/inventory",
  },
  {
    key: "crm",
    name: "CRM",
    icon: "users",
    desc: "Customer records with their cars, bookings and value over time.",
    href: "/crm",
  },
  {
    key: "sms",
    name: "Text Blast",
    icon: "send",
    desc: "Automatic text reminders to customers when their car is due for service.",
    href: "/text-blast",
  },
  {
    key: "quotes",
    name: "Quotations",
    icon: "file-text",
    desc: "Printable parts and labor quotations, emailed as a PDF or drafted from a photo.",
    href: "/quotations",
  },
  {
    key: "suppliers",
    name: "Suppliers",
    icon: "truck",
    desc: "Suppliers, what each charges for every part, and how those costs change.",
    href: "/suppliers",
  },
];

export const OPTIONAL_MODULE_KEYS: OptionalModuleKey[] = OPTIONAL_MODULES.map(
  (module) => module.key as OptionalModuleKey,
);

/**
 * Modules that were folded into another and what they now mean. Fleet (the
 * customers' cars) became part of CRM on 11 Nov 2026, so a business stored
 * with "fleet" reads as having CRM until its grants are next saved.
 */
const RETIRED_MODULES: Record<string, OptionalModuleKey> = { fleet: "crm" };

/**
 * A stored grant list as it reads today: retired modules mapped to their
 * successor, anything no longer sold dropped, each module once. Every read of
 * a business's stored `modules` goes through this.
 */
export function normalizeModules(stored: readonly string[] | undefined): OptionalModuleKey[] {
  const keys = (stored ?? []).map((key) => RETIRED_MODULES[key] ?? key);
  return OPTIONAL_MODULE_KEYS.filter((key) => keys.includes(key));
}

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
