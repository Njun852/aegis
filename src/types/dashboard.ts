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

/** The dashboard's date-range picker options, in display order. */
export type DateRange = "May 01 – May 31, 2026" | "Apr 01 – Apr 30, 2026" | "Q2 2026";

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
