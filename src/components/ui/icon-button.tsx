"use client";

import { useState } from "react";
import type { ButtonHTMLAttributes } from "react";
import { Icon } from "./icon";

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string;
  size?: number;
  badge?: boolean;
  active?: boolean;
  label?: string;
}

export function IconButton({
  icon,
  size = 38,
  badge,
  active,
  label,
  style,
  type = "button",
  ...rest
}: IconButtonProps) {
  const [hover, setHover] = useState(false);

  return (
    <button
      type={type}
      aria-label={label ?? icon}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      {...rest}
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border-default)",
        cursor: "pointer",
        background: active
          ? "var(--surface-active)"
          : hover
            ? "var(--gray-100)"
            : "var(--gray-0)",
        color: active ? "var(--text-accent)" : "var(--text-secondary)",
        transition:
          "background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard)",
        ...style,
      }}
    >
      <Icon name={icon} size={Math.round(size * 0.47)} />
      {badge ? (
        <span
          style={{
            position: "absolute",
            top: 7,
            right: 8,
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--status-negative)",
            boxShadow: "0 0 0 2px var(--surface-card)",
          }}
        />
      ) : null}
    </button>
  );
}
