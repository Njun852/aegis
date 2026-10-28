"use client";

import { useState } from "react";

/**
 * The owner board's charts. Plain SVG and HTML on the app's tokens: thin marks,
 * values written beside every bar (three of the series hues sit under 3:1 on
 * the white surface, so the number, not the colour, carries the reading), and
 * a tooltip on hover.
 */

/**
 * One hue per business, in a fixed order validated for colour-blind readers
 * (blue, orange, aqua first). Taken by the business's place in id order,
 * never by its rank on the board, so a business keeps its colour.
 */
export const BUSINESS_HUES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];

export interface StackSeries {
  id: string;
  name: string;
  color: string;
  values: number[];
}

/** Counts per day, one stacked column a day, one segment per business. */
export function StackedColumns({
  labels,
  series,
  height = 170,
  onPick,
}: {
  /** One per column: "Oct 12". */
  labels: string[];
  series: StackSeries[];
  height?: number;
  /** A segment was clicked: which series and which column. */
  onPick?: (seriesId: string, index: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = labels.map((_, index) => series.reduce((sum, entry) => sum + (entry.values[index] ?? 0), 0));
  const max = Math.max(1, ...totals);
  const top = Math.max(2, Math.ceil(max / 2) * 2);
  const plotHeight = height - 22;
  const ticks = [0, top / 2, top];

  return (
    <div style={{ position: "relative" }} onMouseLeave={() => setHover(null)}>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ display: "flex", flexDirection: "column-reverse", justifyContent: "space-between", height: plotHeight, fontSize: "10px", color: "var(--text-muted)", textAlign: "right", minWidth: 14 }}>
          {ticks.map((tick) => (
            <span key={tick} style={{ lineHeight: 1 }}>
              {tick}
            </span>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ position: "relative", height: plotHeight, display: "flex", alignItems: "flex-end", gap: 4 }}>
            {ticks.map((tick) => (
              <span key={tick} aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: `${(tick / top) * 100}%`, borderTop: "1px solid var(--gray-50)" }} />
            ))}
            {labels.map((label, index) => (
              <div
                key={label}
                onMouseEnter={() => setHover(index)}
                style={{ position: "relative", flex: 1, height: "100%", display: "flex", flexDirection: "column-reverse", alignItems: "stretch", gap: 2, cursor: onPick ? "pointer" : "default" }}
              >
                {series.map((entry) => {
                  const value = entry.values[index] ?? 0;
                  if (value === 0) return null;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      aria-label={`${entry.name}, ${label}: ${value}`}
                      onClick={() => onPick?.(entry.id, index)}
                      style={{
                        border: "none",
                        padding: 0,
                        height: `calc(${(value / top) * 100}% - 2px)`,
                        background: entry.color,
                        borderRadius: 3,
                        opacity: hover === null || hover === index ? 1 : 0.45,
                        cursor: "inherit",
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
            {labels.map((label, index) => (
              <span key={label} style={{ flex: 1, textAlign: "center", fontSize: "9.5px", color: hover === index ? "var(--text-primary)" : "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden" }}>
                {index % 2 === labels.length % 2 || index === labels.length - 1 ? label : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
      {hover !== null && (
        <div
          role="status"
          style={{
            position: "absolute",
            top: 0,
            left: `clamp(0px, calc(${((hover + 0.5) / labels.length) * 100}% - 70px), calc(100% - 150px))`,
            minWidth: 140,
            padding: "7px 9px",
            borderRadius: 8,
            background: "var(--surface-card)",
            border: "1px solid var(--border-default)",
            boxShadow: "var(--shadow-popover)",
            fontSize: "11.5px",
            pointerEvents: "none",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 3 }}>
            {labels[hover]} · {totals[hover]} {totals[hover] === 1 ? "booking" : "bookings"}
          </div>
          {series.map((entry) => (
            <div key={entry.id} className="flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: entry.color }} />
              <span style={{ flex: 1 }}>{entry.name}</span>
              <strong style={{ color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{entry.values[hover] ?? 0}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export interface BarRow {
  id: string;
  label: string;
  /** A second line under the label: the business a campaign belongs to. */
  sub?: string;
  value: number;
  display: string;
  color: string;
}

/**
 * Horizontal bars, one per row, longest first as given, the value written at
 * the end of each. A negative value draws left of the zero line.
 */
export function BarList({ rows, onPick, empty }: { rows: BarRow[]; onPick?: (row: BarRow) => void; empty: string }) {
  if (rows.length === 0 || rows.every((row) => row.value === 0)) {
    return <div style={{ fontSize: "12px", color: "var(--text-muted)", padding: "6px 0" }}>{empty}</div>;
  }
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.value)));
  const hasNegative = rows.some((row) => row.value < 0);
  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      {rows.map((row) => {
        const share = Math.abs(row.value) / max;
        return (
          <button
            key={row.id}
            type="button"
            title={`${row.label}${row.sub ? ` · ${row.sub}` : ""}: ${row.display}`}
            onClick={() => onPick?.(row)}
            className="flex flex-col"
            style={{ border: "none", background: "none", padding: 0, font: "inherit", textAlign: "left", cursor: onPick ? "pointer" : "default", gap: 3 }}
          >
            <span className="flex items-baseline gap-2" style={{ fontSize: "12px" }}>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-primary)" }}>
                {row.label}
                {row.sub && <span style={{ color: "var(--text-muted)" }}> · {row.sub}</span>}
              </span>
              <strong style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-primary)" }}>{row.display}</strong>
            </span>
            <span style={{ position: "relative", height: 8, borderRadius: 4, background: "var(--surface-inset)" }}>
              <span
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: hasNegative ? (row.value < 0 ? `${50 - share * 50}%` : "50%") : 0,
                  width: `${Math.max(row.value === 0 ? 0 : 2, share * (hasNegative ? 50 : 100))}%`,
                  background: row.color,
                  borderRadius: 4,
                }}
              />
              {hasNegative && <span aria-hidden style={{ position: "absolute", left: "50%", top: -2, bottom: -2, borderLeft: "1px solid var(--text-muted)" }} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
