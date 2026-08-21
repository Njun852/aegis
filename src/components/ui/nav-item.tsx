"use client";

import Link from "next/link";
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Icon } from "./icon";

export interface NavItemProps {
  icon: string;
  label: string;
  active?: boolean;
  badge?: ReactNode;
  /** Renders the item as a Link. Without it the item is a button. */
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  style?: CSSProperties;
}

export function NavItem({
  icon,
  label,
  active,
  badge,
  href,
  onClick,
  disabled,
  style,
}: NavItemProps) {
  const [hover, setHover] = useState(false);

  const rootStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    width: "100%",
    height: "40px",
    padding: "0 12px",
    borderRadius: "var(--radius-sm)",
    border: "none",
    cursor: disabled ? "default" : "pointer",
    textAlign: "left",
    background: active
      ? "var(--accent-primary)"
      : hover && !disabled
        ? "var(--gray-100)"
        : "transparent",
    color: active ? "#fff" : "var(--text-secondary)",
    fontFamily: "var(--font-body)",
    fontSize: "13px",
    fontWeight: active ? 600 : 500,
    transition:
      "background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard)",
    ...style,
  };

  const content = (
    <>
      <Icon name={icon} size={18} />
      <span style={{ flex: 1 }}>{label}</span>
      {badge ? (
        <span
          style={{
            fontSize: "10px",
            fontWeight: 700,
            padding: "2px 6px",
            borderRadius: "var(--radius-pill)",
            background: active ? "rgba(255,255,255,.2)" : "var(--accent-soft)",
            color: active ? "#fff" : "var(--text-accent)",
          }}
        >
          {badge}
        </span>
      ) : null}
    </>
  );

  const handlers = {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
  };

  if (href && !disabled) {
    return (
      <Link
        href={href}
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        style={rootStyle}
        {...handlers}
      >
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled} style={rootStyle} {...handlers}>
      {content}
    </button>
  );
}
