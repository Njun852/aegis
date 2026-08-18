"use client";

import type { CSSProperties } from "react";
import { Avatar } from "./avatar";
import { Icon } from "./icon";

export interface UserChipProps {
  name: string;
  plan?: string;
  src?: string;
  onMenu?: () => void;
  style?: CSSProperties;
}

export function UserChip({ name, plan, src, onMenu, style }: UserChipProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "10px",
        borderRadius: "var(--radius-md)",
        background: "var(--surface-card)",
        border: "1px solid var(--border-default)",
        ...style,
      }}
    >
      <Avatar name={name} src={src} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "var(--text-primary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {name}
        </div>
        <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{plan}</div>
      </div>
      <button
        type="button"
        onClick={onMenu}
        aria-label="Account menu"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--text-muted)",
          display: "flex",
          padding: 2,
        }}
      >
        <Icon name="more-horizontal" size={16} />
      </button>
    </div>
  );
}
