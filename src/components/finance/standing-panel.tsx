"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { INPUT, Notice } from "@/components/forms/form-kit";
import { Button, Icon } from "@/components/ui";
import { formatMoney, formatSignedMoney } from "@/lib/format";
import { formatQuoteDay } from "@/lib/quotations";
import { DrillModal, FigureButton, type DrillRequest } from "./drill-down";
import type { DateKey, FinanceAlert, Figure, StandingAttention, StandingFigures } from "@/types";

const CARD = {
  background: "var(--surface-card)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-card)",
  padding: "16px 18px",
  minWidth: 0,
};

/**
 * Report B, live: where the business stands on a day. Balances and what is
 * owed either way, and the exceptions on the same day. No sales or costs for
 * a month appear here; that is the Income Report.
 */
export function StandingPanel({
  standing,
  attention,
  ownerItems,
  today,
  accountNames,
}: {
  standing: StandingFigures;
  attention: StandingAttention;
  /** Records missing from AR and AP, and 90+ follow-up gaps. Only known for today. */
  ownerItems: FinanceAlert[];
  today: DateKey;
  accountNames: Record<string, string>;
}) {
  const router = useRouter();
  const [drill, setDrill] = useState<DrillRequest | null>(null);
  const [, startNavigation] = useTransition();
  const day = formatQuoteDay(standing.asOf);
  const isToday = standing.asOf === today;
  const go = (asOf: DateKey) =>
    startNavigation(() => router.replace(asOf === today ? "/finance?tab=standing" : `/finance?tab=standing&asOf=${asOf}`, { scroll: false }));

  const open = (title: string, figure: Figure, subtitle?: string) =>
    setDrill({ title: `${title}, ${day}`, subtitle, sections: [{ label: title, figure, sign: 1 }], shownCents: figure.cents });

  const held = standing.cash.cents + standing.bank.cents + standing.ewallet.cents;
  const balanceLines: { label: string; figure: Figure; indent?: boolean; hint?: string }[] = [
    { label: "Cash on hand", figure: standing.cash },
    { label: "Bank accounts", figure: standing.bankAccounts },
    { label: "Passbook accounts", figure: standing.passbooks, hint: "A passbook is a bank account; each is counted once, here or above, never both." },
    ...(standing.ewallet.rows.length > 0 ? [{ label: "E-wallet balances", figure: standing.ewallet }] : []),
  ];

  const position: DrillRequest = {
    title: `Current financial position, ${day}`,
    subtitle: "Current Financial Position = Cash + Bank/Passbook + E-wallet Balances + Accounts Receivable - Accounts Payable",
    sections: [
      { label: "Cash on hand", figure: standing.cash, sign: 1 },
      { label: "Bank accounts", figure: standing.bankAccounts, sign: 1 },
      { label: "Passbook accounts", figure: standing.passbooks, sign: 1 },
      { label: "E-wallet balances", figure: standing.ewallet, sign: 1 },
      { label: "Accounts receivable", figure: standing.receivable, sign: 1 },
      { label: "Accounts payable", figure: standing.payable, sign: -1 },
    ],
    shownCents: standing.positionCents,
  };

  const exceptions: { label: string; figure: Figure; amount: boolean; subtitle: string }[] = [
    { label: "AR 90+ days", figure: attention.ar90, amount: true, subtitle: "Still owed on invoices more than 90 days old." },
    { label: "Overdue AP", figure: attention.apOverdue, amount: true, subtitle: "Still owed on bills past their due date." },
    { label: "AP due within 7 days", figure: attention.apDue7, amount: true, subtitle: "Still owed on bills due in the next seven days." },
    { label: "Unreconciled cash/bank differences", figure: attention.differences, amount: true, subtitle: "Counts that differ from the book, not yet explained. Counted minus book." },
  ];

  const row = (label: string, figure: Figure, opts: { bold?: boolean; minus?: boolean; indent?: boolean } = {}) => (
    <div key={label} className="flex items-baseline justify-between gap-3" style={{ padding: "8px 0", paddingLeft: opts.indent ? 14 : 0, borderBottom: "1px solid var(--gray-50)" }}>
      <span style={{ fontSize: "13px", fontWeight: opts.bold ? 700 : 400 }}>
        {opts.minus ? "Less " : ""}
        {label}
      </span>
      <FigureButton label={label} onClick={() => open(label, figure)} style={{ fontSize: "14px", fontWeight: opts.bold ? 700 : 600 }}>
        {opts.minus ? "-" : ""}
        {formatMoney(figure.cents)}
      </FigureButton>
    </div>
  );

  return (
    <>
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span style={{ fontSize: "12.5px", color: "var(--text-secondary)" }}>As of the end of</span>
          <input style={{ ...INPUT, width: 180 }} type="date" value={standing.asOf} max={today} onChange={(event) => event.target.value && go(event.target.value)} />
          {!isToday && (
            <Button size="sm" variant="ghost" onClick={() => go(today)}>
              Today
            </Button>
          )}
        </div>

        <section style={CARD}>
          <div style={{ fontSize: "11px", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text-muted)" }}>Financial Standing Report</div>
          <h3 style={{ margin: "2px 0 14px", fontFamily: "var(--font-display)", fontSize: "18px", fontWeight: 700 }}>
            {isToday ? `Today, ${day}` : day}
          </h3>
          <div className="flex flex-col" style={{ maxWidth: 560 }}>
            {balanceLines.map((line) => (
              <div key={line.label}>
                {row(line.label, line.figure)}
                {line.hint && line.figure.rows.length > 0 && (
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", padding: "2px 0 4px" }}>{line.hint}</div>
                )}
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-3" style={{ padding: "8px 0", borderBottom: "1px solid var(--border-subtle)" }}>
              <span style={{ fontSize: "12.5px", color: "var(--text-secondary)" }}>Cash, bank and e-wallets held</span>
              <span style={{ fontSize: "13px", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{formatMoney(held)}</span>
            </div>
            {row("Total accounts receivable", standing.receivable)}
            {row("Total accounts payable", standing.payable, { minus: true })}
            <div className="flex items-baseline justify-between gap-3" style={{ padding: "12px 0 4px" }}>
              <strong style={{ fontSize: "14px" }}>Current Financial Position</strong>
              <FigureButton
                label="Current financial position"
                onClick={() => setDrill(position)}
                style={{ fontSize: "20px", fontWeight: 700, color: standing.positionCents < 0 ? "var(--status-negative)" : "var(--text-primary)" }}
              >
                {formatMoney(standing.positionCents)}
              </FigureButton>
            </div>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Cash + Bank/Passbook + E-wallet Balances + Accounts Receivable - Accounts Payable</span>
          </div>
        </section>

        <section style={CARD}>
          <h3 style={{ margin: "0 0 10px", fontFamily: "var(--font-display)", fontSize: "14px", fontWeight: 700 }}>Needing attention on {day}</h3>
          <div className="flex flex-col" style={{ maxWidth: 560 }}>
            {exceptions.map((item) => (
              <div key={item.label} className="flex items-baseline justify-between gap-3" style={{ padding: "8px 0", borderBottom: "1px solid var(--gray-50)" }}>
                <span style={{ fontSize: "13px" }}>
                  {item.label}
                  <span style={{ color: "var(--text-muted)" }}> · {item.figure.rows.length}</span>
                </span>
                {item.figure.rows.length > 0 ? (
                  <FigureButton
                    label={item.label}
                    onClick={() => open(item.label, item.figure, item.subtitle)}
                    style={{ fontSize: "14px", fontWeight: 600, color: "var(--status-negative)" }}
                  >
                    {item.figure.cents < 0 ? formatSignedMoney(item.figure.cents) : formatMoney(item.figure.cents)}
                  </FigureButton>
                ) : (
                  <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>None</span>
                )}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: 6 }}>Finance items requiring owner attention</div>
            {!isToday ? (
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                Follow-up gaps and records not yet entered are checked for today only.{" "}
                <button type="button" onClick={() => go(today)} style={{ border: "none", background: "none", padding: 0, font: "inherit", color: "var(--text-accent)", cursor: "pointer" }}>
                  See today
                </button>
              </span>
            ) : ownerItems.length === 0 ? (
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>None.</span>
            ) : (
              <div className="flex flex-col gap-1.5">
                {ownerItems.map((item) => (
                  <Link key={item.key} href={item.href} className="flex items-center gap-2" style={{ fontSize: "12.5px", color: "inherit", textDecoration: "none" }}>
                    <span style={{ color: item.tone === "negative" ? "var(--status-negative)" : "var(--status-warning)" }}>
                      <Icon name="circle-alert" size={14} />
                    </span>
                    <span style={{ flex: 1 }}>{item.title}</span>
                    {item.amount && <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{item.amount}</span>}
                    <Icon name="chevron-right" size={14} />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>

        {!isToday && (
          <Notice tone="info">
            Balances and amounts owed as they stood at the end of {day}, worked out from the records as they are now: a record dated
            on or before {day} but entered later is included. The frozen month-end report keeps what was known when the month closed.
          </Notice>
        )}
      </div>

      {drill && <DrillModal request={drill} accountNames={accountNames} onClose={() => setDrill(null)} />}
    </>
  );
}
