import "server-only";

import { pruneOutputsOutside, readLatestOutput } from "@/lib/dal/ai";
import { cacheKeyFor } from "./generate";
import type { AiKind, AiResult } from "@/types";

/**
 * The rule both daily reports share: about today, refreshed at most once an
 * hour.
 *
 * Today's figures move all day, so a report keyed on them alone would be paid
 * for again with every sale and every five-minute ad sync. Instead each report
 * is filed under its day, and a new one is written only when the latest is at
 * least an hour old **and** the figures have changed since it was written. A
 * quiet afternoon costs nothing; a busy one costs at most one request an hour,
 * and only while someone is actually opening the report.
 */

export const REFRESH_AFTER_MS = 60 * 60 * 1000;

export interface TimedReport {
  text: string;
  /** ISO 8601: when this report was written. */
  at: string;
}

/** Key under the day, so the day's latest can be found whatever its figures were. */
export function hourlyKey(day: string, facts: unknown): string {
  return `${day}:${cacheKeyFor(facts)}`;
}

/** The latest report written today, or null. A cache read only — safe while rendering. */
export async function latestReport(
  kind: AiKind,
  day: string,
  promptVersion: number,
): Promise<TimedReport | null> {
  const latest = await readLatestOutput<string>(kind, `${day}:`, promptVersion);
  return latest ? { text: latest.payload, at: latest.createdAt.toISOString() } : null;
}

/**
 * Today's report: the stored one while it is under an hour old or the figures
 * have not moved, otherwise a fresh one from `write`, which is given the key
 * to file it under.
 */
export async function hourlyReport(
  kind: AiKind,
  day: string,
  promptVersion: number,
  facts: unknown,
  write: (cacheKey: string) => Promise<AiResult<string>>,
  now = new Date(),
): Promise<AiResult<TimedReport>> {
  const cacheKey = hourlyKey(day, facts);
  const latest = await readLatestOutput<string>(kind, `${day}:`, promptVersion);
  if (latest && (latest.cacheKey === cacheKey || now.getTime() - latest.createdAt.getTime() < REFRESH_AFTER_MS)) {
    return { ok: true, data: { text: latest.payload, at: latest.createdAt.toISOString() }, cached: true };
  }

  const result = await write(cacheKey);
  if (!result.ok) {
    // Out of budget or unreachable: an older report today is better than none.
    return latest
      ? { ok: true, data: { text: latest.payload, at: latest.createdAt.toISOString() }, cached: true }
      : result;
  }
  // Earlier days' reports are never read again.
  if (!result.cached) await pruneOutputsOutside(kind, `${day}:`);
  return { ok: true, data: { text: result.data, at: now.toISOString() }, cached: result.cached };
}
