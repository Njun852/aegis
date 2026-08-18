import type { AdTile, AlertRow, BookingRow, Kpi, RevenueMonth } from "@/types";

export const DATE_RANGES = [
  "May 01 – May 31, 2026",
  "Apr 01 – Apr 30, 2026",
  "Q2 2026",
];

export const KPIS: Kpi[] = [
  {
    label: "Total Balance",
    value: "$ 128,430.50",
    icon: "wallet",
    tone: "accent",
    delta: "12.5%",
    points: [6, 9, 7, 12, 10, 9, 14, 12, 17],
  },
  {
    label: "Revenue",
    value: "$ 86,240.00",
    icon: "trending-up",
    tone: "positive",
    delta: "15.7%",
    points: [4, 7, 6, 9, 8, 7, 11, 10, 14],
  },
  {
    label: "Expenses",
    value: "$ 41,905.20",
    icon: "credit-card",
    tone: "negative",
    delta: "-4.1%",
    points: [9, 7, 10, 8, 11, 7, 9, 8, 6],
  },
  {
    label: "Net Profit",
    value: "$ 44,334.80",
    icon: "bar-chart-2",
    tone: "accent",
    delta: "9.8%",
    points: [5, 8, 6, 11, 9, 13, 12, 16, 18],
  },
];

export const REVENUE_TOTAL = "$ 86,240.00";
export const REVENUE_DELTA = "15.7%";
export const REVENUE_HIGHLIGHT_MONTH = "May";

export const REVENUE_MONTHS: RevenueMonth[] = [
  ["Oct", 52],
  ["Nov", 58],
  ["Dec", 65],
  ["Jan", 55],
  ["Feb", 62],
  ["Mar", 70],
  ["Apr", 76],
  ["May", 86],
].map(([label, value]) => ({
  label: label as string,
  value: (value as number) * 1000,
}));

export const BOOKINGS_TOTAL = "342";
export const BOOKINGS_DELTA = "6.4%";

export const BOOKING_ROWS: BookingRow[] = [
  {
    label: "Freight",
    percent: "43%",
    color: "var(--viz-1)",
    detail: { left: "148 bookings", right: "$ 38,420" },
  },
  {
    label: "Warehousing",
    percent: "28%",
    color: "var(--viz-2)",
    detail: { left: "96 bookings", right: "$ 24,150" },
  },
  {
    label: "Last mile",
    percent: "18%",
    color: "var(--viz-3)",
    detail: { left: "63 bookings", right: "$ 15,880" },
  },
  {
    label: "Cold chain",
    percent: "11%",
    color: "var(--viz-4)",
    detail: { left: "35 bookings", right: "$ 7,790" },
  },
];

export const AWAITING_REPLY_COUNT = 5;

export const ALERT_ROWS: AlertRow[] = [
  {
    title: "Invoice INV-40219 overdue",
    meta: "May 31 · 08:15 AM",
    amount: "$12,480.00",
    amountTone: "negative",
    tag: "8 days late",
    icon: "circle-alert",
    iconColor: "var(--viz-6)",
  },
  {
    title: "Ads daily budget exceeded",
    meta: "May 28 · 07:00 AM",
    amount: "+18%",
    amountTone: "negative",
    tag: "3 days",
    icon: "megaphone",
    iconColor: "var(--viz-4)",
  },
  {
    title: "Gmail sync partial failure",
    meta: "May 31 · 09:50 AM",
    amount: "2 threads",
    amountTone: "neutral",
    tag: "429",
    icon: "refresh-cw",
    iconColor: "var(--viz-4)",
  },
];

export const AD_TILES: AdTile[] = [
  { label: "Spend", value: "$ 9,420", delta: "6.2%" },
  { label: "Leads", value: "294", delta: "18.4%" },
  { label: "Cost / lead", value: "$ 32.05", delta: "-22.2%" },
  { label: "Conversions", value: "61", delta: "11.0%" },
];

export const DASHBOARD_INSIGHT =
  "Spring Fleet Promo drives 61% of conversions at half the cost per lead. Consider shifting budget from Brand Search.";
