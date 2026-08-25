/** Modules every AEGIS business gets. These can never be switched off. */
export type CoreModuleKey = "dashboard" | "mail" | "ads";

/** Modules a business buys individually. An admin grants these per business. */
export type OptionalModuleKey = "bookings" | "inventory" | "crm" | "fleet";

export type ModuleKey = CoreModuleKey | OptionalModuleKey;

export interface ModuleDefinition {
  key: ModuleKey;
  name: string;
  icon: string;
  /** One-line pitch, shown in the admin toggle list and the module stub. */
  desc: string;
  /** Where the module lives once it is built. Absent means stub-only so far. */
  href?: string;
}

export interface Business {
  id: string;
  name: string;
  /** "Industry · Plan", rendered as the row subtitle. */
  meta: string;
  onboarded: string;
  /** Optional modules this business is entitled to, as sold. */
  modules: OptionalModuleKey[];
}

/** Which optional modules each business currently has, keyed by business id. */
export type ModuleGrants = Record<string, OptionalModuleKey[]>;
