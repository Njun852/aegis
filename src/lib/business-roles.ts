import type { BusinessRole, ModuleKey, UserRole } from "@/types";

/**
 * What each person may do inside one business.
 *
 * An AEGIS administrator reaches everything. A member holds one role per
 * business, and that role narrows the business's own modules: a screen shows
 * only when the business has bought it and the role includes it. A member
 * with no role yet keeps the access members always had — every module the
 * business has, and none of the owner's powers — until an administrator picks
 * one on the Users screen.
 *
 * Pure and free of `server-only`, so the server checks, the sidebar and the
 * Users screen all read this one table and cannot disagree.
 */

/** Powers beyond opening a module's screen. */
export type Capability =
  /** Finance's Overview, Income, Standing and Reports, and the report PDF. */
  | "financeReports"
  /** Money accounts, voiding entries and resolving count differences. */
  | "financeBooks"
  /** Approving a discount or below-cost pricing on a quotation. */
  | "approvePricing"
  /** The Owner Board across the businesses this person owns. */
  | "ownerBoard";

interface RoleDefinition {
  key: BusinessRole;
  label: string;
  /** One line for the Users screen. */
  summary: string;
  modules: ModuleKey[];
  capabilities: Capability[];
}

const ALL_MODULES: ModuleKey[] = [
  "dashboard",
  "mail",
  "ads",
  "finance",
  "bookings",
  "crm",
  "quotes",
  "suppliers",
  "fleet",
  "inventory",
  "sms",
];

export const BUSINESS_ROLES: RoleDefinition[] = [
  {
    key: "owner",
    label: "Owner",
    summary: "Every module, the Owner Board, all of Finance and pricing approval.",
    modules: ALL_MODULES,
    capabilities: ["financeReports", "financeBooks", "approvePricing", "ownerBoard"],
  },
  {
    key: "marketing_admin",
    label: "Admin marketing",
    summary: "Dashboard, mail, ads, bookings, customers, quotations, suppliers, Text Blast, fleet, and Finance with its reports.",
    modules: ["dashboard", "mail", "ads", "finance", "bookings", "crm", "quotes", "suppliers", "sms", "fleet"],
    capabilities: ["financeReports"],
  },
  {
    key: "accounting",
    label: "Accounting",
    summary: "Mail, ads, bookings, fleet, and all of Finance including money accounts.",
    modules: ["mail", "ads", "finance", "bookings", "fleet"],
    capabilities: ["financeReports", "financeBooks"],
  },
  {
    key: "service_advisor",
    label: "Service advisor",
    summary: "Mail, quotations, suppliers, fleet, inventory, and Finance for recording invoices, bills and payments.",
    modules: ["mail", "quotes", "suppliers", "fleet", "inventory", "finance"],
    capabilities: [],
  },
];

export const BUSINESS_ROLE_KEYS: BusinessRole[] = BUSINESS_ROLES.map((role) => role.key);

/** The role new memberships start with: the narrowest, widened on purpose. */
export const DEFAULT_BUSINESS_ROLE: BusinessRole = "service_advisor";

export function isBusinessRole(value: unknown): value is BusinessRole {
  return typeof value === "string" && (BUSINESS_ROLE_KEYS as string[]).includes(value);
}

function definition(role: BusinessRole): RoleDefinition {
  return BUSINESS_ROLES.find((entry) => entry.key === role) ?? BUSINESS_ROLES[BUSINESS_ROLES.length - 1];
}

export function businessRoleLabel(role: BusinessRole | null): string {
  return role ? definition(role).label : "Member";
}

export interface RoleHolder {
  role: UserRole;
  /** The role in the business being asked about; null when none is set. */
  businessRole: BusinessRole | null;
}

/** Whether the role includes a module's screen. The business's own grant is checked separately. */
export function roleAllowsModule(holder: RoleHolder, key: ModuleKey): boolean {
  if (holder.role === "aegis_admin" || holder.businessRole === null) return true;
  return definition(holder.businessRole).modules.includes(key);
}

export function can(holder: RoleHolder, capability: Capability): boolean {
  if (holder.role === "aegis_admin") return true;
  if (holder.businessRole === null) return false;
  return definition(holder.businessRole).capabilities.includes(capability);
}

/** The modules a role leaves out, for the screens that dim or lock them. */
export function modulesHiddenByRole(holder: RoleHolder): ModuleKey[] {
  return ALL_MODULES.filter((key) => !roleAllowsModule(holder, key));
}
