import type { CSSProperties } from "react";
import { DeltaIndicator } from "./delta-indicator";
import { Icon } from "./icon";
import { Sparkline } from "./sparkline";

export type StatTone = "accent" | "positive" | "negative" | "warning" | "info";

const TONES: Record<StatTone, string> = {
  accent: "var(--accent-primary)",
  positive: "var(--status-positive)",
  negative: "var(--status-negative)",
  warning: "var(--status-warning)",
  info: "var(--status-info)",
};

export interface StatCardProps {
  label: string;
  value: string;
  icon?: string;
  tone?: StatTone;
  delta?: string;
  deltaCaption?: string;
  points?: number[];
  style?: CSSProperties;
}

export function StatCard({
  label,
  value,
  icon,
  tone = "accent",
  delta,
  deltaCaption,
  points,
  style,
}: StatCardProps) {
  const color = TONES[tone] ?? TONES.accent;

  return (
    <div
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-lg)",
        padding: "16px 16px 0",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        overflow: "hidden",
        boxShadow: "var(--shadow-card)",
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "8px",
        }}
      >
        <div
          style={{
            fontSize: "12px",
            color: "var(--text-secondary)",
            fontWeight: 500,
          }}
        >
          {label}
        </div>
        {icon && (
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: color,
              color: "#fff",
            }}
          >
            <Icon name={icon} size={14} />
          </span>
        )}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-metric-size)",
          lineHeight: "var(--text-metric-lh)",
          fontWeight: 700,
          letterSpacing: "var(--text-metric-ls)",
          fontVariantNumeric: "tabular-nums",
          color: "var(--text-primary)",
        }}
      >
        {value}
      </div>
      {delta && (
        <DeltaIndicator value={delta} caption={deltaCaption} size={11} />
      )}
      {points && (
        <Sparkline
          points={points}
          color={color}
          height={52}
          style={{ marginTop: "auto" }}
        />
      )}
    </div>
  );
}
