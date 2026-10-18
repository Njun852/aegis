"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui";
import { monthLabel } from "@/lib/finance-periods";
import { formatMoney } from "@/lib/format";
import { formatQuoteDay } from "@/lib/quotations";
import { DrillModal, FigureButton, type DrillRequest } from "./drill-down";
import type { FinanceOverview } from "@/types";

const CARD = {
  background: "var(--surface-card)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-card)",
  padding: "14px 16px",
  minWidth: 0,
};

/**
 * The owner's Finance screen. Exception-first: five figures and the items
 * that need someone, nothing else. Every figure opens into its records.
 */
export function OverviewPanel({ overview, accountNames }: { overview: FinanceOverview; accountNames: Record<string, string> }) {
  const [drill, setDrill] = useState<DrillRequest | null>(null);
  const { income, standing, alerts } = overview;
  const held = standing.cash.cents + standing.bank.cents + standing.ewallet.cents;
  const heldLabel = standing.ewallet.rows.length > 0 ? "Cash + Bank/Passbook + E-wallets" : "Cash + Bank/Passbook";
  const month = monthLabel(overview.month);

  const tiles: { label: string; sub: string; cents: number; drill: DrillRequest; headline?: boolean; negative?: boolean }[] = [
    {
      label: "Net income",
      sub: `${month} so far · sales ${formatMoney(income.sales.cents)}, costs ${formatMoney(income.costs.cents)}`,
      cents: income.netIncomeCents,
      headline: true,
      negative: income.netIncomeCents < 0,
      drill: {
        title: `Net income, ${month} so far`,
        subtitle: "Sales less costs and expenses dated this month. Receivables, payables and balances are not part of it.",
        sections: [
          { label: "Sales / revenue", figure: income.sales, sign: 1 },
          { label: "Costs & expenses", figure: income.costs, sign: -1 },
        ],
        shownCents: income.netIncomeCents,
      },
    },
    {
      label: "Current financial position",
      sub: `As of ${formatQuoteDay(overview.today)} · cash, bank and receivables less payables`,
      cents: standing.positionCents,
      headline: true,
      negative: standing.positionCents < 0,
      drill: {
        title: "Current financial position",
        subtitle: "Cash + Bank/Passbook + E-wallets + Accounts receivable - Accounts payable, today.",
        sections: [
          { label: "Cash on hand", figure: standing.cash, sign: 1 },
          { label: "Bank / Passbook", figure: standing.bank, sign: 1 },
          { label: "E-wallets", figure: standing.ewallet, sign: 1 },
          { label: "Accounts receivable", figure: standing.receivable, sign: 1 },
          { label: "Accounts payable", figure: standing.payable, sign: -1 },
        ],
        shownCents: standing.positionCents,
      },
    },
    {
      label: heldLabel,
      sub: "What the business holds today",
      cents: held,
      drill: {
        title: heldLabel,
        sections: [
          { label: "Cash on hand", figure: standing.cash, sign: 1 },
          { label: "Bank / Passbook", figure: standing.bank, sign: 1 },
          ...(standing.ewallet.rows.length > 0 ? [{ label: "E-wallets", figure: standing.ewallet, sign: 1 as const }] : []),
        ],
        shownCents: held,
      },
    },
    {
      label: "Total accounts receivable",
      sub: `${standing.receivable.rows.length} ${standing.receivable.rows.length === 1 ? "invoice" : "invoices"} still owed`,
      cents: standing.receivable.cents,
      drill: { title: "Accounts receivable", subtitle: "What is still owed on each invoice today.", sections: [{ label: "Receivable", figure: standing.receivable, sign: 1 }], shownCents: standing.receivable.cents },
    },
    {
      label: "Total accounts payable",
      sub: `${standing.payable.rows.length} ${standing.payable.rows.length === 1 ? "bill" : "bills"} still to pay, due or not`,
      cents: standing.payable.cents,
      drill: { title: "Accounts payable", subtitle: "What is still owed on each bill today, due or not.", sections: [{ label: "Payable", figure: standing.payable, sign: 1 }], shownCents: standing.payable.cents },
    },
  ];

  return (
    <>
      <div className="flex flex-col gap-3.5">
        <div className="grid grid-cols-1 gap-3 wide:grid-cols-2">
          {tiles.filter((tile) => tile.headline).map((tile) => (
            <div key={tile.label} style={CARD}>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>{tile.label}</div>
              <FigureButton label={tile.label} onClick={() => setDrill(tile.drill)} style={{ marginTop: 4 }}>
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "28px",
                    fontWeight: 700,
                    letterSpacing: "-.02em",
                    color: tile.negative ? "var(--status-negative)" : "var(--text-primary)",
                  }}
                >
                  {formatMoney(tile.cents)}
                </span>
              </FigureButton>
              <div style={{ fontSize: "11.5px", color: "var(--text-muted)", marginTop: 2 }}>{tile.sub}</div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 wide:grid-cols-3">
          {tiles.filter((tile) => !tile.headline).map((tile) => (
            <div key={tile.label} style={CARD}>
              <div style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>{tile.label}</div>
              <FigureButton label={tile.label} onClick={() => setDrill(tile.drill)} style={{ marginTop: 4 }}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: "20px", fontWeight: 700, letterSpacing: "-.02em" }}>{formatMoney(tile.cents)}</span>
              </FigureButton>
              <div style={{ fontSize: "11.5px", color: "var(--text-muted)", marginTop: 2 }}>{tile.sub}</div>
            </div>
          ))}
        </div>

        <section style={{ ...CARD, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="flex items-center justify-between gap-3">
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "14px", fontWeight: 700 }}>Needs attention</h3>
            <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>Critical items only</span>
          </div>
          {alerts.length === 0 ? (
            <div className="flex items-center gap-2" style={{ fontSize: "12.5px", color: "var(--text-secondary)", padding: "6px 0" }}>
              <span style={{ color: "var(--status-positive)" }}>
                <Icon name="check-circle-2" size={16} />
              </span>
              Nothing needs attention. No receivable over 90 days, no bill overdue or due within 7 days, and every count matches the book.
            </div>
          ) : (
            <div className="flex flex-col">
              {alerts.map((alert) => (
                <Link
                  key={alert.key}
                  href={alert.href}
                  className="flex items-center gap-3"
                  style={{ padding: "10px 4px", borderTop: "1px solid var(--gray-50)", color: "inherit", textDecoration: "none" }}
                >
                  <span style={{ color: alert.tone === "negative" ? "var(--status-negative)" : "var(--status-warning)", flex: "0 0 auto" }}>
                    <Icon name={alert.tone === "negative" ? "circle-alert" : "alert-triangle"} size={16} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span style={{ fontSize: "12.5px", fontWeight: 600 }}>{alert.title}</span>
                    <span style={{ fontSize: "11.5px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{alert.detail}</span>
                  </span>
                  {alert.amount && (
                    <span style={{ fontSize: "13px", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: alert.tone === "negative" ? "var(--status-negative)" : "var(--text-primary)" }}>
                      {alert.amount}
                    </span>
                  )}
                  <span style={{ color: "var(--text-muted)" }}>
                    <Icon name="chevron-right" size={15} />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <div className="flex flex-wrap gap-4" style={{ fontSize: "12.5px" }}>
          <Link href="/finance?tab=income" style={{ color: "var(--text-accent)" }}>
            Monthly Income Report
          </Link>
          <Link href="/finance?tab=standing" style={{ color: "var(--text-accent)" }}>
            Financial Standing Report
          </Link>
        </div>
      </div>

      {drill && <DrillModal request={drill} accountNames={accountNames} onClose={() => setDrill(null)} />}
    </>
  );
}
