import {
  ACCOUNT_PAGES,
  CORE_MODULES,
  OPTIONAL_MODULES,
} from "@/lib/data/businesses";
import type {
  Business,
  ModuleDefinition,
  ModuleKey,
  OptionalModuleKey,
} from "@/types";

/**
 * Pure helpers over business records the server already loaded. Reads live in
 * `src/lib/dal/businesses.ts`; nothing here touches the database, so these are
 * safe to call from client components.
 */

/** Client-side filter for the admin screen's search box. */
export function filterBusinesses(source: Business[], query = "") {
  const term = query.trim().toLowerCase();
  if (!term) return source;
  return source.filter(
    (business) =>
      business.name.toLowerCase().includes(term) ||
      business.meta.toLowerCase().includes(term),
  );
}

export function getBusiness(id: string, source: Business[]) {
  return source.find((business) => business.id === id);
}

export function isModuleEnabled(
  business: Business | undefined,
  key: ModuleKey,
): boolean {
  if (CORE_MODULES.some((module) => module.key === key)) return true;
  return business?.modules.includes(key as OptionalModuleKey) ?? false;
}

/** Core modules always count, so the total is 3 plus whatever was granted. */
export function activeModuleCount(business: Business) {
  return CORE_MODULES.length + business.modules.length;
}

export const TOTAL_MODULE_COUNT = CORE_MODULES.length + OPTIONAL_MODULES.length;

export function findModule(key: string): ModuleDefinition | undefined {
  return [...CORE_MODULES, ...OPTIONAL_MODULES].find(
    (module) => module.key === key,
  );
}

export function sameGrants(a: OptionalModuleKey[], b: OptionalModuleKey[]) {
  return [...a].sort().join() === [...b].sort().join();
}

/** Resolves a `/modules/[key]` slug to something renderable. */
export function findStubPage(key: string) {
  const definition = findModule(key);
  if (definition) {
    return {
      key,
      name: definition.name,
      icon: definition.icon,
      desc: definition.desc,
      /** Core pages are never gated, so they never render the locked state. */
      core: CORE_MODULES.some((entry) => entry.key === key),
    };
  }
  const account = ACCOUNT_PAGES[key];
  if (account) return { key, ...account, core: true };
  return undefined;
}
