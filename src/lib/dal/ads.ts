import "server-only";

import type { Filter } from "mongodb";
import { DEFAULT_AD_RANGE, type MetaRowDraft } from "@/lib/meta/mapping";
import { isMetaConfigured } from "./ad-account";
import { tenantScope } from "./tenant";
import type { AdRange, AdRow, AdRowDocument, AdSource } from "@/types";

const COLLECTION = "adRows";

/**
 * Ad rows are tenant-owned, so every call goes through `tenantScope`.
 *
 * Two kinds of row share the collection. **Sample** rows are the seeded design
 * fixtures (`scripts/seed.ts`). **Meta** rows are a read-only copy of a
 * connected ad account, written only by the sync (`src/lib/meta/sync.ts`).
 * A business sees exactly one kind: Meta rows once an ad account is connected,
 * sample rows otherwise. The two are never mixed on one screen, so a design
 * figure can never be mistaken for a real one sitting beside it.
 */
async function rows() {
  return tenantScope<AdRowDocument>(COLLECTION);
}

/** Rows seeded before `source` existed carry none, and are samples. */
function sourceFilter(source: AdSource): Filter<AdRowDocument> {
  return source === "meta" ? { source: "meta" } : { source: { $ne: "meta" } };
}

/** Which kind of row the active business should be looking at. */
export async function activeAdSource(): Promise<AdSource> {
  return (await isMetaConfigured()) ? "meta" : "sample";
}

/**
 * A stored row as the screen sees it. For Meta rows, the requested range's
 * figures replace the flat ones; sample rows have one set of figures and show
 * them whatever range is picked.
 */
function toRow(doc: AdRowDocument, range: AdRange = DEFAULT_AD_RANGE): AdRow {
  const metrics = doc.metrics?.[range];
  return {
    id: doc.id,
    businessId: doc.businessId,
    source: doc.source ?? "sample",
    level: doc.level,
    name: doc.name,
    parent: doc.parent,
    objective: doc.objective,
    state: doc.state,
    enabled: doc.enabled,
    budgetType: doc.budgetType,
    budgetCents: doc.budgetCents,
    spendCents: metrics?.spendCents ?? doc.spendCents,
    results: metrics?.results ?? doc.results,
    resultLabel: metrics?.resultLabel ?? doc.resultLabel,
    roas: metrics?.roas ?? doc.roas,
    reach: metrics?.reach ?? doc.reach,
    impressions: metrics?.impressions ?? doc.impressions,
    audience: doc.audience,
    placements: doc.placements,
    schedule: doc.schedule,
    learning: doc.learning,
    optimization: doc.optimization,
    format: doc.format,
    primary: doc.primary,
    headline: doc.headline,
    cta: doc.cta,
  };
}

/**
 * Every tier in one read. The three levels together are a few dozen rows, and
 * the screen switches between them client-side, so paging them separately would
 * cost a round trip per tab for no benefit.
 */
export async function listAdRows(range: AdRange = DEFAULT_AD_RANGE): Promise<AdRow[]> {
  const [collection, source] = await Promise.all([rows(), activeAdSource()]);
  const docs = await collection.find(sourceFilter(source)).toArray();
  return docs
    .map((doc) => toRow(doc, range))
    .sort((a, b) => b.spendCents - a.spendCents);
}

export async function getAdRow(id: string): Promise<AdRow | null> {
  const [collection, source] = await Promise.all([rows(), activeAdSource()]);
  const doc = await collection.findOne({ id, ...sourceFilter(source) });
  return doc ? toRow(doc) : null;
}

export type AdToggleOutcome = "ok" | "not-found" | "read-only";

/**
 * Flips one sample row's switch.
 *
 * Meta rows are refused, not just hidden in the interface: AEGIS reads ad
 * accounts and never changes them, so flipping a switch here would only make
 * the screen disagree with Meta about whether an ad is running.
 */
export async function setAdEnabled(
  id: string,
  enabled: boolean,
): Promise<AdToggleOutcome> {
  const collection = await rows();
  const doc = await collection.findOne({ id });
  if (!doc) return "not-found";
  if (doc.source === "meta") return "read-only";

  const result = await collection.updateOne(
    { id, ...sourceFilter("sample") },
    { $set: { enabled, updatedAt: new Date() } },
  );
  return result.matchedCount > 0 ? "ok" : "not-found";
}

/**
 * Writes one successful sync. Called only after every fetch succeeded, so a
 * failed sync never leaves a half-updated account behind.
 *
 * Rows Meta no longer returned are removed — unless the fetch hit the page cap,
 * in which case "missing" might only mean "not fetched", and deleting it would
 * be wrong.
 */
export async function replaceMetaRows(
  drafts: MetaRowDraft[],
  truncated: boolean,
): Promise<number> {
  const collection = await rows();
  const now = new Date();

  for (const draft of drafts) {
    await collection.updateOne(
      { id: draft.id },
      { $set: { ...draft, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true },
    );
  }

  if (!truncated) {
    await collection.deleteMany({
      source: "meta",
      id: { $nin: drafts.map((draft) => draft.id) },
    });
  }
  return drafts.length;
}

/** How many campaigns, ad sets and ads are stored. Used by the status screen. */
export async function adRowCount(): Promise<number> {
  const collection = await rows();
  return collection.countDocuments();
}
