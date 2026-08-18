import type { CSSProperties } from "react";

export interface ChartTooltipProps {
  label: string;
  value: string;
  style?: CSSProperties;
}

export function ChartTooltip({ label, value, style }: ChartTooltipProps) {
  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        gap: "2px",
        padding: "8px 10px",
        background: "var(--surface-raised)",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius-sm)",
        boxShadow: "var(--shadow-popover)",
        ...style,
      }}
    >
      <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{label}</span>
      <span
        style={{
          fontSize: "12px",
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color: "var(--text-primary)",
        }}
      >
        {value}
      </span>
    </div>
  );
}
