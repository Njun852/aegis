"use client";

import type { CSSProperties, ReactNode } from "react";
import { Icon } from "./icon";

export interface CardProps {
  title?: ReactNode;
  /** A string renders the standard action link; any other node is rendered as-is. */
  action?: ReactNode;
  onAction?: () => void;
  padding?: string;
  tone?: "default" | "raised";
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function Card({
  title,
  action,
  onAction,
  padding = "var(--card-padding)",
  tone = "default",
  children,
  className,
  style,
}: CardProps) {
  const background =
    tone === "raised" ? "var(--surface-raised)" : "var(--surface-card)";

  return (
    <section
      className={className}
      style={{
        background,
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-card)",
        padding,
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-4)",
        ...style,
      }}
    >
      {(title || action) && (
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-3)",
          }}
        >
          <h3
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-h3-size)",
              lineHeight: "var(--text-h3-lh)",
              fontWeight: 600,
              letterSpacing: "var(--text-h3-ls)",
              color: "var(--text-primary)",
            }}
          >
            {title}
          </h3>
          {typeof action === "string" ? (
            <button
              type="button"
              onClick={onAction}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                color: "var(--text-accent)",
                fontSize: "12px",
                fontWeight: 600,
                fontFamily: "var(--font-body)",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              {action}
              <Icon name="chevron-right" size={13} />
            </button>
          ) : (
            action
          )}
        </header>
      )}
      {children}
    </section>
  );
}
