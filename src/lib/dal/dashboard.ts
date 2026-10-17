import "server-only";

import { buildFunnel, CONVERSATION_RESULT } from "@/lib/ad-funnel";
import { manilaDateKey } from "@/lib/booking-slots";
import {
  bookingFigures,
  bucketsFromDays,
  buildKpis,
  buildMonthlyFigures,
  revenueWindow,
  subtractBuckets,
} from "@/lib/dashboard";
import { formatMoney, formatMoneyIn, formatSignedMoney } from "@/lib/format";
import { relativeAge } from "@/lib/freshness";
import { belowReorder, totalValueCents } from "@/lib/inventory";
import { countByPriority } from "@/lib/mail";
import { windowForRange } from "@/lib/meta/ranges";
import { readActiveMetaAdsStatus } from "./ad-account";
import { listAdRows } from "./ads";
import { countConfirmedByCampaign, listBookings } from "./bookings";
import { listOpenDiscrepancies } from "./finance-accounts";
import { listBills } from "./finance-bills";
import { listInventory, purchasesByMonth } from "./inventory";
import { revenueByMonth } from "./ledger";
import { listVehicles } from "./fleet";
import { costOnlyReceiptTotals, listOrders } from "./purchasing";
import { listQuotationSummaries } from "./quotations";
import { listCostChanges } from "./suppliers";
import type { AdSummary, AlertRow, Business, DashboardRangeData, DateRange, MailMessage } from "@/types";

/**
 * Everything the dashboard shows, read from the business's own records. No
 * figure here is a sample: a module the business lacks contributes nothing,
 * and an empty one shows as zero rather than as something made up.
 */
export interface DashboardData {
  ranges: Record<DateRange, DashboardRangeData>;
  alerts: AlertRow[];
  /** Null when no Meta ad account is connected. */
  ads: AdSummary | null;
}

export async function loadDashboard(
  business: Business,
  messages: MailMessage[],
  today = new Date(),
): Promise<DashboardData> {
  const [{ ranges, bookings, stock }, ads] = await Promise.all([
    loadRanges(business, today),
    buildAdSummary(business, today),
  ]);
  const alerts = await buildAlerts(business, messages, bookings, stock, today);
  return { ranges, alerts, ads };
}

/** The tiles, revenue chart and bookings card for each range: the part the full report shares. */
export async function loadDashboardRanges(business: Business, today = new Date()) {
  return (await loadRanges(business, today)).ranges;
}

async function loadRanges(business: Business, today: Date) {
  const has = (key: string) => business.modules.includes(key as Business["modules"][number]);
  const { from, to } = revenueWindow(today);

  const [revenueBuckets, purchaseBuckets, costOnly, quotes, bookings, stock] = await Promise.all([
    revenueByMonth(from, to),
    has("inventory") ? purchasesByMonth(from, to) : Promise.resolve([]),
    has("suppliers") ? costOnlyReceiptTotals() : Promise.resolve([]),
    has("quotes") ? listQuotationSummaries() : Promise.resolve(null),
    has("bookings") ? listBookings() : Promise.resolve([]),
    has("inventory") ? listInventory() : Promise.resolve(null),
  ]);

  const expenseBuckets = [...purchaseBuckets, ...bucketsFromDays(costOnly)];
  const revenue = buildMonthlyFigures(revenueBuckets, today);
  const expenses = buildMonthlyFigures(expenseBuckets, today);
  const net = buildMonthlyFigures(subtractBuckets(revenueBuckets, expenseBuckets), today);
  const quoted = quotes
    ? buildMonthlyFigures(
        bucketsFromDays(quotes.map((quote) => ({ dateKey: quote.quoteDate, cents: quote.totalCents }))),
        today,
      )
    : null;
  const bookingRanges = bookingFigures(bookings, today);

  const ranges = {} as Record<DateRange, DashboardRangeData>;
  for (const range of Object.keys(revenue) as DateRange[]) {
    ranges[range] = {
      kpis: buildKpis({
        revenue: revenue[range],
        expenses: expenses[range],
        net: net[range],
        quoted: quoted ? quoted[range] : null,
        stockValueCents: stock ? totalValueCents(stock) : null,
      }),
      revenueTotal: revenue[range].total,
      revenueDelta: revenue[range].delta,
      revenueHighlightMonth: revenue[range].highlightMonth,
      revenueMonths: revenue[range].months,
      ...bookingRanges[range],
    };
  }

  return { ranges, bookings, stock };
}

const ALERT_COLORS = { urgent: "var(--viz-6)", attention: "var(--viz-4)", info: "var(--viz-1)" };

/**
 * What needs someone's attention today, from each module the business has:
 * requests to confirm, stock to reorder, cars overdue, costs that rose,
 * deliveries late, quotations unpriced, urgent mail. Most pressing first.
 */
async function buildAlerts(
  business: Business,
  messages: MailMessage[],
  bookings: Awaited<ReturnType<typeof listBookings>>,
  stock: Awaited<ReturnType<typeof listInventory>> | null,
  today: Date,
): Promise<AlertRow[]> {
  const has = (key: string) => business.modules.includes(key as Business["modules"][number]);
  const alerts: (AlertRow & { weight: number })[] = [];
  const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

  const urgent = countByPriority(messages.filter((message) => message.unread), "Urgent");
  if (urgent > 0) {
    alerts.push({
      weight: 1,
      title: `${plural(urgent, "urgent email", "urgent emails")} unread`,
      meta: "Mail",
      amount: String(urgent),
      amountTone: "negative",
      tag: "Mail",
      icon: "mail",
      iconColor: ALERT_COLORS.urgent,
    });
  }

  const pending = bookings.filter((booking) => booking.status === "Pending");
  if (pending.length > 0) {
    alerts.push({
      weight: 2,
      title: `${plural(pending.length, "booking", "bookings")} awaiting confirmation`,
      meta: pending.some((booking) => booking.request) ? "Includes requests from the booking page" : "Confirm them in Bookings",
      amount: String(pending.length),
      amountTone: "neutral",
      tag: "Bookings",
      icon: "calendar",
      iconColor: ALERT_COLORS.attention,
    });
  }

  if (stock) {
    const low = belowReorder(stock);
    const out = low.filter((item) => item.onHand <= 0).length;
    if (low.length > 0) {
      alerts.push({
        weight: out > 0 ? 1 : 3,
        title: `${plural(low.length, "item", "items")} at or below reorder point`,
        meta: out > 0 ? `${out} out of stock` : low.slice(0, 2).map((item) => item.name).join(", "),
        amount: String(low.length),
        amountTone: out > 0 ? "negative" : "neutral",
        tag: "Inventory",
        icon: "package",
        iconColor: out > 0 ? ALERT_COLORS.urgent : ALERT_COLORS.attention,
      });
    }
  }

  if (has("fleet")) {
    const overdue = (await listVehicles(today)).filter((vehicle) => vehicle.due.status === "Overdue");
    if (overdue.length > 0) {
      alerts.push({
        weight: 4,
        title: `${plural(overdue.length, "car", "cars")} overdue for service`,
        meta: overdue.slice(0, 2).map((vehicle) => vehicle.plate).join(", "),
        amount: String(overdue.length),
        amountTone: "neutral",
        tag: "Fleet",
        icon: "car",
        iconColor: ALERT_COLORS.info,
      });
    }
  }

  if (has("suppliers")) {
    const [changes, orders] = await Promise.all([listCostChanges(30, today), listOrders()]);
    const rises = changes.filter((change) => (change.changePercent ?? 0) > 0);
    if (rises.length > 0) {
      const biggest = [...rises].sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0))[0];
      alerts.push({
        weight: 3,
        title: `${plural(rises.length, "supplier cost", "supplier costs")} went up`,
        meta: `${biggest.description}: ${formatMoney(biggest.previousCents ?? 0)} → ${formatMoney(biggest.costCents)}`,
        amount: `+${biggest.changePercent}%`,
        amountTone: "negative",
        tag: "30 days",
        icon: "trending-up",
        iconColor: ALERT_COLORS.attention,
      });
    }
    const todayKey = today.toISOString().slice(0, 10);
    const late = orders.filter(
      (order) => (order.status === "Ordered" || order.status === "Partly received") && order.expectedDate && order.expectedDate < todayKey,
    );
    if (late.length > 0) {
      alerts.push({
        weight: 2,
        title: `${plural(late.length, "delivery", "deliveries")} past the expected date`,
        meta: late.slice(0, 2).map((order) => `${order.ref} · ${order.supplierName}`).join(", "),
        amount: String(late.length),
        amountTone: "negative",
        tag: "Suppliers",
        icon: "truck",
        iconColor: ALERT_COLORS.urgent,
      });
    }
  }

  if (has("quotes")) {
    const unpriced = (await listQuotationSummaries()).filter((quote) => quote.status === "Draft" && quote.unpricedCount > 0);
    if (unpriced.length > 0) {
      alerts.push({
        weight: 4,
        title: `${plural(unpriced.length, "draft quotation", "draft quotations")} with unpriced lines`,
        meta: unpriced.slice(0, 2).map((quote) => quote.ref).join(", "),
        amount: String(unpriced.length),
        amountTone: "neutral",
        tag: "Quotations",
        icon: "file-text",
        iconColor: ALERT_COLORS.info,
      });
    }
  }

  if (has("finance")) {
    // A cash or bank count that disagrees with the book is one of the owner's
    // critical finance alerts, and stays until an administrator explains it.
    const open = await listOpenDiscrepancies();
    if (open.length > 0) {
      const largest = [...open].sort((a, b) => Math.abs(b.differenceCents) - Math.abs(a.differenceCents))[0];
      alerts.push({
        weight: 1,
        title: open.length === 1 ? "A count differs from the book" : `${open.length} counts differ from the book`,
        meta: open.slice(0, 2).map((count) => count.accountName).join(", "),
        amount: formatSignedMoney(largest.differenceCents),
        amountTone: "negative",
        tag: "Finance",
        icon: "wallet",
        iconColor: ALERT_COLORS.urgent,
      });
    }

    // Overdue bills, and bills falling due in the next seven days: the other
    // two payables alerts on the owner's critical list.
    const owed = (await listBills(manilaDateKey(today))).filter((bill) => bill.outstandingCents > 0);
    const total = (list: typeof owed) => list.reduce((sum, bill) => sum + bill.outstandingCents, 0);
    const late = owed.filter((bill) => bill.group === "overdue" || bill.group === "critical-overdue");
    if (late.length > 0) {
      alerts.push({
        weight: 1,
        title: `${plural(late.length, "bill", "bills")} overdue`,
        meta: late.slice(0, 2).map((bill) => bill.payee).join(", "),
        amount: formatMoney(total(late)),
        amountTone: "negative",
        tag: "Payables",
        icon: "file-text",
        iconColor: ALERT_COLORS.urgent,
      });
    }
    const soon = owed.filter((bill) => bill.group === "due-today" || bill.group === "due-7");
    if (soon.length > 0) {
      alerts.push({
        weight: 2,
        title: `${plural(soon.length, "bill", "bills")} due within 7 days`,
        meta: soon.slice(0, 2).map((bill) => bill.payee).join(", "),
        amount: formatMoney(total(soon)),
        amountTone: "neutral",
        tag: "Payables",
        icon: "file-text",
        iconColor: ALERT_COLORS.attention,
      });
    }
  }

  return alerts
    .sort((a, b) => a.weight - b.weight)
    .slice(0, 5)
    .map(({ weight, ...alert }) => {
      void weight;
      return alert;
    });
}

/**
 * The connected Meta account over its last 30 days, beside the bookings staff
 * confirmed in the same days. Meta reports rolling windows, so these follow
 * the account rather than the dashboard's date picker, and the card says so.
 */
async function buildAdSummary(business: Business, today: Date): Promise<AdSummary | null> {
  const meta = await readActiveMetaAdsStatus();
  if (!meta.connected) return null;
  const currency = meta.currency ?? "PHP";
  const rows = (await listAdRows("last_30d")).filter((row) => row.level === "campaigns");
  const spendCents = rows.reduce((sum, row) => sum + row.spendCents, 0);
  const conversationRows = rows.filter((row) => row.resultLabel === CONVERSATION_RESULT);
  const conversations = conversationRows.reduce((sum, row) => sum + row.results, 0);

  const tiles: AdSummary["tiles"] = [
    { label: "Spend", value: formatMoneyIn(spendCents, currency, false) },
    { label: "Conversations", value: conversationRows.length ? String(conversations) : "—" },
  ];
  if (business.modules.includes("bookings")) {
    const window = windowForRange("last_30d", meta.timezone ?? "Asia/Manila", today);
    const funnel = buildFunnel({
      campaigns: rows,
      confirmedByCampaign: await countConfirmedByCampaign(window.from, window.to),
      chatsByCampaign: {},
      bookings: [],
      uncreditedConfirmed: 0,
      periodLabel: "",
    });
    tiles.push(
      { label: "Confirmed bookings", value: String(funnel.totals.confirmedBookings) },
      {
        label: "Cost / booking",
        value: funnel.totals.costPerBookingCents === null ? "—" : formatMoneyIn(funnel.totals.costPerBookingCents, currency, false),
      },
    );
  } else {
    const reach = rows.reduce((sum, row) => sum + row.reach, 0);
    const results = rows.reduce((sum, row) => sum + row.results, 0);
    tiles.push({ label: "Results", value: String(results) }, { label: "Reach", value: reach.toLocaleString("en-US") });
  }
  return { tiles, note: `Last 30 days · Meta · synced ${relativeAge(meta.lastSyncAt, today.getTime())}` };
}
