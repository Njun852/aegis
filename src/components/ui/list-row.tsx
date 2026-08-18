"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { Avatar } from "./avatar";
import { Icon } from "./icon";

export type AmountTone = "neutral" | "positive" | "negative";

const AMOUNT_TONES: Record<AmountTone, string> = {
  neutral: "var(--text-primary)",
  positive: "var(--status-positive)",
  negative: "var(--status-negative)",
};

export interface ListRowProps {
  title: string;
  meta?: string;
  amount?: string;
  amountTone?: AmountTone;
  tag?: string;
  icon?: string;
  iconColor?: string;
  avatarSrc?: string;
  /** Render an initials avatar instead of the icon tile, without a photo. */
  useAvatar?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
}

export function ListRow({
  title,
  meta,
  amount,
  amountTone = "neutral",
  tag,
  icon,
  iconColor = "var(--accent-primary)",
  avatarSrc,
  useAvatar,
  onClick,
  style,
}: ListRowProps) {
  const [hover, setHover] = useState(false);
  const showAvatar = useAvatar || avatarSrc !== undefined;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "10px",
        borderRadius: "var(--radius-md)",
        background: hover ? "var(--gray-50)" : "transparent",
        cursor: onClick ? "pointer" : "default",
        transition: "background var(--dur-fast) var(--ease-standard)",
        ...style,
      }}
    >
      {showAvatar ? (
        <Avatar src={avatarSrc} name={title} size={32} />
      ) : (
        <span
          style={{
            width: 32,
            height: 32,
            borderRadius: "var(--radius-sm)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--surface-inset)",
            color: iconColor,
          }}
        >
          <Icon name={icon ?? "circle"} size={15} />
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--text-primary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </div>
        {meta && (
          <div
            style={{
              fontSize: "11px",
              color: "var(--text-muted)",
              marginTop: "2px",
            }}
          >
            {meta}
          </div>
        )}
      </div>
      <div style={{ textAlign: "right" }}>
        {amount && (
          <div
            style={{
              fontSize: "13px",
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
              color: AMOUNT_TONES[amountTone],
            }}
          >
            {amount}
          </div>
        )}
        {tag && (
          <div
            style={{
              fontSize: "10px",
              color: "var(--text-muted)",
              marginTop: "2px",
            }}
          >
            {tag}
          </div>
        )}
      </div>
    </div>
  );
}
