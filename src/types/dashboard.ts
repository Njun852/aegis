import type { AmountTone, StatTone } from "@/components/ui";

export interface Kpi {
  label: string;
  value: string;
  icon: string;
  tone: StatTone;
  delta: string;
  points: number[];
}

export interface RevenueMonth {
  label: string;
  value: number;
}

export interface BookingRow {
  label: string;
  percent: string;
  color: string;
  detail: { left: string; right: string };
}

export interface MailStat {
  label: string;
  value: number;
  color: string;
}

export interface AlertRow {
  title: string;
  meta: string;
  amount: string;
  amountTone: AmountTone;
  tag: string;
  icon: string;
  iconColor: string;
}

export interface AdTile {
  label: string;
  value: string;
  delta: string;
}

/**
 * The dashboard's date-range options, in display order. Rolling rather than
 * fixed calendar labels, so the ledger figures always land on real periods.
 */
export type DateRange = "This month" | "Last month" | "This quarter";

/** Revenue figures for one range, aggregated from the `transactions` ledger. */
export interface RevenueFigures {
  total: string;
  delta: string;
  months: RevenueMonth[];
  highlightMonth: string;
  /** Monthly totals for the Revenue KPI sparkline. */
  points: number[];
}

/** What the server hands the dashboard: real revenue, keyed by range. */
export type LedgerRevenue = Record<DateRange, RevenueFigures>;

/** Everything on the dashboard that varies with the selected date range. */
export interface DashboardRangeData {
  kpis: Kpi[];
  revenueTotal: string;
  revenueDelta: string;
  revenueHighlightMonth: string;
  revenueMonths: RevenueMonth[];
  bookingsTotal: string;
  bookingsDelta: string;
  bookingRows: BookingRow[];
  adTiles: AdTile[];
  insight: string;
}
