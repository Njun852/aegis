import "server-only";

import { readAiHealth, spendThisMonth } from "./ai";
import { adRowCount } from "./ads";
import { pingDatabase } from "./db";
import { readMailFreshness } from "./mail";
import { AI_MODELS, AI_MONTHLY_TOKEN_BUDGET, isAiConfigured } from "@/lib/ai/client";
import { freshnessTone, relativeAge } from "@/lib/freshness";
import {
  isMailboxConnected,
  isMetaConnected,
  mailboxAddress,
} from "@/lib/integrations";
import type {
  IntegrationStatus,
  StatusFailure,
  SystemStatus,
} from "@/types";

/**
 * Everything the system-status screen reports, read fresh on every request.
 *
 * The pass condition for this screen is that the owner can identify a failed or
 * stale integration without reading logs or source code, so every reading here
 * is taken live: the database is pinged rather than assumed up, mail freshness
 * comes from the newest message rather than a timer, and the OpenAI state comes
 * from the usage log that every call has always written to.
 */
export async function readSystemStatus(): Promise<SystemStatus> {
  const now = new Date();

  const [ping, mail, spend, health, adRows] = await Promise.all([
    pingDatabase(),
    readMailFreshness(),
    spendThisMonth(AI_MONTHLY_TOKEN_BUDGET, now),
    readAiHealth(5, now),
    adRowCount(),
  ]);

  const integrations: IntegrationStatus[] = [];

  // --- Mail ---------------------------------------------------------------
  const mailConnected = isMailboxConnected();
  const mailAge = relativeAge(mail.newestReceivedAt, now.getTime());
  const mailTone = freshnessTone(mail.newestReceivedAt, now.getTime());

  integrations.push({
    key: "mail",
    label: "Mail",
    state: !mailConnected
      ? "DISCONNECTED"
      : mailTone === "fresh"
        ? "ONLINE"
        : "STALE",
    detail: mailConnected
      ? mailTone === "fresh"
        ? "Mail is being retrieved from the connected mailbox."
        : "No mail has been retrieved recently. What is shown may be out of date."
      : "No mailbox is connected. Mail is running on the seeded sample inbox, not on real correspondence.",
    facts: [
      { label: "Mailbox", value: mailboxAddress() ?? "None connected" },
      { label: "Messages held", value: String(mail.count) },
      { label: "Newest message", value: mailAge },
    ],
  });

  // --- OpenAI -------------------------------------------------------------
  const aiConfigured = isAiConfigured();
  const overBudget = spend.totalTokens >= spend.budget;
  // A failure only counts as the current state if nothing has succeeded since.
  const lastFailureAt = health.failures[0]?.at ?? null;
  const failingNow =
    lastFailureAt !== null &&
    (health.lastOkAt === null || lastFailureAt > health.lastOkAt);

  integrations.push({
    key: "openai",
    label: "OpenAI",
    state: !aiConfigured
      ? "DISCONNECTED"
      : overBudget || failingNow
        ? "ERROR"
        : "ONLINE",
    detail: !aiConfigured
      ? "No API key is configured. Every AI surface is running on its fallback copy."
      : overBudget
        ? "The monthly token budget has been reached. AI surfaces are on fallback copy until the period rolls over."
        : failingNow
          ? "The most recent model call failed. Summaries and suggested replies may be missing."
          : "Model calls are completing normally.",
    facts: [
      { label: "Model", value: aiConfigured ? AI_MODELS.fast : "—" },
      {
        label: `Tokens used (${spend.period})`,
        value: `${spend.totalTokens.toLocaleString()} of ${spend.budget.toLocaleString()}`,
      },
      { label: "Calls this month", value: String(spend.calls) },
      {
        label: "Last successful call",
        value: relativeAge(
          health.lastOkAt ? health.lastOkAt.toISOString() : null,
          now.getTime(),
        ),
      },
      { label: "Failures this month", value: String(health.failuresThisPeriod) },
    ],
  });

  // --- Database -----------------------------------------------------------
  integrations.push({
    key: "database",
    label: "Database",
    state: ping.ok ? "ONLINE" : "ERROR",
    detail: ping.ok
      ? "MongoDB answered a ping on this request."
      : `MongoDB did not answer: ${ping.error ?? "unknown error"}`,
    facts: [
      { label: "Database", value: ping.name },
      { label: "Ping", value: ping.ok ? `${ping.latencyMs} ms` : "no reply" },
    ],
  });

  // --- Meta ---------------------------------------------------------------
  const metaConnected = isMetaConnected();
  integrations.push({
    key: "meta",
    label: "Meta Ads",
    state: metaConnected ? "ONLINE" : "DISCONNECTED",
    detail: metaConnected
      ? "Ad performance is being retrieved from the connected Meta account."
      : "No Meta account is connected. Ads figures are stored records seeded from the design, not live performance.",
    facts: [
      { label: "Ad account", value: metaConnected ? "Connected" : "None connected" },
      { label: "Rows held", value: String(adRows) },
    ],
  });

  const failures: StatusFailure[] = health.failures.map((entry) => ({
    at: entry.at.toISOString(),
    surface: SURFACE_LABELS[entry.kind] ?? entry.kind,
    outcome: entry.outcome,
    detail: FAILURE_DETAIL[entry.outcome] ?? "The call did not return usable output.",
  }));

  return { integrations, failures, checkedAt: now.toISOString() };
}

const SURFACE_LABELS: Record<string, string> = {
  "dashboard-insight": "Dashboard commentary",
  "ads-insight": "Ads commentary",
  "mail-triage": "Mail triage",
  "compose-draft": "New email drafting",
  "mail-reply": "Reply drafting",
};

/** Plain readings of the outcome codes, so nobody has to look them up. */
const FAILURE_DETAIL: Record<string, string> = {
  "not-configured": "No API key was configured when the call was attempted.",
  "over-budget": "The monthly token budget had already been reached.",
  timeout: "The model did not respond within the time limit.",
  "rate-limited": "OpenAI rejected the call for rate limiting.",
  unusable: "The model replied, but the output failed validation and was discarded.",
  error: "The call failed. See the server log for the provider's message.",
};
