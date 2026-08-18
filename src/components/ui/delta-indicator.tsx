import type { CSSProperties } from "react";
import { Icon } from "./icon";

export interface DeltaIndicatorProps {
  value: string;
  direction?: "up" | "down";
  caption?: string;
  size?: number;
  style?: CSSProperties;
}

export function DeltaIndicator({
  value,
  direction,
  caption = "from last month",
  size = 12,
  style,
}: DeltaIndicatorProps) {
  const dir = direction ?? (String(value).trim().startsWith("-") ? "down" : "up");
  const positive = dir === "up";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        fontSize: size,
        fontFamily: "var(--font-body)",
        color: "var(--text-muted)",
        ...style,
      }}
    >
      <Icon
        name={positive ? "arrow-up" : "arrow-down"}
        size={size}
        color={positive ? "var(--status-positive)" : "var(--status-negative)"}
      />
      <strong
        style={{
          fontWeight: 600,
          color: positive ? "var(--status-positive)" : "var(--status-negative)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </strong>
      {caption}
    </span>
  );
}
