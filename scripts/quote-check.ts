/**
 * Quotations rehearsal.
 *
 *   npm run quote:check
 *
 * Part one proves the arithmetic on the owner's own sample (Fortuner 2015,
 * WQN 733): line amounts, section totals, discount, markup and rounding, then
 * how amounts are read as typed, and how a line finds its remembered price.
 *
 * Part two proves the photo path without calling the model: that a reply is
 * validated, that a vehicle photo can never carry a price, and that draft
 * lines take their price from the photo, then the cost at markup, then the
 * price list, in that order.
 *
 * Part three makes sure the indexes exist on the configured database (a no-op
 * when they do), then proves the price list keeps one entry per wording per
 * business. It writes only under a throwaway business id and removes it.
 *
 * Not reached here: the DAL needs a signed-in session, and the PDF is JSX, so
 * the editor, the PDF and the email are checked in the browser.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { QUOTATION_INDEXES } from "@/lib/data/quotations";
import { draftLinesFromRead, parseQuotePhotoRead } from "@/lib/quote-photo";
import {
  defaultQuoteEmail,
  descriptionKey,
  emptyLine,
  formatAmount,
  formatQuoteDay,
  isDateKey,
  lineAmountCents,
  matchPriceItem,
  parseAmount,
  parseQty,
  priceFromCost,
  quoteTotals,
} from "@/lib/quotations";
import type { QuoteLine, QuotePriceItem, QuoteSection } from "@/types";

// ---- Part one: arithmetic -----------------------------------------------------

function line(section: QuoteSection, description: string, qty: number, pesos: number | null, cost: number | null = null): QuoteLine {
  return {
    ...emptyLine(section),
    description,
    qty,
    unitPriceCents: pesos === null ? null : Math.round(pesos * 100),
    costCents: cost === null ? null : Math.round(cost * 100),
  };
}

const sample = [
  line("parts", "Engine support aftermarket", 2, 2250, 1500),
  line("parts", "Parts cleaner", 2, 400),
  line("parts", "Injector washers", 4, 750, 500),
  line("labor", "Replace engine support", 2, 1200),
  line("labor", "EGR cleaning", 1, 4500),
  line("labor", "Turbo cleaning", 1, 3500),
  line("labor", "Turbo intercooler cleaning", 1, 2500),
  line("labor", "Injector calibration", 4, 12750, 8500),
  line("labor", "Remove/install injectors", 4, 850),
];

const totals = quoteTotals(sample, 0);
assert.equal(totals.partsCents, 830_000, "total parts 8,300.00, as on the sample");
assert.equal(totals.laborCents, 6_730_000, "total labor 67,300.00");
assert.equal(totals.subtotalCents, 7_560_000);
assert.equal(totals.totalCents, 7_560_000, "total 75,600.00");
assert.equal(formatAmount(totals.totalCents), "75,600.00");
assert.equal(totals.costedLines, 3, "the margin covers only lines with a cost");
assert.equal(totals.marginCents, 1500_00 + 1000_00 + 17000_00, "selling minus cost on those three lines: 2×750, 4×250, 4×4,250");

const discounted = quoteTotals(sample, 600_000);
assert.equal(discounted.totalCents, 6_960_000, "a discount comes off the subtotal");
assert.equal(quoteTotals(sample, 99_999_999).totalCents, 0, "a discount never takes the total below zero");

const withGap = quoteTotals([...sample, line("parts", "Gasket", 1, null), emptyLine("labor")], 0);
assert.equal(withGap.unpricedCount, 1, "an unpriced line is counted; a blank row is not");
assert.equal(withGap.totalCents, 7_560_000, "and neither changes the total");

assert.equal(lineAmountCents({ qty: 1.5, unitPriceCents: 333 }), 500, "amounts round to the centavo");
assert.equal(priceFromCost(150_000, 50), 225_000, "1,500.00 at 50% is 2,250.00, the sample's own markup");
assert.equal(priceFromCost(850_000, 50), 1_275_000, "8,500.00 at 50% is 12,750.00");
assert.equal(priceFromCost(123_456, 50), 185_200, "a marked-up price rounds to the whole peso");
assert.equal(priceFromCost(100_000, 0), 100_000);

assert.equal(parseAmount("2,250.00"), 225_000);
assert.equal(parseAmount("₱ 2250"), 225_000);
assert.equal(parseAmount("PHP 2,250.5"), 225_050);
assert.equal(parseAmount(""), null, "empty is unpriced");
assert.equal(parseAmount("12.345"), undefined, "three decimals is a typo, not an amount");
assert.equal(parseAmount("abc"), undefined);
assert.equal(parseQty("4"), 4);
assert.equal(parseQty("1.5"), 1.5);
assert.equal(parseQty("0"), undefined, "a line needs a quantity above zero");

assert.ok(isDateKey("2026-09-14"));
assert.ok(!isDateKey("2026-02-30"), "no such day");
assert.equal(formatQuoteDay("2026-09-14"), "Sep 14, 2026");

console.log("✓ the sample totals 8,300 / 67,300 / 75,600; discount, markup, rounding, typed amounts");

const priceList: QuotePriceItem[] = [
  { section: "labor", description: "Turbo cleaning", unit: "", unitPriceCents: 350_000, costCents: null, useCount: 3, lastUsedDay: "" },
  { section: "labor", description: "Remove/Install Injectors", unit: "", unitPriceCents: 85_000, costCents: null, useCount: 1, lastUsedDay: "" },
  { section: "parts", description: "Injector washers", unit: "pc", unitPriceCents: 75_000, costCents: 50_000, useCount: 2, lastUsedDay: "" },
  { section: "labor", description: "Turbo replacement", unit: "", unitPriceCents: 900_000, costCents: null, useCount: 1, lastUsedDay: "" },
];

assert.equal(descriptionKey("Remove/Install  Injectors!"), "remove install injectors");
assert.equal(matchPriceItem("remove - install injectors", "labor", priceList)?.unitPriceCents, 85_000, "punctuation does not matter");
assert.equal(matchPriceItem("Turbo clean", "labor", priceList)?.description, "Turbo cleaning", "a shared stem matches");
assert.equal(matchPriceItem("Turbo", "labor", priceList), null, "one shared word of two is not enough");
assert.equal(matchPriceItem("Injector washers", "labor", priceList), null, "parts never price labor");
assert.equal(matchPriceItem("Oil change", "labor", priceList), null);

console.log("✓ price list matching errs towards no match");

const email = defaultQuoteEmail(
  { ref: "QT-1001", billTo: { name: "Sumifru", company: "" }, vehicle: { plate: "WQN 733", makeModel: "Fortuner 2015" }, totals },
  "AUTOBLITZ",
  "0915-5146520",
);
assert.equal(email.subject, "Quotation QT-1001 from AUTOBLITZ");
assert.ok(email.body.includes("Fortuner 2015 (WQN 733)") && email.body.includes("PHP 75,600.00"));
assert.ok(!/cost|margin/i.test(email.body), "the email never mentions cost or margin");

console.log("✓ email wording");

// ---- Part two: the photo path -------------------------------------------------

assert.equal(parseQuotePhotoRead(null), null);
assert.equal(parseQuotePhotoRead({ kind: "receipt", lines: [], warnings: [] }), null, "an unknown kind is refused");

const written = parseQuotePhotoRead({
  kind: "written_estimate",
  summary: "Handwritten estimate.",
  customerName: "Sumifru",
  customerPhone: "",
  plate: "wqn 733",
  makeModel: "Fortuner 2015",
  odometerKm: null,
  lines: [
    { section: "labor", description: "Turbo cleaning", qty: 1, unit: "", unitPrice: null, cost: null },
    { section: "labor", description: "EGR cleaning", qty: 1, unit: "", unitPrice: 4500, cost: null },
    { section: "parts", description: "Engine support", qty: 2, unit: "pc", unitPrice: null, cost: 1500 },
    { section: "parts", description: "Mystery part", qty: 0, unit: "", unitPrice: -5, cost: null },
    { section: "fees", description: "Not a section", qty: 1, unit: "", unitPrice: 1, cost: null },
  ],
  warnings: ["Line 4 is smudged."],
});
assert.ok(written);
assert.equal(written.plate, "WQN 733");
assert.equal(written.lines.length, 4, "a line in no known section is dropped");
assert.equal(written.lines[3].qty, 1, "an impossible quantity becomes 1");
assert.equal(written.lines[3].unitPrice, null, "a negative price is no price");

const drafted = draftLinesFromRead(written, priceList, 50);
assert.equal(drafted[0].unitPriceCents, 350_000, "no price in the photo: the price list fills it");
assert.equal(drafted[0].origin, "price-list");
assert.equal(drafted[1].unitPriceCents, 450_000, "a price in the photo is used as written");
assert.equal(drafted[1].origin, "photo");
assert.equal(drafted[2].unitPriceCents, 225_000, "a cost in the photo is offered at the markup");
assert.equal(drafted[2].costCents, 150_000, "and kept as the internal cost");
assert.equal(drafted[3].unitPriceCents, null, "nothing to go on: left for a person to price");

const vehicle = parseQuotePhotoRead({
  kind: "vehicle_photo",
  summary: "Engine bay with an oil leak.",
  customerName: "",
  customerPhone: "",
  plate: "",
  makeModel: "",
  odometerKm: null,
  lines: [
    ...Array.from({ length: 12 }, (_, index) => ({
      section: "labor",
      description: index === 1 ? "turbo cleaning" : index === 0 ? "Turbo cleaning" : `Check ${index}`,
      qty: 1,
      unit: "",
      unitPrice: 9999,
      cost: 5000,
    })),
  ],
  warnings: [],
});
assert.ok(vehicle);
assert.equal(vehicle.lines.length, 8, "a vehicle photo proposes eight lines at most");
assert.ok(vehicle.lines.every((entry) => entry.unitPrice === null && entry.cost === null), "and never carries a price the model made up");
const suggested = draftLinesFromRead(vehicle, priceList, 50);
assert.equal(suggested.length, 7, "the same suggestion twice is folded");
assert.ok(suggested.every((entry) => entry.origin === "suggested"), "every suggestion stays marked as one");
assert.equal(suggested[0].unitPriceCents, 350_000, "a suggestion on the price list gets the shop's own price");

console.log("✓ photo replies validated; prices from photo, then cost at markup, then price list; suggestions never priced by the model");

// ---- Part three: the database -------------------------------------------------

const mongo = await new MongoClient(process.env.MONGODB_URI!).connect();
const db = mongo.db(process.env.MONGODB_DB_NAME!);
const businessId = `QUOTE-CHECK-${randomUUID().slice(0, 8)}`;

try {
  for (const index of QUOTATION_INDEXES) {
    await db.collection(index.collection).createIndex(index.keys, index.options ?? {});
  }
  console.log(`✓ ${QUOTATION_INDEXES.length} quotation indexes present on ${process.env.MONGODB_DB_NAME}`);

  const items = db.collection("quotePriceItems");
  // The same upsert `rememberLines` runs, scoped the way `tenantScope` scopes it.
  const remember = (description: string, pesos: number) =>
    items.updateOne(
      { businessId, section: "labor", key: descriptionKey(description) },
      {
        $set: { description, unit: "", unitPriceCents: pesos * 100, lastUsedAt: new Date() },
        $inc: { useCount: 1 },
        $setOnInsert: { createdAt: new Date(), costCents: null },
      },
      { upsert: true },
    );
  await remember("Turbo cleaning", 3500);
  await remember("TURBO CLEANING", 3800);
  const stored = await items.find({ businessId }).toArray();
  assert.equal(stored.length, 1, "one entry per wording");
  assert.equal(stored[0].unitPriceCents, 380_000, "the latest price wins");
  assert.equal(stored[0].useCount, 2, "and the count says how often it was quoted");

  await assert.rejects(
    items.insertOne({ businessId, section: "labor", key: "turbo cleaning", description: "x" }),
    (error: { code?: number }) => error.code === 11000,
    "the unique index refuses a second entry for the same wording",
  );

  const quotes = db.collection("quotations");
  await quotes.insertOne({ businessId, ref: "QT-1001" });
  await assert.rejects(
    quotes.insertOne({ businessId, ref: "QT-1001" }),
    (error: { code?: number }) => error.code === 11000,
    "two quotations cannot share a quote number",
  );
  console.log("✓ price list keeps one entry per wording; quote numbers are unique");
} finally {
  for (const name of ["quotePriceItems", "quotations", "quotePhotos"]) {
    await db.collection(name).deleteMany({ businessId });
  }
  await mongo.close();
}

console.log("✓ test records removed");
