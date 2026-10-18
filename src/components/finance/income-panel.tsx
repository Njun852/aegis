"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Notice } from "@/components/forms/form-kit";
import { Button } from "@/components/ui";
import { EXPENSE_CATEGORIES } from "@/lib/finance";
import { addMonths, monthLabel } from "@/lib/finance-periods";
import { formatMoney } from "@/lib/format";
import { DrillModal, FigureButton, type DrillRequest } from "./drill-down";
import type { IncomeFigures, MonthKey } from "@/types";

const CARD = {
  background: "var(--surface-card)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-card)",
  padding: "16px 18px",
  minWidth: 0,
};

/**
 * Report A, live: how much the business made in a month. Sales and costs
 * dated in the month, and nothing else; no cash, bank, receivable, payable
 * or position appears here. The frozen month-end copy comes from the close.
 */
export function IncomePanel({
  income,
  currentMonth,
  firstMonth,
  accountNames,
}: {
  income: IncomeFigures;
  currentMonth: MonthKey;
  firstMonth: MonthKey;
  accountNames: Record<string, string>;
}) {
  const router = useRouter();
  const [drill, setDrill] = useState<DrillRequest | null>(null);
  const [, startNavigation] = useTransition();
  const label = monthLabel(income.month);
  const go = (month: MonthKey) => startNavigation(() => router.replace(`/finance?tab=income&month=${month}`, { scroll: false }));

  const one = (title: string, figure: IncomeFigures["sales"]): DrillRequest => ({
    title: `${title}, ${label}`,
    sections: [{ label: title, figure, sign: 1 }],
    shownCents: figure.cents,
  });
  const net: DrillRequest = {
    title: `Net income, ${label}`,
    subtitle: "Net Income = Total Sales - Total Costs & Expenses",
    sections: [
      { label: "Sales / revenue", figure: income.sales, sign: 1 },
      { label: "Costs & expenses", figure: income.costs, sign: -1 },
    ],
    shownCents: income.netIncomeCents,
  };

  const lines = [
    { label: "Sales / Revenue", cents: income.sales.cents, drill: one("Sales / revenue", income.sales) },
    { label: "Costs & Expenses", cents: income.costs.cents, drill: one("Costs & expenses", income.costs) },
  ];

  return (
    <>
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" icon="arrow-left" disabled={income.month <= firstMonth} onClick={() => go(addMonths(income.month, -1))}>
              Earlier
            </Button>
            <strong style={{ fontFamily: "var(--font-display)", fontSize: "16px", minWidth: 150, textAlign: "center" }}>{label}</strong>
            <Button size="sm" variant="secondary" iconRight="arrow-right" disabled={income.month >= currentMonth} onClick={() => go(addMonths(income.month, 1))}>
              Later
            </Button>
          </div>
          {income.month !== currentMonth && (
            <Button size="sm" variant="ghost" onClick={() => go(currentMonth)}>
              This month
            </Button>
          )}
        </div>

        {income.month === currentMonth && (
          <Notice tone="info">The month is still running, so these figures will change until it closes.</Notice>
        )}

        <section style={CARD}>
          <div style={{ fontSize: "11px", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text-muted)" }}>Monthly Income Report</div>
          <h3 style={{ margin: "2px 0 14px", fontFamily: "var(--font-display)", fontSize: "18px", fontWeight: 700 }}>{label}</h3>
          <div className="flex flex-col" style={{ maxWidth: 520 }}>
            {lines.map((line) => (
              <div key={line.label} className="flex items-baseline justify-between gap-3" style={{ padding: "8px 0", borderBottom: "1px solid var(--gray-50)" }}>
                <span style={{ fontSize: "13px" }}>{line.label}</span>
                <FigureButton label={line.label} onClick={() => setDrill(line.drill)} style={{ fontSize: "14px", fontWeight: 600 }}>
                  {formatMoney(line.cents)}
                </FigureButton>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-3" style={{ padding: "10px 0", borderBottom: "1px solid var(--gray-50)" }}>
              <strong style={{ fontSize: "14px" }}>Net Income</strong>
              <FigureButton
                label="Net income"
                onClick={() => setDrill(net)}
                style={{ fontSize: "18px", fontWeight: 700, color: income.netIncomeCents < 0 ? "var(--status-negative)" : "var(--text-primary)" }}
              >
                {formatMoney(income.netIncomeCents)}
              </FigureButton>
            </div>
            <div className="flex items-baseline justify-between gap-3" style={{ padding: "8px 0" }}>
              <span style={{ fontSize: "13px" }}>Net Margin</span>
              <span style={{ fontSize: "14px", fontWeight: 600, fontVariantNumeric: "tabular-nums" }} title="Net Income / Total Sales x 100">
                {income.netMarginPercent === null ? "No sales" : `${income.netMarginPercent.toFixed(1)}%`}
              </span>
            </div>
          </div>
        </section>

        <section style={CARD}>
          <h3 style={{ margin: "0 0 10px", fontFamily: "var(--font-display)", fontSize: "14px", fontWeight: 700 }}>Simple expense breakdown</h3>
          <div className="flex flex-col" style={{ maxWidth: 520 }}>
            {EXPENSE_CATEGORIES.map(({ key, label: name }) => {
              const figure = income.byCategory[key];
              return (
                <div key={key} className="flex items-baseline justify-between gap-3" style={{ padding: "7px 0", borderBottom: "1px solid var(--gray-50)" }}>
                  <span style={{ fontSize: "12.5px", color: figure.cents === 0 ? "var(--text-muted)" : "var(--text-primary)" }}>{name}</span>
                  {figure.rows.length > 0 ? (
                    <FigureButton label={name} onClick={() => setDrill(one(name, figure))} style={{ fontSize: "13px", fontWeight: 600 }}>
                      {formatMoney(figure.cents)}
                    </FigureButton>
                  ) : (
                    <span style={{ fontSize: "13px", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{formatMoney(0)}</span>
                  )}
                </div>
              );
            })}
            <div className="flex items-baseline justify-between gap-3" style={{ padding: "9px 0" }}>
              <strong style={{ fontSize: "13px" }}>Total costs & expenses</strong>
              <strong style={{ fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>{formatMoney(income.costs.cents)}</strong>
            </div>
          </div>
        </section>

        <span style={{ fontSize: "11.5px", color: "var(--text-muted)", textWrap: "pretty" }}>
          Only invoices and bills dated in {label} are counted, paid or not. Cash, bank and passbook balances, receivables, payables and the
          financial position are on the Financial Standing Report, never here. Click any figure to see the records behind it.
        </span>
      </div>

      {drill && <DrillModal request={drill} accountNames={accountNames} onClose={() => setDrill(null)} />}
    </>
  );
}
