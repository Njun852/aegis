import type { BookingStatus } from "./bookings";
import type { DateRange, Kpi } from "./dashboard";
import type { MailCategory, MailPriority } from "./mail";

/** The calendar period a report covers, and the one before it for comparison. */
export interface ReportPeriod {
  range: DateRange;
  /** ISO 8601, inclusive. */
  from: string;
  /** ISO 8601, exclusive. */
  to: string;
  /** "Oct 1 – Oct 31, 2026" */
  label: string;
  /** "Sep 1 – Sep 30, 2026", the period the change is measured against. */
  previousLabel: string;
}

export interface ReportRevenue {
  totalCents: number;
  previousCents: number;
  /** "12.5%", "-4.1%"; null when there is no earlier figure to compare with. */
  change: string | null;
  /** The trailing months, oldest first, with the period's own months flagged. */
  months: { label: string; totalCents: number; inPeriod: boolean }[];
}

export interface ReportBookings {
  total: number;
  /** Everything but Cancelled. */
  bookedValueCents: number;
  byStatus: { status: BookingStatus; count: number }[];
  byChannel: { channel: string; count: number }[];
  topServices: { service: string; count: number; valueCents: number }[];
  /** Requests that came through the public booking page. */
  online: number;
}

/**
 * Meta reports rolling windows, not calendar months, so this section covers
 * the last 30 days whatever period the report is for, and says so.
 */
export interface ReportAds {
  currency: string;
  /** ISO 8601 of the last successful sync, or null. */
  lastSyncAt: string | null;
  spendCents: number;
  results: number;
  /** Null when campaigns count different things; the total is then withheld. */
  resultLabel: string | null;
  costPerResultCents: number;
  campaigns: { name: string; spendCents: number; results: number; resultLabel: string }[];
}

export interface ReportMail {
  received: number;
  unread: number;
  needsApproval: number;
  byPriority: { priority: MailPriority; count: number }[];
  byCategory: { category: MailCategory; count: number }[];
  /** "2 hours ago", when mail was last retrieved. */
  lastSyncLabel: string;
}

export interface ReportInventory {
  skus: number;
  stockValueCents: number;
  belowReorder: { name: string; sku: string; onHand: number; reorder: number; unit: string }[];
  /** How many are below reorder in total, when the list above is cut short. */
  belowReorderCount: number;
}

export interface ReportFleet {
  vehicles: number;
  overdue: number;
  dueSoon: number;
  noHistory: number;
  /** Service records dated within the period. */
  servicesInPeriod: number;
}

export interface ReportCustomers {
  total: number;
  newInPeriod: number;
}

/**
 * Everything the report page shows. A section is null when the business does
 * not have that module or nothing is connected to feed it; the page then says
 * so rather than showing sample figures in its place.
 */
export interface Report {
  businessName: string;
  period: ReportPeriod;
  /** ISO 8601. */
  generatedAt: string;
  /**
   * The dashboard's KPI tiles for the range. Revenue is real; the others carry
   * `demo: true` until they have a data source, and are shown with the badge.
   */
  kpis: Kpi[];
  revenue: ReportRevenue;
  bookings: ReportBookings | null;
  ads: ReportAds | null;
  mail: ReportMail | null;
  inventory: ReportInventory | null;
  fleet: ReportFleet | null;
  customers: ReportCustomers | null;
}

/** The longer AI commentary, written only when someone asks for it. */
export interface ReportSummary {
  headline: string;
  highlights: string[];
  risks: string[];
  actions: string[];
}
