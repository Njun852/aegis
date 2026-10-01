import "server-only";

import { accountTotals, rowsAtLevel } from "@/lib/ads";
import { buildLedgerRevenue, revenueWindow } from "@/lib/dashboard";
import { DASHBOARD_RANGES } from "@/lib/data/dashboard";
import { belowReorder, totalValueCents } from "@/lib/inventory";
import { changeBetween, periodBounds, periodFor, summariseBookings } from "@/lib/report";
import { readActiveMetaAdsStatus } from "./ad-account";
import { listAdRows } from "./ads";
import { listBookingDocuments } from "./bookings";
import { getActiveBusiness } from "./businesses";
import { listCustomerDocuments } from "./customers";
import { listServiceRecords, listVehicles } from "./fleet";
import { listInventory } from "./inventory";
import { revenueBetween, revenueByMonth } from "./ledger";
import { mailStatsBetween, readMailFreshnessState } from "./mail";
import type {
  DateRange,
  MailCategory,
  MailPriority,
  Report,
  ReportAds,
  ReportBookings,
  ReportCustomers,
  ReportFleet,
  ReportInventory,
  ReportMail,
  ReportRevenue,
} from "@/types";

/**
 * The dashboard's full report, assembled from the modules that own each
 * figure. Every read goes through those modules' own tenant-scoped functions,
 * so the report can show nothing a screen could not.
 *
 * A section the business has no module or connection for is null. The page
 * says so in words; it never falls back to sample rows.
 */

/** Months in the revenue table: the period's last month and the five before. */
const REVENUE_MONTHS = 6;

const PRIORITIES: MailPriority[] = ["Urgent", "High", "Normal", "Low"];

async function revenueSection(range: DateRange, today: Date): Promise<ReportRevenue> {
  const { from, to, previousFrom, previousTo } = periodBounds(range, today);
  const window = revenueWindow(today);
  const [totalCents, previousCents, buckets] = await Promise.all([
    revenueBetween(from, to),
    revenueBetween(previousFrom, previousTo),
    revenueByMonth(window.from, window.to),
  ]);

  const byMonth = new Map(
    buckets.map((bucket) => {
      const date = new Date(bucket.monthIso);
      return [date.getFullYear() * 12 + date.getMonth(), bucket.totalCents] as const;
    }),
  );
  const lastMonth = new Date(to.getFullYear(), to.getMonth() - 1, 1);
  const months = Array.from({ length: REVENUE_MONTHS }, (_, index) => {
    const month = new Date(lastMonth.getFullYear(), lastMonth.getMonth() - (REVENUE_MONTHS - 1 - index), 1);
    return {
      label: month.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      totalCents: byMonth.get(month.getFullYear() * 12 + month.getMonth()) ?? 0,
      inPeriod: month >= from && month < to,
    };
  });

  return { totalCents, previousCents, change: changeBetween(totalCents, previousCents), months };
}

async function bookingsSection(range: DateRange, today: Date): Promise<ReportBookings> {
  const { from, to } = periodBounds(range, today);
  const docs = await listBookingDocuments();
  return summariseBookings(
    docs.map((doc) => ({
      startsAt: doc.startsAt,
      status: doc.status,
      valueCents: doc.valueCents,
      service: doc.service,
      channel: doc.channel,
      online: Boolean(doc.request),
    })),
    from,
    to,
  );
}

async function adsSection(): Promise<ReportAds | null> {
  const status = await readActiveMetaAdsStatus();
  // Without a connected account the only rows are the labelled samples, which
  // have no place in a report of real figures.
  if (!status.connected) return null;

  const rows = await listAdRows("last_30d");
  const totals = accountTotals(rows, { spentTodayCents: status.spentTodayCents });

  return {
    currency: status.currency ?? "USD",
    lastSyncAt: status.lastSyncAt,
    spendCents: totals.spendCents,
    results: totals.results,
    resultLabel: totals.resultLabel,
    costPerResultCents: totals.costPerResultCents,
    campaigns: rowsAtLevel(rows, "campaigns")
      .filter((row) => row.spendCents > 0)
      .sort((a, b) => b.spendCents - a.spendCents)
      .slice(0, 5)
      .map((row) => ({
        name: row.name,
        spendCents: row.spendCents,
        results: row.results,
        resultLabel: row.resultLabel,
      })),
  };
}

async function mailSection(range: DateRange, today: Date): Promise<ReportMail | null> {
  const freshness = await readMailFreshnessState();
  if (!freshness.connected) return null;

  const { from, to } = periodBounds(range, today);
  const messages = await mailStatsBetween(from, to);

  const categories = new Map<MailCategory, number>();
  for (const message of messages) {
    categories.set(message.category, (categories.get(message.category) ?? 0) + 1);
  }

  return {
    received: messages.length,
    unread: messages.filter((message) => message.unread).length,
    needsApproval: messages.filter((message) => message.needsApproval).length,
    byPriority: PRIORITIES.map((priority) => ({
      priority,
      count: messages.filter((message) => message.priority === priority).length,
    })),
    byCategory: [...categories.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
    lastSyncLabel: freshness.label,
  };
}

async function inventorySection(): Promise<ReportInventory> {
  const items = await listInventory();
  const low = belowReorder(items);
  return {
    skus: items.length,
    stockValueCents: totalValueCents(items),
    belowReorder: low.slice(0, 10).map((item) => ({
      name: item.name,
      sku: item.sku,
      onHand: item.onHand,
      reorder: item.reorder,
      unit: item.unit,
    })),
    belowReorderCount: low.length,
  };
}

async function fleetSection(range: DateRange, today: Date): Promise<ReportFleet> {
  const { from, to } = periodBounds(range, today);
  const [vehicles, records] = await Promise.all([listVehicles(today), listServiceRecords()]);
  const count = (status: string) => vehicles.filter((vehicle) => vehicle.due.status === status).length;
  return {
    vehicles: vehicles.length,
    overdue: count("Overdue"),
    dueSoon: count("Due soon"),
    noHistory: count("No service on record"),
    servicesInPeriod: records.filter((record) => {
      const at = new Date(record.performedAt);
      return at >= from && at < to;
    }).length,
  };
}

async function customersSection(range: DateRange, today: Date): Promise<ReportCustomers> {
  const { from, to } = periodBounds(range, today);
  const docs = await listCustomerDocuments();
  return {
    total: docs.length,
    newInPeriod: docs.filter((doc) => doc.createdAt >= from && doc.createdAt < to).length,
  };
}

export async function buildReport(range: DateRange, today = new Date()): Promise<Report | null> {
  const business = await getActiveBusiness();
  if (!business) return null;
  const has = (key: "bookings" | "inventory" | "fleet" | "crm") => business.modules.includes(key);

  const [revenue, ledger, bookings, ads, mail, inventory, fleet, customers] = await Promise.all([
    revenueSection(range, today),
    revenueByMonth(revenueWindow(today).from, revenueWindow(today).to),
    has("bookings") ? bookingsSection(range, today) : Promise.resolve(null),
    adsSection(),
    mailSection(range, today),
    has("inventory") ? inventorySection() : Promise.resolve(null),
    has("fleet") ? fleetSection(range, today) : Promise.resolve(null),
    has("crm") ? customersSection(range, today) : Promise.resolve(null),
  ]);

  // The dashboard's own tiles for this range: Revenue from the ledger, exactly
  // as `DashboardRangeProvider` overrides it, and the rest still samples with
  // their `demo` flag, which is what puts the badge on them.
  const real = buildLedgerRevenue(ledger, today)[range];
  const kpis = DASHBOARD_RANGES[range].kpis.map((kpi) =>
    kpi.label === "Revenue"
      ? { ...kpi, value: real.total, delta: real.delta, points: real.points, demo: false }
      : kpi,
  );

  return {
    businessName: business.name,
    period: periodFor(range, today),
    generatedAt: today.toISOString(),
    kpis,
    revenue,
    bookings,
    ads,
    mail,
    inventory,
    fleet,
    customers,
  };
}
