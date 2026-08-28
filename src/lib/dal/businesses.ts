import "server-only";

import { redirect } from "next/navigation";
import { businessesCollection } from "./db";
import { allowedBusinessIds, requireAdmin, verifySession } from "./session";
import type {
  Business,
  BusinessDocument,
  ModuleKey,
  OptionalModuleKey,
} from "@/types";

const CORE_MODULE_KEYS: ModuleKey[] = ["dashboard", "mail", "ads"];

function toBusiness(doc: BusinessDocument): Business {
  return {
    id: doc.businessId,
    name: doc.name,
    meta: doc.meta,
    onboarded: doc.onboarded,
    modules: doc.modules,
  };
}

/**
 * The businesses the signed-in user may switch between — every business for an
 * AEGIS admin, only their memberships for a member. The switcher and the admin
 * list both read this, so a member can never see another tenant in the list.
 */
export async function listBusinessesForUser(): Promise<Business[]> {
  const { userId, role } = await verifySession();
  const allowed = await allowedBusinessIds(userId, role);

  const businesses = await businessesCollection();
  const docs = await businesses
    .find({ businessId: { $in: allowed } })
    .sort({ businessId: 1 })
    .toArray();

  return docs.map(toBusiness);
}

/** One business, but only if the caller is allowed to see it. */
export async function getBusinessForUser(
  businessId: string,
): Promise<Business | null> {
  const { userId, role } = await verifySession();
  const allowed = await allowedBusinessIds(userId, role);
  if (!allowed.includes(businessId)) return null;

  const businesses = await businessesCollection();
  const doc = await businesses.findOne({ businessId });
  return doc ? toBusiness(doc) : null;
}

/** Entitlements are admin-set, so this asserts the role before writing. */
export async function setModuleGrants(
  businessId: string,
  modules: OptionalModuleKey[],
): Promise<void> {
  await requireAdmin();

  const businesses = await businessesCollection();
  await businesses.updateOne(
    { businessId },
    { $set: { modules } },
  );
}

/** The business the request is scoped to, straight from the session. */
export async function getActiveBusiness(): Promise<Business | null> {
  const { activeBusinessId } = await verifySession();
  const businesses = await businessesCollection();
  const doc = await businesses.findOne({ businessId: activeBusinessId });
  return doc ? toBusiness(doc) : null;
}

/**
 * Gates a module behind the active business's entitlement. Server Actions call
 * this before writing — the sidebar dims a locked module and the page renders
 * an explainer, but neither of those stops a hand-crafted POST.
 */
export async function requireModule(key: ModuleKey): Promise<Business> {
  const business = await getActiveBusiness();
  if (!business) redirect("/login");

  const core = CORE_MODULE_KEYS.includes(key);
  if (!core && !business.modules.includes(key as OptionalModuleKey)) {
    throw new Error(`The ${key} module is not enabled for ${business.name}.`);
  }
  return business;
}
