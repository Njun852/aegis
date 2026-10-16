import "server-only";

import { manilaDateKey } from "@/lib/booking-slots";
import { tenantScope } from "./tenant";
import type { AiFailure } from "@/types";

/**
 * One line per Ask AEGIS question: who asked what, which tools ran, and how it
 * ended. It is what the daily question limit counts, and the record if anyone
 * asks what the assistant was asked or said.
 */
export interface AskLogDocument {
  businessId: string;
  userId: string;
  question: string;
  tools: string[];
  answer: string;
  outcome: "ok" | AiFailure | "limit";
  /** Whether a model call was paid for, rather than served from the cache. */
  billed: boolean;
  createdAt: Date;
}

const log = () => tenantScope<AskLogDocument>("askLog");

export async function countAsksToday(now = new Date()): Promise<number> {
  const collection = await log();
  const midnight = new Date(`${manilaDateKey(now)}T00:00:00+08:00`);
  return collection.countDocuments({ createdAt: { $gte: midnight }, outcome: { $ne: "limit" } });
}

export async function recordAsk(entry: Omit<AskLogDocument, "businessId" | "createdAt">): Promise<void> {
  const collection = await log();
  await collection.insertOne({ ...entry, createdAt: new Date() });
}
