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
