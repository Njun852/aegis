import type { DashboardRangeData, DateRange } from "@/types";

export const DATE_RANGES: DateRange[] = [
  "This month",
  "Last month",
  "This quarter",
];

export const DEFAULT_DATE_RANGE: DateRange = DATE_RANGES[0];

function months(
  pairs: [string, number][],
): DashboardRangeData["revenueMonths"] {
  return pairs.map(([label, value]) => ({ label, value: value * 1000 }));
}

/**
 * SAMPLE FIGURES. Revenue is overridden with real ledger totals by
 * `DashboardRangeProvider`; everything else here — balance, expenses, net
 * profit, bookings, ads, alerts — is still invented and has no data source yet.
 */
export const DASHBOARD_RANGES: Record<DateRange, DashboardRangeData> = {
  "This month": {
    kpis: [
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
    ],
    revenueTotal: "$ 86,240.00",
    revenueDelta: "15.7%",
    revenueHighlightMonth: "May",
    revenueMonths: months([
      ["Oct", 52],
      ["Nov", 58],
      ["Dec", 65],
      ["Jan", 55],
      ["Feb", 62],
      ["Mar", 70],
      ["Apr", 76],
      ["May", 86],
    ]),
    bookingsTotal: "342",
    bookingsDelta: "6.4%",
    bookingRows: [
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
    ],
    adTiles: [
      { label: "Spend", value: "$ 9,420", delta: "6.2%" },
      { label: "Leads", value: "294", delta: "18.4%" },
      { label: "Cost / lead", value: "$ 32.05", delta: "-22.2%" },
      { label: "Conversions", value: "61", delta: "11.0%" },
    ],
    insight:
      "Spring Fleet Promo drives 61% of conversions at half the cost per lead. Consider shifting budget from Brand Search.",
  },

  "Last month": {
    kpis: [
      {
        label: "Total Balance",
        value: "$ 118,650.00",
        icon: "wallet",
        tone: "accent",
        delta: "9.1%",
        points: [5, 7, 6, 9, 8, 8, 11, 10, 13],
      },
      {
        label: "Revenue",
        value: "$ 76,240.00",
        icon: "trending-up",
        tone: "positive",
        delta: "8.6%",
        points: [4, 6, 5, 7, 6, 7, 8, 9, 11],
      },
      {
        label: "Expenses",
        value: "$ 40,120.00",
        icon: "credit-card",
        tone: "negative",
        delta: "-2.3%",
        points: [8, 9, 7, 9, 8, 9, 8, 7, 6],
      },
      {
        label: "Net Profit",
        value: "$ 36,120.00",
        icon: "bar-chart-2",
        tone: "accent",
        delta: "6.1%",
        points: [4, 6, 5, 8, 7, 9, 8, 10, 11],
      },
    ],
    revenueTotal: "$ 76,240.00",
    revenueDelta: "8.6%",
    revenueHighlightMonth: "Apr",
    revenueMonths: months([
      ["Sep", 48],
      ["Oct", 52],
      ["Nov", 58],
      ["Dec", 65],
      ["Jan", 55],
      ["Feb", 62],
      ["Mar", 70],
      ["Apr", 76],
    ]),
    bookingsTotal: "318",
    bookingsDelta: "3.2%",
    bookingRows: [
      {
        label: "Freight",
        percent: "45%",
        color: "var(--viz-1)",
        detail: { left: "143 bookings", right: "$ 34,900" },
      },
      {
        label: "Warehousing",
        percent: "27%",
        color: "var(--viz-2)",
        detail: { left: "86 bookings", right: "$ 21,200" },
      },
      {
        label: "Last mile",
        percent: "17%",
        color: "var(--viz-3)",
        detail: { left: "54 bookings", right: "$ 13,400" },
      },
      {
        label: "Cold chain",
        percent: "11%",
        color: "var(--viz-4)",
        detail: { left: "35 bookings", right: "$ 7,100" },
      },
    ],
    adTiles: [
      { label: "Spend", value: "$ 8,870", delta: "3.1%" },
      { label: "Leads", value: "248", delta: "9.6%" },
      { label: "Cost / lead", value: "$ 35.77", delta: "-8.4%" },
      { label: "Conversions", value: "55", delta: "6.2%" },
    ],
    insight:
      "Early results from Spring Fleet Promo show a 22% lower cost per lead than Brand Search. Consider testing a larger budget shift next month.",
  },

  "This quarter": {
    kpis: [
      {
        label: "Total Balance",
        value: "$ 128,430.50",
        icon: "wallet",
        tone: "accent",
        delta: "18.9%",
        points: [3, 5, 6, 8, 9, 11, 12, 15, 17],
      },
      {
        label: "Revenue",
        value: "$ 254,240.00",
        icon: "trending-up",
        tone: "positive",
        delta: "18.2%",
        points: [3, 5, 6, 8, 9, 10, 12, 13, 15],
      },
      {
        label: "Expenses",
        value: "$ 118,940.00",
        icon: "credit-card",
        tone: "negative",
        delta: "-3.5%",
        points: [9, 8, 9, 7, 8, 7, 8, 7, 6],
      },
      {
        label: "Net Profit",
        value: "$ 135,300.00",
        icon: "bar-chart-2",
        tone: "accent",
        delta: "14.6%",
        points: [4, 6, 7, 9, 10, 12, 13, 15, 18],
      },
    ],
    revenueTotal: "$ 254,240.00",
    revenueDelta: "18.2%",
    revenueHighlightMonth: "Jun",
    revenueMonths: months([
      ["Apr", 76],
      ["May", 86],
      ["Jun", 92],
    ]),
    bookingsTotal: "985",
    bookingsDelta: "9.1%",
    bookingRows: [
      {
        label: "Freight",
        percent: "44%",
        color: "var(--viz-1)",
        detail: { left: "433 bookings", right: "$ 112,600" },
      },
      {
        label: "Warehousing",
        percent: "27%",
        color: "var(--viz-2)",
        detail: { left: "266 bookings", right: "$ 68,300" },
      },
      {
        label: "Last mile",
        percent: "18%",
        color: "var(--viz-3)",
        detail: { left: "177 bookings", right: "$ 44,900" },
      },
      {
        label: "Cold chain",
        percent: "11%",
        color: "var(--viz-4)",
        detail: { left: "109 bookings", right: "$ 21,700" },
      },
    ],
    adTiles: [
      { label: "Spend", value: "$ 27,610", delta: "15.8%" },
      { label: "Leads", value: "842", delta: "22.1%" },
      { label: "Cost / lead", value: "$ 32.80", delta: "-18.6%" },
      { label: "Conversions", value: "176", delta: "19.3%" },
    ],
    insight:
      "Across Q2, Spring Fleet Promo has driven the majority of conversions at roughly half the cost per lead of Brand Search — the clearest budget-reallocation case this quarter.",
  },
};

export const AWAITING_REPLY_COUNT = 5;

export const ALERT_ROWS = [
  {
    title: "Invoice INV-40219 overdue",
    meta: "May 31 · 08:15 AM",
    amount: "$12,480.00",
    amountTone: "negative" as const,
    tag: "8 days late",
    icon: "circle-alert",
    iconColor: "var(--viz-6)",
  },
  {
    title: "Ads daily budget exceeded",
    meta: "May 28 · 07:00 AM",
    amount: "+18%",
    amountTone: "negative" as const,
    tag: "3 days",
    icon: "megaphone",
    iconColor: "var(--viz-4)",
  },
  {
    title: "Gmail sync partial failure",
    meta: "May 31 · 09:50 AM",
    amount: "2 threads",
    amountTone: "neutral" as const,
    tag: "429",
    icon: "refresh-cw",
    iconColor: "var(--viz-4)",
  },
];
