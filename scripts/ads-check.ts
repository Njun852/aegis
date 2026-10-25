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
import { mapSnapshot, readOfDay, spendOfDay, type MetaSnapshot } from "@/lib/meta/mapping";
import { dayFigures, windowForRange } from "@/lib/meta/ranges";
import { buildFunnel, periodLabel } from "@/lib/ad-funnel";
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
    today: {
      campaigns: [
        { campaign_id: "c1", spend: "45.50", actions: [{ action_type: "lead", value: "1" }], date_start: "2026-09-21" },
        // A campaign since deleted still spent today, and counts toward the account's spend.
        { campaign_id: "gone", spend: "24.50", date_start: "2026-09-21" },
      ],
      adsets: [],
      ads: [],
    },
    yesterday: {
      campaigns: [{ campaign_id: "c1", spend: "120", actions: [{ action_type: "lead", value: "2" }], date_start: "2026-09-20" }],
      adsets: [
        { adset_id: "a1", spend: "120", date_start: "2026-09-20" },
        // With `results` asked for, Meta sends a row even for what did not run.
        { adset_id: "a2", spend: "0", impressions: "0", date_start: "2026-09-20" },
      ],
      ads: [],
    },
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
assert.equal(c1.metrics.today.spendCents, 4550, "today's figures kept separately");
assert.equal(c1.metrics.yesterday.spendCents, 12000, "yesterday's figures kept separately");
assert.equal(c1.metrics.yesterday.results, 2);
assert.equal(row("c2").metrics.today.spendCents, 0);

// Today's spend for the pacing bar comes from today's campaign rows, with no
// call of its own, deleted campaigns included.
assert.equal(spendOfDay(fixture.insights.today), 7000, "45.50 + 24.50, the deleted campaign counted");
assert.equal(spendOfDay(empty), 0, "no row is a real zero");
assert.deepEqual(readOfDay(fixture.insights.yesterday), { rows: 2, reportedDate: "2026-09-20" }, "a row with no delivery is not counted");
assert.deepEqual(readOfDay(empty), { rows: 0, reportedDate: null }, "nothing returned names no day");
assert.equal(
  readOfDay({ campaigns: [{ campaign_id: "c1", spend: "0", impressions: "0", date_start: "2026-09-21" }], adsets: [], ads: [] }).rows,
  0,
  "rows for everything and delivery on nothing is a day Meta has not reported",
);

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

// Today and yesterday: one Manila day each, today running to tomorrow's midnight.
const todayWindow = windowForRange("today", "Asia/Manila", now);
assert.equal(todayWindow.from?.toISOString(), "2026-09-20T16:00:00.000Z", "today starts at Manila midnight");
assert.equal(todayWindow.to?.toISOString(), "2026-09-21T16:00:00.000Z", "and ends at the next one");
const yesterdayWindow = windowForRange("yesterday", "Asia/Manila", now);
assert.equal(yesterdayWindow.from?.toISOString(), "2026-09-19T16:00:00.000Z");
assert.equal(yesterdayWindow.to?.toISOString(), "2026-09-20T16:00:00.000Z", "yesterday ends where today starts");
// 00:30 in Manila is still the day before in UTC: the day is Manila's, not the server's.
const justAfterMidnight = new Date("2026-09-20T16:30:00Z");
assert.equal(windowForRange("today", "Asia/Manila", justAfterMidnight).from?.toISOString(), "2026-09-20T16:00:00.000Z");
// The account's own zone decides, when it is not Manila.
assert.equal(windowForRange("today", "America/New_York", now).from?.toISOString(), "2026-09-20T04:00:00.000Z");
// A 23-hour day: New York's clocks go forward on 8 March 2026.
const springForward = windowForRange("yesterday", "America/New_York", new Date("2026-03-09T15:00:00Z"));
assert.equal(springForward.from?.toISOString(), "2026-03-08T05:00:00.000Z");
assert.equal(springForward.to?.toISOString(), "2026-03-09T04:00:00.000Z", "a short day still ends at midnight");
assert.equal(periodLabel(todayWindow.from, todayWindow.to, "Asia/Manila"), "Sep 21, 2026", "a single day is named once");
assert.equal(periodLabel(week.from, week.to, "Asia/Manila"), "Sep 14 – Sep 20, 2026");

// Whether the stored day is the day meant now, and plain words when it is not.
const synced = { today: { date: "2026-09-21", rows: 3 }, yesterday: { date: "2026-09-20", rows: 4 } };
assert.equal(dayFigures("today", synced, "Asia/Manila", now).missing, null, "synced today: today's figures are here");
assert.equal(dayFigures("today", synced, "Asia/Manila", now).label, "Sep 21, 2026");
assert.equal(dayFigures("yesterday", synced, "Asia/Manila", now).missing, null);
const nextMorning = new Date("2026-09-22T01:00:00Z");
const stale = dayFigures("today", synced, "Asia/Manila", nextMorning);
assert.equal(stale.read, false, "yesterday's sync does not hold today");
assert.match(stale.missing ?? "", /has not read today \(Sep 22, 2026\) from Meta yet/);
assert.equal(dayFigures("yesterday", synced, "Asia/Manila", nextMorning).read, false, "its yesterday is the day before");
const quiet = dayFigures("today", { ...synced, today: { date: "2026-09-21", rows: 0 } }, "Asia/Manila", now);
assert.equal(quiet.read, true);
assert.match(quiet.missing ?? "", /Meta has not reported anything for today \(Sep 21, 2026\) yet/);
assert.equal(dayFigures("today", null, "Asia/Manila", now).read, false, "a sync from before these ranges existed");

// A day without Meta's figures: bookings still counted, spend unknown, never free per booking.
const unknownDay = buildFunnel({
  campaigns: [{ id: "c1", name: "Fleet Leads", enabled: true, spendCents: 0, results: 0, resultLabel: "conversations" }],
  confirmedByCampaign: { c1: 2 },
  chatsByCampaign: {},
  bookings: [],
  uncreditedConfirmed: 1,
  periodLabel: "Sep 22, 2026",
  missingFigures: stale.missing,
});
assert.equal(unknownDay.totals.confirmedBookings, 2);
assert.equal(unknownDay.totals.costPerBookingCents, null, "no cost per booking without spend");
assert.equal(unknownDay.rows[0].conversations, null);
assert.equal(unknownDay.rows[0].flag, null, "nothing to judge");
assert.equal(unknownDay.missingFigures, stale.missing);

console.log(`✓ booking windows match Meta's date presets, today and yesterday included`);
console.log(`✓ today and yesterday: Manila days, stale and unreported days said plainly, never zero`);
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
  `  fetched  : ${Date.now() - started}ms · ${live.length} rows${fetched.data.truncated ? " (TRUNCATED at the page cap)" : ""} · spent today ${fetched.data.spentTodayCents / 100} ${info.currency}`,
);
for (const range of ["today", "yesterday"] as const) {
  const read = fetched.data.days[range];
  console.log(
    `  ${range.padEnd(9)}: ${read.rows ? `delivery on ${read.rows} campaigns, ad sets and ads, ${read.reportedDate}` : "Meta reported nothing for this day yet"}`,
  );
}
console.log("");
for (const entry of live) {
  const money = (cents: number) => `${(cents / 100).toFixed(2)} ${info.currency}`;
  console.log(
    `  ${entry.level.padEnd(9)} ${entry.state.padEnd(9)} ${entry.name}` +
      `  · today ${money(entry.metrics.today.spendCents)} · yesterday ${money(entry.metrics.yesterday.spendCents)}` +
      ` · 30d ${money(entry.spendCents)} · ${entry.results} ${entry.resultLabel}`,
  );
}
console.log("\nNothing was written — not to the database, not to Meta.");
