import "server-only";

import { periodRange, type AskCall, type AskPeriod, type AskTool } from "@/lib/ask";
import { phoneKey } from "@/lib/crm";
import { plateKey } from "@/lib/fleet";
import { formatPeso } from "@/lib/quotations";
import { loadCampaignFunnel } from "./ad-funnel";
import { listBookings } from "./bookings";
import { listCustomerSummaries } from "./crm";
import { loadDashboardRanges } from "./dashboard";
import { listServiceRecords, listVehicles } from "./fleet";
import { listInventory } from "./inventory";
import { listJobOrderSummaries } from "./job-orders";
import { listMessages } from "./mail";
import { listQuotationSummaries } from "./quotations";
import type { AdRange, Business, OptionalModuleKey } from "@/types";

/**
 * What Ask AEGIS may read. Each tool is a read through the same tenant-scoped
 * DAL functions the screens use, so it sees exactly this business and nothing
 * else, and none of them can write. Results are cut to a few dozen rows and
 * short fields: they go to the model as input, and input is what is billed.
 *
 * Customer phone numbers and email addresses are never included; names,
 * plates and amounts are, because the questions are about them.
 */

const LIST_LIMIT = 20;

/** Which module each tool reads. `null` is available to every business. */
const TOOL_MODULE: Record<AskTool, OptionalModuleKey | null> = {
  bookings: "bookings",
  quotations: "quotes",
  job_orders: "quotes",
  ads: null,
  money: null,
  inventory: "inventory",
  customers: null,
  service_due: "fleet",
  mail: null,
  app_help: null,
};

export function toolsFor(business: Business): AskTool[] {
  return (Object.keys(TOOL_MODULE) as AskTool[]).filter((tool) => {
    const needed = TOOL_MODULE[tool];
    if (tool === "customers") return business.modules.includes("crm") || business.modules.includes("fleet");
    return needed === null || business.modules.includes(needed);
  });
}

function within(date: Date, range: { from: Date | null; to: Date | null }): boolean {
  return (!range.from || date >= range.from) && (!range.to || date < range.to);
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1;
  return counts;
}

const statusMatches = (status: string, wanted: string) =>
  !wanted || wanted === "any" || status.toLowerCase() === wanted.toLowerCase();

async function bookings(call: AskCall, now: Date) {
  const range = periodRange(call.period, now);
  const inPeriod = (await listBookings()).filter((booking) => within(new Date(booking.startsAt), range));
  const matching = inPeriod.filter((booking) => statusMatches(booking.status, call.status));
  return {
    period: range.label,
    note: "Counted by appointment date. Confirmed bookings are Confirmed, In progress and Completed; Pending is a request.",
    countsByStatus: countBy(inPeriod, (booking) => booking.status),
    bookedValueExcludingCancelled: formatPeso(
      inPeriod.filter((booking) => booking.status !== "Cancelled").reduce((sum, booking) => sum + booking.valueCents, 0),
    ),
    shown: Math.min(matching.length, LIST_LIMIT),
    of: matching.length,
    bookings: matching.slice(0, LIST_LIMIT).map((booking) => ({
      ref: booking.ref,
      when: `${booking.day} ${booking.time}`,
      customer: booking.customer,
      service: booking.service,
      status: booking.status,
      channel: booking.channel,
      value: formatPeso(booking.valueCents),
      campaign: booking.source?.campaignName ?? null,
    })),
  };
}

async function quotations(call: AskCall, now: Date) {
  const range = periodRange(call.period, now);
  const all = (await listQuotationSummaries()).filter((quote) =>
    within(new Date(`${quote.quoteDate}T00:00:00+08:00`), range),
  );
  const matching = all.filter((quote) => statusMatches(quote.status, call.status));
  return {
    period: range.label,
    note: "Quoted amounts are offers, not revenue. Expired means sent and past its valid-until date with no answer.",
    countsByStatus: countBy(all, (quote) => quote.status),
    shown: Math.min(matching.length, LIST_LIMIT),
    of: matching.length,
    quotations: matching.slice(0, LIST_LIMIT).map((quote) => ({
      ref: quote.ref,
      revision: quote.revision,
      date: quote.quoteDay,
      customer: quote.customer || quote.company,
      vehicle: [quote.plate, quote.makeModel].filter(Boolean).join(" "),
      status: quote.status,
      total: formatPeso(quote.totalCents),
      unpricedLines: quote.unpricedCount,
      booking: quote.bookingRef,
      jobOrder: quote.jobOrderRef,
    })),
  };
}

async function jobOrders(call: AskCall) {
  const all = await listJobOrderSummaries();
  const matching = all.filter((job) => statusMatches(job.status, call.status));
  return {
    countsByStatus: countBy(all, (job) => job.status),
    shown: Math.min(matching.length, LIST_LIMIT),
    of: matching.length,
    jobOrders: matching.slice(0, LIST_LIMIT).map((job) => ({
      ref: job.ref,
      customer: job.customer,
      vehicle: [job.plate, job.makeModel].filter(Boolean).join(" "),
      status: job.status,
      approvedTotal: formatPeso(job.approvedTotalCents),
      quotation: `${job.quotationRef} rev ${job.quotationRevision}`,
      booking: job.bookingRef,
      made: job.created,
    })),
  };
}

function adRangeFor(period: AskPeriod): AdRange {
  if (period === "last_7_days" || period === "this_week" || period === "today") return "last_7d";
  if (period === "all") return "maximum";
  return "last_30d";
}

async function ads(business: Business, call: AskCall) {
  const funnel = await loadCampaignFunnel(business, adRangeFor(call.period));
  if (!funnel) {
    return {
      unavailable: business.modules.includes("bookings")
        ? "No Meta ad account is connected, so there are no real ad figures."
        : "This business does not keep its bookings in AEGIS, so ads cannot be set against bookings.",
    };
  }
  return {
    period: funnel.periodLabel,
    note: "Meta's own window. Confirmed bookings exclude Pending and Cancelled. Cost per booking = spend / confirmed bookings.",
    totals: {
      spend: formatPeso(funnel.totals.spendCents),
      conversations: funnel.totals.conversations,
      confirmedBookings: funnel.totals.confirmedBookings,
      costPerBooking: funnel.totals.costPerBookingCents === null ? null : formatPeso(funnel.totals.costPerBookingCents),
      conversationToBookingPercent: funnel.totals.conversionPercent,
    },
    confirmedBookingsFromNoAd: funnel.uncreditedConfirmed,
    campaigns: funnel.rows.slice(0, LIST_LIMIT).map((row) => ({
      campaign: row.name,
      running: row.enabled,
      spend: formatPeso(row.spendCents),
      conversations: row.conversations,
      confirmedBookings: row.confirmedBookings,
      costPerBooking: row.costPerBookingCents === null ? null : formatPeso(row.costPerBookingCents),
      conversionPercent: row.conversionPercent,
      flag: row.flag?.text ?? null,
    })),
  };
}

async function money(business: Business, now: Date) {
  const ranges = await loadDashboardRanges(business, now);
  return {
    note: "From the dashboard. Revenue is the bookings ledger. Expenses are purchases of stock only; wages and rent are not in AEGIS.",
    ranges: Object.fromEntries(
      Object.entries(ranges).map(([range, data]) => [
        range,
        {
          revenue: data.revenueTotal,
          change: data.revenueDelta,
          figures: data.kpis.filter((kpi) => !kpi.demo).map((kpi) => ({ label: kpi.label, value: kpi.value, change: kpi.delta })),
          bookings: data.bookingsTotal,
        },
      ]),
    ),
  };
}

async function inventory(call: AskCall) {
  const term = call.search.trim().toLowerCase();
  const items = (await listInventory()).filter(
    (item) =>
      (!call.lowStockOnly || item.onHand <= item.reorder) &&
      (!term || [item.name, item.sku, item.category, item.supplier].some((value) => value.toLowerCase().includes(term))),
  );
  return {
    note: "Low stock means on hand at or below the reorder point.",
    shown: Math.min(items.length, 25),
    of: items.length,
    items: items.slice(0, 25).map((item) => ({
      sku: item.sku,
      name: item.name,
      onHand: `${item.onHand} ${item.unit}`,
      reorderAt: item.reorder,
      low: item.onHand <= item.reorder,
      averageCost: formatPeso(item.unitCostCents),
      supplier: item.supplier || null,
    })),
  };
}

async function customers(business: Business, call: AskCall, now: Date) {
  const term = call.search.trim().toLowerCase();
  if (!term) return { unavailable: "Name a customer, company, phone number or plate to look up." };
  const digits = phoneKey(term);
  const plate = plateKey(term);
  const crm = business.modules.includes("crm");
  const fleet = business.modules.includes("fleet");

  const [summaries, vehicles, records] = await Promise.all([
    crm ? listCustomerSummaries() : Promise.resolve([]),
    fleet ? listVehicles(now) : Promise.resolve([]),
    fleet ? listServiceRecords() : Promise.resolve([]),
  ]);

  const byPlate = plate.length >= 3 ? vehicles.filter((vehicle) => plateKey(vehicle.plate).includes(plate)) : [];
  const matched = summaries
    .filter(
      (customer) =>
        customer.name.toLowerCase().includes(term) ||
        customer.company.toLowerCase().includes(term) ||
        (digits.length >= 4 && phoneKey(customer.phone).includes(digits)) ||
        byPlate.some((vehicle) => vehicle.customerRef === customer.ref),
    )
    .slice(0, 5);
  const carsFor = (ref: string) => vehicles.filter((vehicle) => vehicle.customerRef === ref);
  const history = (vehicleRef: string) =>
    records
      .filter((record) => record.vehicleRef === vehicleRef)
      .sort((a, b) => b.performedAt.localeCompare(a.performedAt))
      .slice(0, 5)
      .map((record) => `${record.day}: ${record.work}${record.odometerKm ? ` at ${record.odometerKm} km` : ""}`);
  const car = (vehicle: (typeof vehicles)[number]) => ({
    plate: vehicle.plate,
    vehicle: [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" "),
    owner: vehicle.owner?.name ?? null,
    nextService: vehicle.due.dueDay ? `${vehicle.due.status}, due ${vehicle.due.dueDay}` : vehicle.due.status,
    recentService: history(vehicle.ref),
  });

  return {
    customers: matched.map((customer) => ({
      ref: customer.ref,
      name: customer.name,
      company: customer.company || null,
      bookings: customer.bookingCount,
      bookedValueExcludingCancelled: formatPeso(customer.bookedValueCents),
      lastVisit: customer.lastVisitDay,
      cars: carsFor(customer.ref).slice(0, 5).map(car),
    })),
    carsMatchingPlate: matched.length === 0 ? byPlate.slice(0, 5).map(car) : [],
  };
}

async function serviceDue(now: Date) {
  const due = (await listVehicles(now)).filter(
    (vehicle) => vehicle.due.status === "Overdue" || vehicle.due.status === "Due soon",
  );
  return {
    note: "Due soon is within 30 days or the km left. Nothing is sent to customers from here.",
    countsByStatus: countBy(due, (vehicle) => vehicle.due.status),
    cars: due.slice(0, LIST_LIMIT).map((vehicle) => ({
      plate: vehicle.plate,
      vehicle: [vehicle.make, vehicle.model].filter(Boolean).join(" "),
      owner: vehicle.owner?.name ?? null,
      status: vehicle.due.status,
      due: vehicle.due.dueDay,
    })),
  };
}

async function mail() {
  const messages = await listMessages();
  const unread = messages.filter((message) => message.unread);
  const pressing = unread.filter((message) => message.priority === "Urgent" || message.priority === "High");
  return {
    unread: unread.length,
    needingAction: messages.filter((message) => message.actionItems.length > 0).length,
    pressingUnread: pressing.slice(0, 8).map((message) => ({
      from: message.from,
      subject: message.subject,
      priority: message.priority,
      received: message.date,
    })),
  };
}

const APP_HELP = {
  where: {
    bookings: "Bookings: list or calendar, Messenger inbox button, New booking. A booking drawer confirms, reschedules, links customer and car.",
    quotations: "Quotations: list, Job orders tab, Price list tab, Settings. Open a quotation for the progress strip: send, record answer, make job order.",
    jobOrders: "Quotations, Job orders tab. Made only from an approved quotation.",
    ads: "Ads: campaigns, ad sets, ads; the Ads to bookings panel shows cost per booking.",
    customers: "CRM for customer profiles; Fleet for cars and service due dates.",
    stock: "Inventory for items and stock moves; Suppliers for prices, purchase orders and receipts.",
    settings: "Business Management (administrators) for modules, mailbox, Meta, the online booking page and owner text alerts.",
    status: "System Status for Meta, Mail, Database and OpenAI health.",
  },
  rules: [
    "Ask AEGIS only reads; it cannot send, confirm, approve or change anything.",
    "Discounts and below-cost prices need an administrator's approval before a quotation is sent.",
    "Once a booking has a job order, its work is moved on the job order and the booking follows.",
  ],
};

/** Runs one tool for the signed-in business. A tool the business lacks says so instead of reading. */
export async function runAskTool(business: Business, call: AskCall, now = new Date()): Promise<unknown> {
  if (!toolsFor(business).includes(call.tool)) {
    return { unavailable: `${business.name} does not have the module this needs.` };
  }
  switch (call.tool) {
    case "bookings":
      return bookings(call, now);
    case "quotations":
      return quotations(call, now);
    case "job_orders":
      return jobOrders(call);
    case "ads":
      return ads(business, call);
    case "money":
      return money(business, now);
    case "inventory":
      return inventory(call);
    case "customers":
      return customers(business, call, now);
    case "service_due":
      return serviceDue(now);
    case "mail":
      return mail();
    case "app_help":
      return APP_HELP;
  }
}
