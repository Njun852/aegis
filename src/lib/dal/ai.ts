import "server-only";

import { tenantScope } from "./tenant";
import type { AiKind, AiOutputDocument, AiUsageDocument } from "@/types";

const OUTPUTS = "aiOutputs";
const USAGE = "aiUsage";

/**
 * Generated text and the spend that produced it are both tenant-owned, so both
 * go through `tenantScope`. One business must never read another's cached
 * output — the cache holds summaries of their mail.
 */
async function outputs() {
  return tenantScope<AiOutputDocument>(OUTPUTS);
}

async function usage() {
  return tenantScope<AiUsageDocument>(USAGE);
}

/** "2026-08" for the current month, in the server's timezone. */
export function currentPeriod(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * A previous generation for exactly these inputs, or `null`. This is the single
 * most important call in the AI path: a hit means no request, no tokens, no
 * latency.
 */
export async function readCachedOutput<T>(
  kind: AiKind,
  cacheKey: string,
  promptVersion: number,
): Promise<T | null> {
  const collection = await outputs();
  const doc = await collection.findOne({ kind, cacheKey, promptVersion });
  return doc ? (doc.payload as T) : null;
}

export async function writeCachedOutput(
  kind: AiKind,
  cacheKey: string,
  promptVersion: number,
  payload: unknown,
  model: string,
): Promise<void> {
  const collection = await outputs();
  await collection.updateOne(
    { kind, cacheKey },
    {
      $set: { promptVersion, payload, model, createdAt: new Date() },
      // businessId, kind and cacheKey are equality terms in the filter, so
      // Mongo seeds them onto an inserted document itself.
    },
    { upsert: true },
  );
}

/** Total tokens this business has spent in the current calendar month. */
export async function tokensUsedThisMonth(now = new Date()): Promise<number> {
  const collection = await usage();
  const [result] = await collection
    .aggregate([
      { $match: { period: currentPeriod(now) } },
      { $group: { _id: null, total: { $sum: "$totalTokens" } } },
    ])
    .toArray();

  return (result?.total as number | undefined) ?? 0;
}

export async function recordUsage(entry: {
  kind: AiKind;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  outcome: AiUsageDocument["outcome"];
}): Promise<void> {
  const collection = await usage();
  const now = new Date();

  await collection.insertOne({
    kind: entry.kind,
    model: entry.model,
    inputTokens: entry.inputTokens,
    outputTokens: entry.outputTokens,
    totalTokens: entry.inputTokens + entry.outputTokens,
    latencyMs: entry.latencyMs,
    outcome: entry.outcome,
    period: currentPeriod(now),
    createdAt: now,
  });
}

export interface AiSpendSummary {
  period: string;
  totalTokens: number;
  budget: number;
  calls: number;
}

/** What the current month has cost, for an admin read-out. */
export async function spendThisMonth(
  budget: number,
  now = new Date(),
): Promise<AiSpendSummary> {
  const collection = await usage();
  const period = currentPeriod(now);
  const [result] = await collection
    .aggregate([
      { $match: { period } },
      {
        $group: {
          _id: null,
          total: { $sum: "$totalTokens" },
          calls: { $sum: 1 },
        },
      },
    ])
    .toArray();

  return {
    period,
    totalTokens: (result?.total as number | undefined) ?? 0,
    budget,
    calls: (result?.calls as number | undefined) ?? 0,
  };
}
