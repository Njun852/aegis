"use client";

import type { CSSProperties } from "react";
import { Button } from "./button";
import { Icon } from "./icon";

export interface PromoCardProps {
  title: string;
  body?: string;
  action?: string;
  onAction?: () => void;
  layout?: "stack" | "banner";
  icon?: string;
  style?: CSSProperties;
}

export function PromoCard({
  title,
  body,
  action = "Upgrade Now",
  onAction,
  layout = "stack",
  icon = "gem",
  style,
}: PromoCardProps) {
  const banner = layout === "banner";

  return (
    <div
      style={{
        background: "var(--grad-upsell)",
        border: "1px solid var(--blue-200)",
        borderRadius: "var(--radius-lg)",
        padding: banner ? "16px 20px" : "16px",
        display: "flex",
        flexDirection: banner ? "row" : "column",
        alignItems: banner ? "center" : "flex-start",
        gap: banner ? "16px" : "12px",
        ...style,
      }}
    >
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: "var(--radius-sm)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--blue-500)",
          color: "#fff",
          flex: "0 0 auto",
        }}
      >
        <Icon name={icon} size={17} />
      </span>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "14px",
            fontWeight: 700,
            color: "var(--text-primary)",
          }}
        >
          {title}
        </div>
        {body && (
          <div
            style={{
              fontSize: "11px",
              lineHeight: "16px",
              color: "var(--text-secondary)",
              marginTop: "4px",
              textWrap: "pretty",
            }}
          >
            {body}
          </div>
        )}
      </div>
      <Button
        variant="primary"
        size={banner ? "md" : "sm"}
        fullWidth={!banner}
        onClick={onAction}
      >
        {action}
      </Button>
    </div>
  );
}
