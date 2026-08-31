import "server-only";

import { tenantScope } from "./tenant";
import type { AdRow, AdRowDocument } from "@/types";

const COLLECTION = "adRows";

/**
 * Ad accounts are tenant-owned, so every call goes through `tenantScope`.
 *
 * Nothing authenticates against Meta yet — `scripts/seed.ts` loads the account
 * into this collection. The one genuinely live piece is the per-row on/off
 * switch, which writes here; when the Marketing API lands it replaces the seed
 * and pushes that switch upstream, and nothing above this file changes.
 */
async function rows() {
  return tenantScope<AdRowDocument>(COLLECTION);
}

function toRow(doc: AdRowDocument): AdRow {
  return {
    id: doc.id,
    businessId: doc.businessId,
    level: doc.level,
    name: doc.name,
    parent: doc.parent,
    objective: doc.objective,
    state: doc.state,
    enabled: doc.enabled,
    budgetType: doc.budgetType,
    budgetCents: doc.budgetCents,
    spendCents: doc.spendCents,
    results: doc.results,
    resultLabel: doc.resultLabel,
    roas: doc.roas,
    reach: doc.reach,
    impressions: doc.impressions,
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
export async function listAdRows(): Promise<AdRow[]> {
  const collection = await rows();
  const docs = await collection.find().sort({ spendCents: -1 }).toArray();
  return docs.map(toRow);
}

export async function getAdRow(id: string): Promise<AdRow | null> {
  const collection = await rows();
  const doc = await collection.findOne({ id });
  return doc ? toRow(doc) : null;
}

/**
 * Flips one row's switch. Returns whether a row actually matched, so the caller
 * can tell "turned off" from "that id is not in this account".
 */
export async function setAdEnabled(
  id: string,
  enabled: boolean,
): Promise<boolean> {
  const collection = await rows();
  const result = await collection.updateOne(
    { id },
    { $set: { enabled, updatedAt: new Date() } },
  );
  return result.matchedCount > 0;
}
