"use server";

import { revalidatePath } from "next/cache";
import { generateAdsInsight } from "@/lib/ai/ads-insight";
import { draftEmail } from "@/lib/ai/compose";
import {
  draftInboxReplies,
  draftReply,
  REPLY_PROMPT_VERSION,
} from "@/lib/ai/reply";
import { generateInsight } from "@/lib/ai/insight";
import { triageInbox } from "@/lib/ai/mail-triage";
import { isAiConfigured } from "@/lib/ai/client";
import { explainFailure } from "@/lib/ai/failures";
import { requireModule } from "@/lib/dal/businesses";
import { applyReplyDraft, findMessage } from "@/lib/dal/mail";
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
  /** Suggested Reply fields written on this run. */
  drafted: number;
  /** Messages still waiting for one, when the per-run cap was reached. */
  draftsPending: number;
  note: string | null;
}

/**
 * Runs on "Sync now". Analyses only what has never been analysed, so pressing
 * it repeatedly on an already-triaged inbox does nothing and costs nothing.
 */
export async function syncInboxAction(): Promise<SyncInboxState> {
  await requireModule("mail");

  if (!isAiConfigured()) {
    return { analysed: 0, pending: 0, drafted: 0, draftsPending: 0, note: null };
  }

  const report = await triageInbox();

  // Drafting runs second and only over what triage has already classified: the
  // draft depends on the category and the approval flag, so drafting first
  // would mean paying twice for the same message. If triage could not finish,
  // there is nothing newly eligible to draft, so this run stops here.
  const replies = report.stoppedBecause
    ? { pending: 0, drafted: 0, stoppedBecause: null }
    : await draftInboxReplies();

  if (report.analysed > 0 || replies.drafted > 0) {
    revalidatePath("/mail");
    revalidatePath("/dashboard");
  }

  const stopped = report.stoppedBecause ?? replies.stoppedBecause;

  return {
    analysed: report.analysed,
    pending: report.pending,
    drafted: replies.drafted,
    draftsPending: Math.max(0, replies.pending - replies.drafted),
    note: stopped ? explainFailure(stopped) : null,
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

export interface ReplyDraftState {
  body: string | null;
  note: string | null;
}

/**
 * Drafts a reply to one message, on request.
 *
 * Without `steer` this writes the message's stored Suggested Reply — used for a
 * message the sweep has not reached yet, since the per-run cap exists so a
 * large first sync cannot empty the budget.
 *
 * With `steer` — a suggestion chip, or the user's own words — it drafts that
 * particular reply and returns it for the composer without storing it. Both
 * paths run through the same guardrails, and the steer cannot loosen them.
 *
 * The message is re-read from the tenant's own collection rather than taken
 * from the browser: the only thing the client supplies is an id, so nothing a
 * caller sends can end up in the prompt.
 */
export async function draftReplyAction(
  messageId: string,
  steer?: string,
): Promise<ReplyDraftState> {
  await requireModule("mail");

  if (!isAiConfigured()) {
    return { body: null, note: explainFailure("not-configured") };
  }

  const message = await findMessage(messageId.trim());
  if (!message) {
    return { body: null, note: "That message is no longer in this inbox." };
  }

  const wanted = steer?.trim();
  const result = await draftReply(message, wanted || undefined);
  if (!result.ok) {
    return { body: null, note: explainFailure(result.reason) };
  }

  // A steered draft is one person's take on this message, so it goes to the
  // composer and no further. Only the neutral draft becomes the message's
  // stored Suggested Reply — the field the acceptance test reads.
  if (!wanted) {
    await applyReplyDraft(message.id, result.data.body, REPLY_PROMPT_VERSION);
    revalidatePath("/mail");
  }

  return { body: result.data.body, note: null };
}
