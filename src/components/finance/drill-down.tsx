"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Modal } from "@/components/forms/form-kit";
import { Icon } from "@/components/ui";
import { formatMoney, formatSignedMoney } from "@/lib/format";
import { formatQuoteDay } from "@/lib/quotations";
import type { Figure, SourceRow } from "@/types";

/**
 * One part of what a number is made of. Net income is sales (+) and costs
 * (-); the position is five parts. A single figure is one section.
 */
export interface DrillSection {
  label: string;
  figure: Figure;
  sign: 1 | -1;
}

export interface DrillRequest {
  title: string;
  subtitle?: string;
  sections: DrillSection[];
  /** The number on screen, which the rows must add up to. */
  shownCents: number;
}

/** Where a row's record lives, so every line opens the record itself. */
export function rowHref(row: SourceRow): string | null {
  if (row.kind === "invoice") return `/finance?tab=receivables&invoice=${encodeURIComponent(row.ref)}`;
  if (row.kind === "bill") return `/finance?tab=payables&bill=${encodeURIComponent(row.ref)}`;
  if (row.accountRef) return `/finance?tab=accounts&account=${encodeURIComponent(row.accountRef)}`;
  return null;
}

const KIND: Record<SourceRow["kind"], string> = {
  invoice: "Invoice",
  bill: "Bill",
  payment: "Payment",
  opening: "Opening balance",
  count: "Count",
};

/**
 * Every record behind a figure, and their total set against the figure shown.
 * The check at the foot is the drill-down promise made visible: if the two
 * ever disagree, it says so in red instead of hiding it.
 */
export function DrillModal({
  request,
  accountNames,
  onClose,
}: {
  request: DrillRequest;
  accountNames: Record<string, string>;
  onClose: () => void;
}) {
  const total = request.sections.reduce(
    (sum, section) => sum + section.sign * section.figure.rows.reduce((inner, row) => inner + row.amountCents, 0),
    0,
  );
  const matches = total === request.shownCents;
  const lines = request.sections.reduce((count, section) => count + section.figure.rows.length, 0);

  return (
    <Modal title={request.title} icon="layers" width={700} onClose={onClose}>
      {request.subtitle && <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{request.subtitle}</span>}
      {request.sections.map((section) => (
        <section key={section.label} className="flex flex-col gap-1.5">
          {request.sections.length > 1 && (
            <div className="flex items-baseline justify-between gap-3">
              <strong style={{ fontSize: "12.5px" }}>
                {section.sign < 0 ? "Less " : ""}
                {section.label}
              </strong>
              <span style={{ fontSize: "12.5px", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {section.sign < 0 ? "-" : ""}
                {formatMoney(section.figure.cents)}
              </span>
            </div>
          )}
          <div style={{ border: "1px solid var(--border-default)", borderRadius: 12, overflow: "hidden" }}>
            {section.figure.rows.length === 0 && (
              <div style={{ padding: "10px 12px", fontSize: "12px", color: "var(--text-muted)" }}>No records.</div>
            )}
            {section.figure.rows.map((row) => {
              const href = rowHref(row);
              const account = row.accountRef ? accountNames[row.accountRef] : undefined;
              const label = (
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span style={{ fontSize: "12.5px", overflowWrap: "anywhere" }}>
                    {account && row.kind !== "opening" ? `${account} · ` : ""}
                    {row.label}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "10.5px", color: "var(--text-muted)" }}>
                    {KIND[row.kind]} · {row.ref}
                  </span>
                </span>
              );
              return (
                <div key={`${row.kind}-${row.ref}`} className="flex items-center gap-3" style={{ padding: "8px 12px", borderBottom: "1px solid var(--gray-50)" }}>
                  <span style={{ width: 84, flex: "0 0 auto", fontSize: "11.5px", color: "var(--text-muted)" }}>{formatQuoteDay(row.dateKey)}</span>
                  {href ? (
                    <Link href={href} onClick={onClose} className="flex min-w-0 flex-1 items-center gap-1.5" style={{ color: "inherit", textDecoration: "none" }}>
                      {label}
                      <span style={{ color: "var(--text-muted)" }}>
                        <Icon name="chevron-right" size={13} />
                      </span>
                    </Link>
                  ) : (
                    label
                  )}
                  <span
                    style={{
                      fontSize: "12.5px",
                      fontWeight: 600,
                      fontVariantNumeric: "tabular-nums",
                      whiteSpace: "nowrap",
                      color: row.amountCents < 0 ? "var(--status-negative)" : "var(--text-primary)",
                    }}
                  >
                    {row.amountCents < 0 ? formatSignedMoney(row.amountCents) : formatMoney(row.amountCents)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      <div
        className="flex items-center justify-between gap-3"
        style={{
          padding: "10px 12px",
          borderRadius: 12,
          background: matches ? "var(--status-positive-soft, var(--gray-25))" : "var(--status-negative-soft)",
          color: matches ? "var(--text-primary)" : "var(--status-negative)",
        }}
      >
        <span className="flex items-center gap-2" style={{ fontSize: "12px" }}>
          <Icon name={matches ? "check-circle-2" : "alert-triangle"} size={15} />
          {lines} {lines === 1 ? "record" : "records"}, adding up to {formatMoney(total)}
          {matches ? ": the figure shown." : `, but the figure shown is ${formatMoney(request.shownCents)}.`}
        </span>
        <strong style={{ fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>{formatMoney(total)}</strong>
      </div>
    </Modal>
  );
}

/** A number on a report that opens into its records. */
export function FigureButton({
  children,
  onClick,
  style,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  style?: CSSProperties;
  /** Read out instead of the bare number. */
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}: show the records`}
      title="Show the records behind this figure"
      style={{
        border: "none",
        background: "none",
        padding: 0,
        font: "inherit",
        color: "inherit",
        cursor: "pointer",
        textAlign: "inherit",
        textDecoration: "underline dotted",
        textDecorationColor: "var(--text-muted)",
        textUnderlineOffset: 4,
        fontVariantNumeric: "tabular-nums",
        ...style,
      }}
    >
      {children}
    </button>
  );
}
