import "server-only";

import { businessesCollection } from "./db";
import { allowedBusinessIds, requireAdmin, verifySession } from "./session";
import type { Business, BusinessDocument, OptionalModuleKey } from "@/types";

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
