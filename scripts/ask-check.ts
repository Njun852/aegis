/**
 * Ask AEGIS rehearsal.
 *
 *   npm run ask:check
 *
 * Part one proves the pure parts without calling the model: periods in Manila
 * time (weeks from Monday, month and year ends), the model's plan being
 * checked (unknown tools dropped, at most four calls, duplicates removed,
 * a bad period read as all time), and record refs in an answer becoming the
 * right links.
 *
 * Part two makes sure the question log's index exists on the configured
 * database.
 *
 * Not reached here: the tools read through the session-bound DAL and the
 * answer needs the API, so a real question is asked in the browser.
 */
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import { ASK_INDEXES } from "@/lib/data/ask";
import { ASK_TOOLS, parsePlan, periodRange, refHref, splitRefs, suggestedQuestions } from "@/lib/ask";

// ---- Part one: periods, plans, links -----------------------------------------

// Wednesday 15 October 2026, 10:00 in Manila.
const now = new Date("2026-10-15T02:00:00Z");
const key = (date: Date | null) => (date ? new Date(date.getTime() + 8 * 3_600_000).toISOString().slice(0, 10) : null);

const week = periodRange("this_week", now);
assert.equal(key(week.from), "2026-10-12", "a week starts on Monday");
assert.equal(key(week.to), "2026-10-19");
assert.equal(key(periodRange("today", now).from), "2026-10-15");
assert.equal(periodRange("today", now).from?.toISOString(), "2026-10-14T16:00:00.000Z", "Manila midnight");
assert.equal(key(periodRange("last_month", now).from), "2026-09-01");
assert.equal(key(periodRange("last_month", now).to), "2026-10-01");
const january = new Date("2027-01-05T02:00:00Z");
assert.equal(key(periodRange("last_month", january).from), "2026-12-01", "last month across the year end");
assert.equal(key(periodRange("this_month", new Date("2026-12-20T02:00:00Z")).to), "2027-01-01");
const sunday = new Date("2026-10-18T02:00:00Z");
assert.equal(key(periodRange("this_week", sunday).from), "2026-10-12", "Sunday belongs to the week that began Monday");
assert.equal(periodRange("all", now).from, null);

const tools = [...ASK_TOOLS].filter((tool) => tool !== "inventory");
const plan = parsePlan(
  {
    calls: [
      { tool: "bookings", period: "this_week", status: "any", search: "", low_stock_only: false },
      { tool: "bookings", period: "this_week", status: "any", search: "", low_stock_only: false },
      { tool: "inventory", period: "all", status: "any", search: "", low_stock_only: true },
      { tool: "delete_everything", period: "all", status: "", search: "", low_stock_only: false },
      { tool: "quotations", period: "someday", status: "Sent", search: "", low_stock_only: false },
      { tool: "ads", period: "last_30_days", status: "any", search: "", low_stock_only: false },
      { tool: "money", period: "all", status: "any", search: "", low_stock_only: false },
      { tool: "mail", period: "all", status: "any", search: "", low_stock_only: false },
    ],
  },
  tools,
);
assert.ok(plan);
assert.deepEqual(
  plan.map((call) => call.tool),
  ["bookings", "quotations", "ads", "money"],
  "duplicates, unknown tools and tools the business lacks are dropped; four calls at most",
);
assert.equal(plan[1].period, "all", "a period the model made up reads as all time");
assert.equal(parsePlan({ calls: [] }, tools)?.length, 0, "no calls is a valid plan");
assert.equal(parsePlan({ nope: true }, tools), null, "a malformed plan is rejected");

assert.equal(refHref("QT-1004"), "/quotations/QT-1004");
assert.equal(refHref("JO-1001"), "/quotations/jobs/JO-1001");
assert.equal(refHref("BK-8251"), "/bookings?booking=BK-8251");
const parts = splitRefs("QT-1004 was approved; JO-1001 is open for BK-8251.");
assert.deepEqual(
  parts.filter((part) => part.href).map((part) => part.text),
  ["QT-1004", "JO-1001", "BK-8251"],
);
assert.equal(parts.map((part) => part.text).join(""), "QT-1004 was approved; JO-1001 is open for BK-8251.", "nothing lost");
assert.equal(splitRefs("No refs here.").length, 1);

assert.ok(suggestedQuestions(["bookings", "quotes"]).length <= 4);
assert.ok(!suggestedQuestions([]).some((question) => question.includes("quotation")), "only questions the business can ask");

console.log("✓ Manila periods, weeks from Monday, year ends; plans checked; refs become links");

// ---- Part two: the database -------------------------------------------------

const mongo = await new MongoClient(process.env.MONGODB_URI!).connect();
try {
  const db = mongo.db(process.env.MONGODB_DB_NAME!);
  for (const index of ASK_INDEXES) {
    await db.collection(index.collection).createIndex(index.keys, index.options ?? {});
  }
  console.log(`✓ ${ASK_INDEXES.length} Ask AEGIS index present on ${process.env.MONGODB_DB_NAME}`);
} finally {
  await mongo.close();
}
