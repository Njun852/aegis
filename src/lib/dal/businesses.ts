import "server-only";

import { redirect } from "next/navigation";
import { RESERVED_SLUGS } from "@/lib/data/booking-page";
import { businessesCollection, getDb } from "./db";
import { InputError, isDuplicateKey } from "./refs";
import { allowedBusinessIds, requireAdmin, verifySession } from "./session";
import type {
  Business,
  BusinessDocument,
  ModuleKey,
  OnlineBookingStatus,
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

/** The id format every business gets: BIZ-1001, BIZ-1002, and so on. */
const ID_PREFIX = "BIZ-";
const FIRST_ID = 1001;

/**
 * Next free business id.
 *
 * Read-the-maximum-and-add-one, the same allocation booking refs use, and with
 * the same caveat: two admins creating a business at the same instant can pick
 * the same number. The unique index on `businessId` turns that into a write
 * error rather than a collision, and `createBusiness` retries.
 */
async function nextBusinessId(): Promise<string> {
  const businesses = await businessesCollection();
  const docs = await businesses
    .find({}, { projection: { businessId: 1 } })
    .toArray();

  const highest = docs.reduce((max, doc) => {
    const parsed = Number.parseInt(doc.businessId.replace(ID_PREFIX, ""), 10);
    return Number.isFinite(parsed) && parsed > max ? parsed : max;
  }, FIRST_ID - 1);

  return `${ID_PREFIX}${highest + 1}`;
}

/**
 * Creates a business. Admin-only, like every other write on this screen.
 *
 * A new business starts with **no optional modules**: entitlements are what the
 * customer has bought, so granting them by default would hand out access nobody
 * asked for. The admin turns them on afterwards on the detail screen.
 */
export async function createBusiness(
  name: string,
  meta: string,
): Promise<Business> {
  await requireAdmin();

  const businesses = await businessesCollection();
  const onboarded = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });

  // Two attempts: the second covers losing the id race against another admin.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const businessId = await nextBusinessId();
    const doc: BusinessDocument = {
      businessId,
      name,
      meta,
      onboarded,
      modules: [],
      status: "active",
    };

    try {
      await businesses.insertOne(doc);
      return toBusiness(doc);
    } catch (cause) {
      const duplicate = (cause as { code?: number })?.code === 11000;
      if (!duplicate || attempt === 1) throw cause;
    }
  }

  throw new Error("Could not allocate a business id.");
}

/** Renames a business. The id never changes — other records point at it. */
export async function renameBusiness(
  businessId: string,
  name: string,
  meta: string,
): Promise<void> {
  await requireAdmin();

  const businesses = await businessesCollection();
  await businesses.updateOne({ businessId }, { $set: { name, meta } });
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

/** The public booking page's settings and how much it has been used. Admin-only. */
export async function readOnlineBookingStatus(businessId: string): Promise<OnlineBookingStatus> {
  await requireAdmin();
  const businesses = await businessesCollection();
  const doc = await businesses.findOne({ businessId });
  const db = await getDb();
  const requestCount = await db
    .collection("bookings")
    .countDocuments({ businessId, "request.code": { $type: "string" } });
  return {
    enabled: doc?.onlineBooking?.enabled ?? false,
    slug: doc?.onlineBooking?.slug ?? null,
    hasBookings: doc?.modules.includes("bookings") ?? false,
    requestCount,
  };
}

/**
 * Switches the public booking page on or off and sets its link. Admin-only,
 * because switching it on publishes a page anyone can reach without an
 * account. A link another business already uses is refused by the unique
 * index as well as by the check here.
 */
export async function setOnlineBooking(
  businessId: string,
  settings: { enabled: boolean; slug: string },
): Promise<void> {
  await requireAdmin();

  const slug = settings.slug.trim().toLowerCase();
  if (!/^[a-z0-9-]{3,40}$/.test(slug) || slug.startsWith("-") || slug.endsWith("-")) {
    throw new InputError(
      "The link name needs 3 to 40 lower-case letters, digits or dashes, not starting or ending with a dash.",
    );
  }
  if (RESERVED_SLUGS.includes(slug)) {
    throw new InputError(`"${slug}" is reserved. Choose another link name.`);
  }

  const businesses = await businessesCollection();
  const doc = await businesses.findOne({ businessId });
  if (!doc) throw new InputError("That business is no longer on file.");
  if (settings.enabled && !doc.modules.includes("bookings")) {
    throw new InputError(`Grant the Bookings module to ${doc.name} before opening its booking page.`);
  }

  try {
    await businesses.updateOne(
      { businessId },
      { $set: { onlineBooking: { enabled: settings.enabled, slug } } },
    );
  } catch (error) {
    if (isDuplicateKey(error)) {
      throw new InputError(`Another business already uses /book/${slug}.`);
    }
    throw error;
  }
}
