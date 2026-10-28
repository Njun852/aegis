/**
 * The owner's board: every business on one screen, each as a tile of what
 * needs attention. Built only for administrators, who already reach every
 * business; each item carries the business it belongs to, so a click switches
 * to that business before opening the page.
 */

export type BoardTone = "negative" | "warning" | "accent" | "neutral";

export type BoardSectionKey = "messages" | "bookings" | "jobs" | "finance" | "stock" | "ads" | "fleet";

/** A figure at the top of a section. */
export interface BoardStat {
  label: string;
  value: string;
  /** In-app path it opens, within its business. */
  href: string;
  tone: BoardTone;
}

/** One thing to look at: a chat, a booking, a bill, an item. */
export interface BoardItem {
  /** "Messenger customer · 4821" */
  label: string;
  /** "Waiting 3 h · 'Magkano po ang change oil?'" */
  detail: string;
  href: string;
  tone: BoardTone;
  /** A figure to chart the item by, when it has one: a campaign's spend in centavos. */
  value?: number;
}

export interface BoardSection {
  key: BoardSectionKey;
  title: string;
  icon: string;
  /** Where the section's title opens. */
  href: string;
  stats: BoardStat[];
  /** The most pressing few; the section's page has the rest. */
  items: BoardItem[];
  /** Shown when the section has nothing to report. */
  empty: string;
}

/** One business's headline figures, for the board's charts. Zero for a module it does not have. */
export interface BusinessFigures {
  chatsWaiting: number;
  unreadMail: number;
  bookingsToday: number;
  pendingBookings: number;
  openJobs: number;
  positionCents: number;
  receivableCents: number;
  payableCents: number;
  lowStock: number;
  vehiclesDue: number;
  adSpend30dCents: number;
  adResults30d: number;
}

export interface BusinessBoard {
  businessId: string;
  name: string;
  /** How many things need someone today; the tiles are ordered by it. */
  attention: number;
  /** Which modules it has, so a chart leaves out a business without one. */
  modules: string[];
  figures: BusinessFigures;
  /** Bookings on each of the board's `days`, cancelled ones left out. */
  bookingsByDay: number[];
  sections: BoardSection[];
}

/** The strip across the top: the same few figures added up over every business. */
export interface BoardTotals {
  chatsWaiting: number;
  unreadMail: number;
  bookingsToday: number;
  pendingBookings: number;
  openJobs: number;
  positionCents: number;
  receivableCents: number;
  payableCents: number;
  overduePayables: number;
  lowStock: number;
  vehiclesDue: number;
  adSpend30dCents: number;
}

export interface OwnerBoard {
  /** ISO time the board was read. */
  readAt: string;
  /** The fourteen Manila days the bookings chart covers, oldest first: "2026-10-13". */
  days: string[];
  totals: BoardTotals;
  businesses: BusinessBoard[];
}
