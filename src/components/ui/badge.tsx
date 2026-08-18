import type { CSSProperties, ReactNode } from "react";
import { Icon } from "./icon";

export type BadgeTone =
  | "neutral"
  | "accent"
  | "positive"
  | "negative"
  | "warning"
  | "info";

const TONES: Record<BadgeTone, { bg: string; fg: string }> = {
  neutral: { bg: "var(--surface-inset)", fg: "var(--text-secondary)" },
  accent: { bg: "var(--accent-soft)", fg: "var(--text-accent)" },
  positive: { bg: "var(--status-positive-soft)", fg: "var(--status-positive)" },
  negative: { bg: "var(--status-negative-soft)", fg: "var(--status-negative)" },
  warning: { bg: "var(--status-warning-soft)", fg: "var(--status-warning)" },
  info: { bg: "var(--status-info-soft)", fg: "var(--status-info)" },
};

export interface BadgeProps {
  tone?: BadgeTone;
  icon?: string;
  pill?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
}

export function Badge({
  tone = "neutral",
  icon,
  pill = true,
  children,
  style,
}: BadgeProps) {
  const t = TONES[tone] ?? TONES.neutral;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        background: t.bg,
        color: t.fg,
        padding: "3px 9px",
        borderRadius: pill ? "var(--radius-pill)" : "var(--radius-xs)",
        fontSize: "var(--text-caption-size)",
        lineHeight: "var(--text-caption-lh)",
        fontWeight: 600,
        fontFamily: "var(--font-body)",
        ...style,
      }}
    >
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}
