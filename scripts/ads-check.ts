/**
 * Meta Ads rehearsal.
 *
 *   npm run ads:check                # mapping checks on recorded responses only
 *   npm run ads:check -- BIZ-1001    # …then read that business's connected account
 *   npm run ads:check -- --env       # …or read META_ACCESS_TOKEN / META_AD_ACCOUNT_ID
 *
 * Part one proves the arithmetic. It runs the mapping over fixed, hand-written
 * Meta responses and asserts spend, results, cost per result, state and budget.
 * That matters because the sandbox account has no delivery — every figure it
 * returns is zero — so correctness has to be shown on fixtures until a real
 * account is connected.
 *
 * Part two, when asked for, runs exactly the reads a sync makes and prints what
 * it would store. **Nothing is written** — not to the database, not to Meta.
 * The token is never printed.
 *
 * Runs with `--conditions=react-server` so the `server-only` marker resolves to
 * an empty module instead of throwing.
 */
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import { accountTotals, costPerResultCents } from "@/lib/ads";
import { explainMetaFailure } from "@/lib/meta/failures";
import { fetchAccount, inspectAdAccount } from "@/lib/meta/fetch";
import { mapSnapshot, type MetaSnapshot } from "@/lib/meta/mapping";
import { windowForRange } from "@/lib/meta/ranges";
import { decryptSecret } from "@/lib/auth/secrets";
import type { BusinessDocument } from "@/types";

// ---- Part one: the arithmetic ----------------------------------------------

const empty = { campaigns: [], adsets: [], ads: [] };

const fixture: MetaSnapshot = {
  campaigns: [
    {
      id: "c1",
      name: "Fleet Leads",
      status: "ACTIVE",
      effective_status: "ACTIVE",
      objective: "OUTCOME_LEADS",
      daily_budget: "50000",
      start_time: "2026-08-04T00:00:00+0800",
    },
    {
      id: "c2",
      name: "Workshop Traffic",
      status: "PAUSED",
      effective_status: "PAUSED",
      objective: "OUTCOME_TRAFFIC",
    },
    {
      id: "c3",
      name: "Tyre Awareness",
      status: "ACTIVE",
      effective_status: "DISAPPROVED",
      objective: "OUTCOME_AWARENESS",
      lifetime_budget: "250000",
    },
  ],
  adsets: [
    {
      id: "a1",
      name: "Metro Manila 25-54",
      campaign_id: "c1",
      status: "ACTIVE",
      effective_status: "ACTIVE",
      optimization_goal: "LEAD_GENERATION",
      learning_stage_info: { status: "LEARNING" },
      targeting: { geo_locations: { countries: ["PH"] }, age_min: 25, age_max: 54 },
    },
    {
      id: "a2",
      name: "Clicks",
      campaign_id: "c2",
      status: "ACTIVE",
      effective_status: "CAMPAIGN_PAUSED",
      optimization_goal: "LINK_CLICKS",
      // Switched on, inside a paused campaign: must not count toward the
      // account's daily budget.
      daily_budget: "40000",
    },
    {
      id: "a3",
      name: "Landing views",
      campaign_id: "c2",
      status: "ACTIVE",
      effective_status: "CAMPAIGN_PAUSED",
      optimization_goal: "LANDING_PAGE_VIEWS",
    },
  ],
  ads: [
    {
      id: "x1",
      name: "Carousel",
      adset_id: "a1",
      campaign_id: "c1",
      status: "ACTIVE",
      effective_status: "PENDING_REVIEW",
      creative: { title: "Book now", body: "Fleet inspection", call_to_action_type: "BOOK_TRAVEL" },
    },
  ],
  insights: {
    last_30d: {
      campaigns: [
        {
          campaign_id: "c1",
          spend: "1234.56",
          impressions: "40000",
          reach: "21000",
          // The same 12 leads under two action types: must count 12, not 24.
          actions: [
            { action_type: "lead", value: "12" },
            { action_type: "onsite_conversion.lead_grouped", value: "12" },
          ],
          purchase_roas: [{ action_type: "omni_purchase", value: "2.456" }],
        },
        {
          campaign_id: "c2",
          spend: "100",
          actions: [
            { action_type: "link_click", value: "50" },
            { action_type: "landing_page_view", value: "20" },
          ],
        },
        { campaign_id: "c3", spend: "0", reach: "5000" },
      ],
      adsets: [
        { adset_id: "a1", spend: "1234.56", actions: [{ action_type: "lead", value: "12" }] },
        { adset_id: "a2", spend: "60", actions: [{ action_type: "link_click", value: "50" }] },
      ],
      ads: [
        {
          ad_id: "x1",
          spend: "1234.56",
          actions: [{ action_type: "lead", value: "12" }],
          // Meta's own result field wins over the worked-out one.
          results: [{ indicator: "actions:lead", values: [{ value: "11" }] }],
        },
      ],
    },
    last_7d: {
      campaigns: [{ campaign_id: "c1", spend: "300", actions: [{ action_type: "lead", value: "3" }] }],
      adsets: [],
      ads: [],
    },
    maximum: empty,
  },
};

const rows = mapSnapshot(fixture);
const row = (id: string) => {
  const found = rows.find((entry) => entry.id === id);
  assert.ok(found, `row ${id} missing`);
  return found;
};

assert.equal(rows.length, 7, "3 campaigns + 3 ad sets + 1 ad");

const c1 = row("c1");
assert.equal(c1.spendCents, 123456, "spend string to minor units");
assert.equal(c1.results, 12, "duplicate lead action types counted once");
assert.equal(c1.resultLabel, "leads");
assert.equal(costPerResultCents(c1), 10288, "cost per result = 1234.56 / 12");
assert.equal(c1.roas, 2.46);
assert.equal(c1.budgetType, "Daily");
assert.equal(c1.budgetCents, 50000, "budgets already in minor units");
assert.equal(c1.state, "Active");
assert.equal(c1.enabled, true);
assert.equal(c1.metrics.last_7d.spendCents, 30000, "7-day figures kept separately");
assert.equal(c1.metrics.last_7d.results, 3);
assert.equal(c1.metrics.maximum.spendCents, 0, "a range with no insight row is zero, not missing");

const c2 = row("c2");
assert.equal(c2.resultLabel, "mixed results", "ad sets chasing different results");
assert.equal(c2.results, 0, "no invented total across unlike results");
assert.equal(costPerResultCents(c2), 0, "no cost per result when results are mixed");
assert.equal(c2.state, "Paused");
assert.equal(c2.enabled, false);

const c3 = row("c3");
assert.equal(c3.state, "Rejected");
assert.equal(c3.results, 5000, "awareness with no ad sets falls back to reach");
assert.equal(c3.budgetType, "Lifetime");

const a1 = row("a1");
assert.equal(a1.state, "Learning");
assert.equal(a1.parent, "Fleet Leads");
assert.equal(a1.audience, "PH · 25–54");

const a2 = row("a2");
assert.equal(a2.results, 50);
assert.equal(costPerResultCents(a2), 120, "60.00 / 50 clicks");
assert.equal(a2.state, "Paused", "CAMPAIGN_PAUSED reads as Paused");

const x1 = row("x1");
assert.equal(x1.results, 11, "Meta's own results field preferred");
assert.equal(x1.state, "In review");
assert.equal(x1.budgetType, "", "ads inherit budget");
assert.equal(x1.headline, "Book now");

const totals = accountTotals(
  rows.map((entry) => ({ ...entry, businessId: "" })),
  { spentTodayCents: 7000 },
);
assert.equal(totals.dailyBudgetCents, 50000, "only budgets that can spend: c1, not a2 inside paused c2");
assert.equal(totals.spentTodayCents, 7000, "today's spend is Meta's figure");
assert.equal(totals.resultLabel, null, "leads and mixed results are not totalled");
assert.equal(totals.costPerResultCents, 0, "no account cost per result across unlike results");

// Booking windows match Meta's date presets: whole days in the account's time
// zone, ending at the start of today. 10:00 in Manila is 02:00 UTC.
const now = new Date("2026-09-21T02:00:00Z");
const week = windowForRange("last_7d", "Asia/Manila", now);
assert.equal(week.to?.toISOString(), "2026-09-20T16:00:00.000Z", "today excluded: ends at Manila midnight");
assert.equal(week.from?.toISOString(), "2026-09-13T16:00:00.000Z", "seven whole Manila days");
assert.equal(windowForRange("last_30d", "Asia/Manila", now).from?.toISOString(), "2026-08-21T16:00:00.000Z");
const all = windowForRange("maximum", "Asia/Manila", now);
assert.equal(all.from, null, "maximum has no lower bound");
assert.equal(all.to, null, "maximum includes today");
assert.equal(windowForRange("last_7d", "Not/AZone", now).to?.toISOString(), "2026-09-21T00:00:00.000Z", "unknown zone falls back to UTC");

console.log(`✓ booking windows match Meta's date presets`);
console.log(`✓ mapping: ${rows.length} rows, spend, results, cost per result, state and budgets all as expected`);

// ---- Part two: a live, read-only run ----------------------------------------

const target = process.argv[2];
if (!target) process.exit(0);

let credentials: { adAccountId: string; token: string } | null = null;
let label = "";

if (target === "--env") {
  const token = process.env.META_ACCESS_TOKEN?.trim();
  const adAccountId = process.env.META_AD_ACCOUNT_ID?.trim();
  if (!token || !adAccountId) {
    console.error("META_ACCESS_TOKEN and META_AD_ACCOUNT_ID must both be set in .env.local.");
    process.exit(1);
  }
  credentials = { token, adAccountId };
  label = ".env.local";
} else {
  const mongo = await new MongoClient(process.env.MONGODB_URI!).connect();
  const business = await mongo
    .db(process.env.MONGODB_DB_NAME!)
    .collection<BusinessDocument>("businesses")
    .findOne({ businessId: target });
  await mongo.close();

  const config = business?.metaAds;
  if (!business || !config) {
    console.error(`${target} has no Meta ad account connected. Connect one in Business Management first.`);
    process.exit(1);
  }
  const token = decryptSecret(config.secretCipher);
  if (!token) {
    console.error("The stored token could not be decrypted — the credential key has changed. Reconnect the account.");
    process.exit(1);
  }
  credentials = { token, adAccountId: config.adAccountId };
  label = `${business.name} (${target})`;
}

console.log(`\nReading ${credentials.adAccountId} from ${label}, read-only…`);

const inspection = await inspectAdAccount(credentials);
if (!inspection.ok) {
  console.error(`FAILED — ${inspection.reason}: ${explainMetaFailure(inspection.reason)}`);
  console.error(`  underlying: ${inspection.detail}`);
  process.exit(1);
}
const { info, canWrite } = inspection.data;
console.log(`  account  : ${info.accountName} · ${info.currency} · ${info.timezone}`);
console.log(
  `  token    : ${canWrite ? "can also change ads (ads_management) — a read-only token is safer" : canWrite === false ? "read-only" : "permissions not reported"}`,
);

const started = Date.now();
const fetched = await fetchAccount(credentials);
if (!fetched.ok) {
  console.error(`FAILED — ${fetched.reason}: ${explainMetaFailure(fetched.reason)}`);
  console.error(`  underlying: ${fetched.detail}`);
  process.exit(1);
}

const live = mapSnapshot(fetched.data.snapshot);
console.log(
  `  fetched  : ${Date.now() - started}ms · ${live.length} rows${fetched.data.truncated ? " (TRUNCATED at the page cap)" : ""} · spent today ${fetched.data.spentTodayCents / 100} ${info.currency}\n`,
);
for (const entry of live) {
  const money = (cents: number) => `${(cents / 100).toFixed(2)} ${info.currency}`;
  console.log(
    `  ${entry.level.padEnd(9)} ${entry.state.padEnd(9)} ${entry.name}` +
      `  · 30d ${money(entry.spendCents)} · ${entry.results} ${entry.resultLabel}`,
  );
}
console.log("\nNothing was written — not to the database, not to Meta.");
