"use server";

import { revalidatePath } from "next/cache";
import { generateAdsInsight } from "@/lib/ai/ads-insight";
import { draftEmail } from "@/lib/ai/compose";
import { generateInsight } from "@/lib/ai/insight";
import { triageInbox } from "@/lib/ai/mail-triage";
import { isAiConfigured } from "@/lib/ai/client";
import { explainFailure } from "@/lib/ai/failures";
import { requireModule } from "@/lib/dal/businesses";
import { DATE_RANGES } from "@/lib/data/dashboard";
import type { DateRange } from "@/types";

/**
 * The only entry points to the model from the browser. Each one asserts the
 * module entitlement first — the same boundary the bookings and inventory
 * actions use — so a hand-crafted POST cannot spend tokens on a business that
 * is not entitled to the screen it belongs to.
 */

export interface InsightState {
  text: string | null;
  note: string | null;
}

export async function generateInsightAction(
  range: DateRange,
): Promise<InsightState> {
  await requireModule("dashboard");

  // The range comes from the browser, so it is checked rather than trusted —
  // everything else the prompt sees is assembled server-side from the tenant's
  // own collections.
  if (!DATE_RANGES.includes(range)) {
    return { text: null, note: null };
  }

  if (!isAiConfigured()) return { text: null, note: null };

  const result = await generateInsight(range);
  return result.ok
    ? { text: result.data, note: null }
    : { text: null, note: explainFailure(result.reason) };
}

export interface SyncInboxState {
  analysed: number;
  pending: number;
  note: string | null;
}

/**
 * Runs on "Sync now". Analyses only what has never been analysed, so pressing
 * it repeatedly on an already-triaged inbox does nothing and costs nothing.
 */
export async function syncInboxAction(): Promise<SyncInboxState> {
  await requireModule("mail");

  if (!isAiConfigured()) {
    return { analysed: 0, pending: 0, note: null };
  }

  const report = await triageInbox();
  if (report.analysed > 0) {
    revalidatePath("/mail");
    revalidatePath("/dashboard");
  }

  return {
    analysed: report.analysed,
    pending: report.pending,
    note: report.stoppedBecause ? explainFailure(report.stoppedBecause) : null,
  };
}

export interface ComposeDraftState {
  subject: string | null;
  body: string | null;
  note: string | null;
}

export async function draftEmailAction(
  to: string,
  intent: string,
): Promise<ComposeDraftState> {
  await requireModule("mail");

  const trimmed = intent.trim();
  if (!trimmed) {
    return { subject: null, body: null, note: "Say what the email should do." };
  }

  if (!isAiConfigured()) {
    return {
      subject: null,
      body: null,
      note: explainFailure("not-configured"),
    };
  }

  const result = await draftEmail({ to: to.trim(), intent: trimmed });
  return result.ok
    ? { subject: result.data.subject, body: result.data.body, note: null }
    : { subject: null, body: null, note: explainFailure(result.reason) };
}

export async function generateAdsInsightAction(): Promise<InsightState> {
  await requireModule("ads");

  if (!isAiConfigured()) return { text: null, note: null };

  const result = await generateAdsInsight();
  return result.ok
    ? { text: result.data, note: null }
    : { text: null, note: explainFailure(result.reason) };
}
