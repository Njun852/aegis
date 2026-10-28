import "server-only";

import { manilaDateKey } from "@/lib/booking-slots";
import { addDaysToKey } from "@/lib/finance-periods";
import { apStatusGroup, isOver90 } from "@/lib/finance";
import { computeDue } from "@/lib/fleet";
import { formatMoney, withoutEmoji } from "@/lib/format";
import { getDb } from "./db";
import { readBooksFor, standingOf } from "./finance-books";
import { allowedBusinessIds, requireAdmin } from "./session";
import type {
  AdRowDocument,
  BoardItem,
  BoardSection,
  BoardTotals,
  BookingDocument,
  BusinessBoard,
  BusinessDocument,
  BusinessFigures,
  FinanceIntakeDocument,
  InventoryItemDocument,
  JobOrderDocument,
  MailMessageDocument,
  MessengerConversationDocument,
  OwnerBoard,
  QuotationDocument,
  ServiceRecordDocument,
  VehicleDocument,
} from "@/types";

/**
 * The owner's board: what needs attention in every business, on one screen.
 *
 * Every other screen reads through `tenantScope`, which follows the one active
 * business. This board is the exception by design, so it is fenced instead:
 * administrators only (`requireAdmin`), and only the businesses they may reach
 * (`allowedBusinessIds`), each read by its own explicit id. Nothing here
 * writes. A click on an item switches to that item's business through the
 * usual checked action before the page opens.
 */

/** How many items a section lists; its page has the rest. */
const ITEMS = 5;
/** A chat untouched this long is old news, not a customer waiting. */
const CHAT_WINDOW_DAYS = 14;

const DAY_MS = 24 * 60 * 60_000;
/** How many days the bookings chart covers, ending today. */
const BOOKING_DAYS = 14;

/** The chart's Manila days, oldest first, ending today. */
function boardDays(now: Date): string[] {
  const today = manilaDateKey(now);
  return Array.from({ length: BOOKING_DAYS }, (_, index) => addDaysToKey(today, index - (BOOKING_DAYS - 1)));
}

const NO_FIGURES: BusinessFigures = {
  chatsWaiting: 0,
  unreadMail: 0,
  bookingsToday: 0,
  pendingBookings: 0,
  openJobs: 0,
  positionCents: 0,
  receivableCents: 0,
  payableCents: 0,
  lowStock: 0,
  vehiclesDue: 0,
  adSpend30dCents: 0,
  adResults30d: 0,
};

function ago(date: Date, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

function clip(text: string, max = 60): string {
  const plain = text.replace(/\s+/g, " ").trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
}


function manilaTime(date: Date): string {
  return date.toLocaleString("en-US", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
}

/** Manila midnight starting `dateKey`, as an instant. */
function startOf(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00+08:00`);
}

// ---- Sections ---------------------------------------------------------------------

/**
 * Messenger chats where the customer spoke last and no booking was made from
 * the chat, newest first, and unread email. A chat opens in AEGIS's Messenger
 * inbox, at that conversation.
 */
async function messagesSection(business: BusinessDocument, now: Date) {
  const db = await getDb();
  const since = new Date(now.getTime() - CHAT_WINDOW_DAYS * DAY_MS);
  const hasBookings = business.modules.includes("bookings");
  const [chats, booked, unread, unreadList] = await Promise.all([
    hasBookings
      ? db
          .collection<MessengerConversationDocument>("messengerConversations")
          .find({ businessId: business.businessId, lastMessageAt: { $gte: since } })
          .sort({ lastMessageAt: -1 })
          .limit(200)
          .toArray()
      : Promise.resolve([]),
    hasBookings
      ? db
          .collection<BookingDocument>("bookings")
          .find({ businessId: business.businessId, messengerPsid: { $type: "string" } })
          .project<{ messengerPsid: string }>({ messengerPsid: 1, _id: 0 })
          .toArray()
      : Promise.resolve([]),
    db.collection<MailMessageDocument>("messages").countDocuments({ businessId: business.businessId, unread: true }),
    db
      .collection<MailMessageDocument>("messages")
      .find({ businessId: business.businessId, unread: true })
      .sort({ _id: -1 })
      .limit(ITEMS)
      .toArray(),
  ]);
  const bookedPsids = new Set(booked.map((doc) => doc.messengerPsid));
  const waiting = chats.filter((chat) => {
    const last = chat.messages[chat.messages.length - 1];
    return last && !last.fromPage && !bookedPsids.has(chat.psid);
  });

  const items: BoardItem[] = [
    ...waiting.slice(0, ITEMS).map((chat) => {
      const last = chat.messages[chat.messages.length - 1];
      return {
        label: chat.name || `Messenger customer · ${chat.psid.slice(-4)}`,
        detail: `Waiting ${ago(chat.lastMessageAt, now)}${chat.campaignName ? ` · from ${chat.campaignName}` : ""} · “${clip(last?.text ?? "")}”`,
        href: `/bookings/messenger?chat=${encodeURIComponent(chat.psid)}`,
        tone: now.getTime() - chat.lastMessageAt.getTime() > DAY_MS ? ("negative" as const) : ("warning" as const),
      };
    }),
    // Email fills what the chats leave, one line at least, so unread mail is never hidden behind chats.
    ...unreadList.slice(0, ITEMS + 1 - Math.min(waiting.length, ITEMS)).map((mail) => ({
      label: mail.from || mail.email,
      detail: `Unread email · ${clip(mail.subject)}${mail.needsApproval ? " · needs approval" : ""}`,
      href: "/mail",
      tone: mail.priority === "Urgent" || mail.priority === "High" || mail.needsApproval ? ("warning" as const) : ("neutral" as const),
    })),
  ];
  const section: BoardSection = {
    key: "messages",
    title: "Messages",
    icon: "inbox",
    href: hasBookings ? "/bookings/messenger" : "/mail",
    stats: [
      ...(hasBookings
        ? [{ label: "Chats waiting", value: String(waiting.length), href: "/bookings/messenger", tone: waiting.length > 0 ? ("warning" as const) : ("neutral" as const) }]
        : []),
      { label: "Unread email", value: String(unread), href: "/mail", tone: unread > 0 ? "accent" : "neutral" },
    ],
    items: items.filter((item) => item.label),
    empty: "No one is waiting for a reply.",
  };
  return { section, waiting: waiting.length, unread };
}

/** Today's bookings, requests not yet confirmed, and the next few appointments. */
async function bookingsSection(business: BusinessDocument, now: Date, days: string[]) {
  const db = await getDb();
  const today = manilaDateKey(now);
  const from = startOf(today);
  const to = new Date(from.getTime() + DAY_MS);
  const collection = db.collection<BookingDocument>("bookings");
  const [todayCount, pending, upcoming, perDay] = await Promise.all([
    collection.countDocuments({ businessId: business.businessId, startsAt: { $gte: from, $lt: to }, status: { $nin: ["Cancelled"] } }),
    collection
      .find({ businessId: business.businessId, status: "Pending" })
      .sort({ startsAt: 1 })
      .limit(50)
      .toArray(),
    collection
      .find({ businessId: business.businessId, startsAt: { $gte: now }, status: { $in: ["Confirmed", "Pending"] } })
      .sort({ startsAt: 1 })
      .limit(ITEMS)
      .toArray(),
    // Bookings per Manila day over the chart's window, grouped in the database.
    collection
      .aggregate<{ _id: string; count: number }>([
        { $match: { businessId: business.businessId, status: { $ne: "Cancelled" }, startsAt: { $gte: startOf(days[0]), $lt: to } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$startsAt", timezone: "Asia/Manila" } }, count: { $sum: 1 } } },
      ])
      .toArray(),
  ]);
  const counted = new Map(perDay.map((entry) => [entry._id, entry.count]));
  const byDay = days.map((day) => counted.get(day) ?? 0);
  const shown = [...pending.slice(0, ITEMS), ...upcoming.filter((booking) => booking.status !== "Pending")].slice(0, ITEMS);
  const section: BoardSection = {
    key: "bookings",
    title: "Bookings",
    icon: "calendar",
    href: "/bookings",
    stats: [
      { label: "Today", value: String(todayCount), href: "/bookings", tone: "accent" },
      { label: "To confirm", value: String(pending.length), href: "/bookings", tone: pending.length > 0 ? "warning" : "neutral" },
    ],
    items: shown.map((booking) => ({
      label: booking.customer || booking.company || booking.ref,
      detail: `${booking.status === "Pending" ? "To confirm · " : ""}${booking.service} · ${
        manilaDateKey(booking.startsAt) === today ? "today" : booking.startsAt.toLocaleDateString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric" })
      } ${manilaTime(booking.startsAt)}`,
      href: `/bookings?booking=${encodeURIComponent(booking.ref)}`,
      tone: booking.status === "Pending" ? "warning" : "neutral",
    })),
    empty: "No bookings coming up.",
  };
  return { section, today: todayCount, pending: pending.length, byDay };
}

/** Jobs in the shop, quotations waiting on the customer, finished work not invoiced. */
async function jobsSection(business: BusinessDocument) {
  const db = await getDb();
  const [jobs, sent, uninvoiced] = await Promise.all([
    db
      .collection<JobOrderDocument>("jobOrders")
      .find({ businessId: business.businessId, status: { $in: ["Open", "In progress"] } })
      .sort({ updatedAt: -1 })
      .limit(100)
      .toArray(),
    db.collection<QuotationDocument>("quotations").countDocuments({ businessId: business.businessId, status: "Sent" }),
    db.collection<JobOrderDocument>("jobOrders").countDocuments({ businessId: business.businessId, status: "Completed", invoiceRef: null }),
  ]);
  const section: BoardSection = {
    key: "jobs",
    title: "Jobs and quotations",
    icon: "wrench",
    href: "/quotations",
    stats: [
      { label: "Jobs open", value: String(jobs.length), href: "/quotations", tone: "accent" },
      { label: "Quotes awaiting customer", value: String(sent), href: "/quotations", tone: sent > 0 ? "warning" : "neutral" },
      { label: "Done, not invoiced", value: String(uninvoiced), href: "/finance?tab=receivables", tone: uninvoiced > 0 ? "warning" : "neutral" },
    ],
    items: jobs.slice(0, ITEMS).map((job) => ({
      label: `${job.ref} · ${job.billTo.company || job.billTo.name || "Walk-in"}`,
      detail: `${job.status}${job.vehicle.plate ? ` · ${job.vehicle.plate}` : ""} · ${formatMoney(job.approvedTotalCents)}`,
      href: `/quotations/jobs/${encodeURIComponent(job.ref)}`,
      tone: job.status === "In progress" ? "accent" : "neutral",
    })),
    empty: "No jobs in the shop.",
  };
  return { section, open: jobs.length };
}

/**
 * Where the business stands today and what is pressing: the position, what is
 * owed both ways, overdue bills, old receivables and uploads to review. Read
 * by the business's id through the same books the Finance screens use.
 */
async function financeSection(business: BusinessDocument, now: Date) {
  const db = await getDb();
  const today = manilaDateKey(now);
  const [books, intakeWaiting] = await Promise.all([
    readBooksFor(business.businessId),
    db
      .collection<FinanceIntakeDocument>("financeIntake")
      .countDocuments({ businessId: business.businessId, status: { $in: ["unread", "review"] } }),
  ]);
  const { standing, attention } = standingOf(books, today);
  const dueOf = new Map(books.bills.map((bill) => [bill.ref, bill.dueDate]));
  const dateOf = new Map(books.invoices.map((invoice) => [invoice.ref, invoice.invoiceDate]));
  const overdue = standing.payable.rows
    .map((row) => ({ row, group: apStatusGroup(dueOf.get(row.ref) ?? today, today) }))
    .filter((entry) => entry.group === "overdue" || entry.group === "critical-overdue")
    .sort((a, b) => b.row.amountCents - a.row.amountCents);
  const old = standing.receivable.rows.filter((row) => isOver90(dateOf.get(row.ref) ?? row.dateKey, today));

  const items: BoardItem[] = [
    ...overdue.slice(0, ITEMS).map(({ row, group }) => ({
      label: row.label,
      detail: `${group === "critical-overdue" ? "Critically overdue" : "Overdue"} bill · ${formatMoney(row.amountCents)} owed`,
      href: `/finance?tab=payables&bill=${encodeURIComponent(row.ref)}`,
      tone: "negative" as const,
    })),
    ...old.slice(0, Math.max(0, ITEMS - overdue.length)).map((row) => ({
      label: row.label,
      detail: `Receivable over 90 days · ${formatMoney(row.amountCents)}`,
      href: `/finance?tab=receivables&invoice=${encodeURIComponent(row.ref)}`,
      tone: "warning" as const,
    })),
    ...(intakeWaiting > 0
      ? [{ label: `${intakeWaiting} ${intakeWaiting === 1 ? "upload" : "uploads"} in the Review Queue`, detail: "Invoices and receipts read by AI, waiting for a person to post them", href: "/finance?tab=intake", tone: "accent" as const }]
      : []),
  ].slice(0, ITEMS + 1);

  const section: BoardSection = {
    key: "finance",
    title: "Finance",
    icon: "wallet",
    href: "/finance",
    stats: [
      { label: "Position", value: formatMoney(standing.positionCents, false), href: "/finance?tab=standing", tone: standing.positionCents < 0 ? "negative" : "accent" },
      { label: "Receivable", value: formatMoney(standing.receivable.cents, false), href: "/finance?tab=receivables", tone: old.length > 0 ? "warning" : "neutral" },
      { label: "Payable", value: formatMoney(standing.payable.cents, false), href: "/finance?tab=payables", tone: overdue.length > 0 ? "negative" : "neutral" },
    ],
    items,
    empty: books.accounts.length === 0 ? "No accounts set up yet." : "Nothing overdue.",
  };
  return {
    section,
    position: standing.positionCents,
    receivable: standing.receivable.cents,
    payable: standing.payable.cents,
    overdue: overdue.length,
    urgent: overdue.length + old.length + attention.differences.rows.length + intakeWaiting,
  };
}

/** Items at or below their reorder level, lowest first against the level. */
async function stockSection(business: BusinessDocument) {
  const db = await getDb();
  const items = await db
    .collection<InventoryItemDocument>("inventoryItems")
    .find({ businessId: business.businessId, $expr: { $lte: ["$onHand", "$reorder"] } })
    .limit(200)
    .toArray();
  items.sort((a, b) => a.onHand - a.reorder - (b.onHand - b.reorder));
  const section: BoardSection = {
    key: "stock",
    title: "Stock",
    icon: "package",
    href: "/inventory",
    stats: [{ label: "Low or out", value: String(items.length), href: "/inventory", tone: items.length > 0 ? "warning" : "neutral" }],
    items: items.slice(0, ITEMS).map((item) => ({
      label: item.name,
      detail: `${item.onHand <= 0 ? "Out of stock" : `${item.onHand} ${item.unit} left`} · reorder at ${item.reorder}${item.supplier ? ` · ${item.supplier}` : ""}`,
      href: "/inventory",
      tone: item.onHand <= 0 ? "negative" : "warning",
    })),
    empty: "Everything is above its reorder level.",
  };
  return { section, low: items.length };
}

/** The last 30 days of Meta ads, as the last sync stored them, campaign by campaign. */
async function adsSection(business: BusinessDocument) {
  const db = await getDb();
  const campaigns = await db
    .collection<AdRowDocument>("adRows")
    .find({ businessId: business.businessId, level: "campaigns", source: "meta" })
    .toArray();
  if (campaigns.length === 0) return null;
  const spend = campaigns.reduce((sum, row) => sum + (row.metrics?.last_30d?.spendCents ?? 0), 0);
  const results = campaigns.reduce((sum, row) => sum + (row.metrics?.last_30d?.results ?? 0), 0);
  const top = campaigns
    .filter((row) => (row.metrics?.last_30d?.spendCents ?? 0) > 0)
    .sort((a, b) => (b.metrics?.last_30d?.spendCents ?? 0) - (a.metrics?.last_30d?.spendCents ?? 0));
  const section: BoardSection = {
    key: "ads",
    title: "Ads · last 30 days",
    icon: "megaphone",
    href: "/ads?range=last_30d",
    stats: [
      { label: "Spend", value: formatMoney(spend, false), href: "/ads?range=last_30d", tone: "accent" },
      { label: "Results", value: results.toLocaleString("en-US"), href: "/ads?range=last_30d", tone: "neutral" },
    ],
    items: top.slice(0, ITEMS).map((row) => {
      const metrics = row.metrics!.last_30d;
      return {
        label: row.name,
        detail: `${formatMoney(metrics.spendCents, false)} · ${metrics.results.toLocaleString("en-US")} ${metrics.resultLabel}${
          metrics.results > 0 ? ` · ${formatMoney(Math.round(metrics.spendCents / metrics.results))} each` : ""
        }`,
        href: "/ads?range=last_30d",
        tone: metrics.results === 0 ? "warning" : "neutral",
        value: metrics.spendCents,
      };
    }),
    empty: "No ad spend in the last 30 days.",
  };
  return { section, spend, results };
}

/** Customer vehicles overdue or due soon for their next service. */
async function fleetSection(business: BusinessDocument, now: Date) {
  const db = await getDb();
  const [vehicles, latest] = await Promise.all([
    db.collection<VehicleDocument>("vehicles").find({ businessId: business.businessId }).limit(2000).toArray(),
    db
      .collection<ServiceRecordDocument>("serviceRecords")
      .aggregate<{ _id: string; last: ServiceRecordDocument }>([
        { $match: { businessId: business.businessId } },
        { $sort: { performedAt: -1, createdAt: -1 } },
        { $group: { _id: "$vehicleRef", last: { $first: "$$ROOT" } } },
      ])
      .toArray(),
  ]);
  const lastOf = new Map(latest.map((entry) => [entry._id, entry.last]));
  const due = vehicles
    .map((vehicle) => {
      const last = lastOf.get(vehicle.ref) ?? null;
      return {
        vehicle,
        due: computeDue(
          {
            lastServiceAt: last?.performedAt ?? null,
            lastServiceKm: last?.odometerKm ?? null,
            currentKm: vehicle.odometerKm,
            intervalMonths: vehicle.intervalMonths,
            intervalKm: vehicle.intervalKm,
          },
          now,
        ),
      };
    })
    .filter((entry) => entry.due.status === "Overdue" || entry.due.status === "Due soon")
    .sort((a, b) => (a.due.daysLeft ?? 0) - (b.due.daysLeft ?? 0));
  const overdue = due.filter((entry) => entry.due.status === "Overdue").length;
  const section: BoardSection = {
    key: "fleet",
    title: "Fleet service",
    icon: "car",
    href: "/fleet",
    stats: [
      { label: "Overdue", value: String(overdue), href: "/fleet", tone: overdue > 0 ? "negative" : "neutral" },
      { label: "Due soon", value: String(due.length - overdue), href: "/fleet", tone: "neutral" },
    ],
    items: due.slice(0, ITEMS).map(({ vehicle, due: next }) => ({
      label: `${vehicle.plate} · ${[vehicle.make, vehicle.model].filter(Boolean).join(" ")}`,
      detail: `${next.status}${next.dueDay ? ` · ${next.dueDay}` : ""} · a chance to book them in`,
      href: "/fleet",
      tone: next.status === "Overdue" ? "negative" : "warning",
    })),
    empty: "No customer vehicles due for service.",
  };
  return { section, due: due.length, overdue };
}

// ---- The board ----------------------------------------------------------------------

async function boardFor(business: BusinessDocument, now: Date, days: string[]) {
  const has = (key: string) => business.modules.includes(key as BusinessDocument["modules"][number]);
  const [messages, bookings, jobs, finance, stock, ads, fleet] = await Promise.all([
    messagesSection(business, now),
    has("bookings") ? bookingsSection(business, now, days) : Promise.resolve(null),
    has("quotes") ? jobsSection(business) : Promise.resolve(null),
    financeSection(business, now),
    has("inventory") ? stockSection(business) : Promise.resolve(null),
    adsSection(business),
    has("fleet") ? fleetSection(business, now) : Promise.resolve(null),
  ]);
  const board: BusinessBoard = {
    businessId: business.businessId,
    name: business.name,
    attention:
      messages.waiting +
      (bookings?.pending ?? 0) +
      (finance?.urgent ?? 0) +
      (stock?.low ?? 0) +
      (fleet?.overdue ?? 0),
    modules: [...business.modules],
    figures: {
      chatsWaiting: messages.waiting,
      unreadMail: messages.unread,
      bookingsToday: bookings?.today ?? 0,
      pendingBookings: bookings?.pending ?? 0,
      openJobs: jobs?.open ?? 0,
      positionCents: finance?.position ?? 0,
      receivableCents: finance?.receivable ?? 0,
      payableCents: finance?.payable ?? 0,
      lowStock: stock?.low ?? 0,
      vehiclesDue: fleet?.due ?? 0,
      adSpend30dCents: ads?.spend ?? 0,
      adResults30d: ads?.results ?? 0,
    },
    bookingsByDay: bookings?.byDay ?? days.map(() => 0),
    sections: [messages.section, bookings?.section, jobs?.section, finance?.section, stock?.section, ads?.section, fleet?.section]
      .filter((section): section is BoardSection => Boolean(section))
      .map((section) => ({
        ...section,
        items: section.items.map((item) => ({ ...item, label: withoutEmoji(item.label), detail: withoutEmoji(item.detail) })),
      })),
  };
  return { board, messages, bookings, jobs, finance, stock, ads, fleet };
}

/**
 * Every business the administrator may reach, each read on its own; one that
 * fails is shown as unavailable rather than hiding the rest.
 */
export async function loadOwnerBoard(now = new Date()): Promise<OwnerBoard> {
  const { userId, role } = await requireAdmin();
  const allowed = await allowedBusinessIds(userId, role);
  const db = await getDb();
  const businesses = await db
    .collection<BusinessDocument>("businesses")
    .find({ businessId: { $in: allowed } })
    .sort({ businessId: 1 })
    .toArray();

  const days = boardDays(now);
  const results = await Promise.all(
    businesses.map(async (business) => {
      try {
        return await boardFor(business, now, days);
      } catch (error) {
        console.error(`[owner-board] ${business.businessId}:`, error instanceof Error ? error.message : error);
        return {
          board: {
            businessId: business.businessId,
            name: business.name,
            attention: 0,
            modules: [...business.modules],
            figures: NO_FIGURES,
            bookingsByDay: days.map(() => 0),
            sections: [
              {
                key: "messages" as const,
                title: "Unavailable",
                icon: "circle-alert",
                href: "/dashboard",
                stats: [],
                items: [],
                empty: "This business could not be read just now. Open it to check.",
              },
            ],
          },
        };
      }
    }),
  );

  const totals: BoardTotals = {
    chatsWaiting: 0,
    unreadMail: 0,
    bookingsToday: 0,
    pendingBookings: 0,
    openJobs: 0,
    positionCents: 0,
    receivableCents: 0,
    payableCents: 0,
    overduePayables: 0,
    lowStock: 0,
    vehiclesDue: 0,
    adSpend30dCents: 0,
  };
  for (const result of results) {
    if (!("messages" in result)) continue;
    totals.chatsWaiting += result.messages.waiting;
    totals.unreadMail += result.messages.unread;
    totals.bookingsToday += result.bookings?.today ?? 0;
    totals.pendingBookings += result.bookings?.pending ?? 0;
    totals.openJobs += result.jobs?.open ?? 0;
    totals.positionCents += result.finance?.position ?? 0;
    totals.receivableCents += result.finance?.receivable ?? 0;
    totals.payableCents += result.finance?.payable ?? 0;
    totals.overduePayables += result.finance?.overdue ?? 0;
    totals.lowStock += result.stock?.low ?? 0;
    totals.vehiclesDue += result.fleet?.due ?? 0;
    totals.adSpend30dCents += result.ads?.spend ?? 0;
  }

  return {
    readAt: now.toISOString(),
    days,
    totals,
    businesses: results.map((result) => result.board).sort((a, b) => b.attention - a.attention || a.name.localeCompare(b.name)),
  };
}
