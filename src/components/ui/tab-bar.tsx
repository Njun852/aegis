"use client";

import type { CSSProperties } from "react";
import { Icon } from "./icon";

export interface TabBarItem {
  id: string;
  label: string;
  icon: string;
}

export interface TabBarProps {
  items: TabBarItem[];
  value?: string;
  onChange?: (id: string) => void;
  style?: CSSProperties;
}

export function TabBar({ items = [], value, onChange, style }: TabBarProps) {
  return (
    <nav
      style={{
        display: "flex",
        alignItems: "stretch",
        justifyContent: "space-between",
        gap: "2px",
        background: "var(--surface-sidebar)",
        borderTop: "1px solid var(--border-default)",
        padding: "8px 10px 10px",
        ...style,
      }}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange?.(item.id)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "4px",
              padding: "4px 0",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: active ? "var(--text-accent)" : "var(--text-muted)",
              fontFamily: "var(--font-body)",
              fontSize: "9px",
              fontWeight: active ? 600 : 500,
            }}
          >
            <Icon name={item.icon} size={18} />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
