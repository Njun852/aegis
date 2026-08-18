"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { Icon } from "./icon";

export interface SelectProps {
  options: string[];
  value?: string;
  onChange?: (value: string) => void;
  size?: "sm" | "md";
  leadingIcon?: string;
  style?: CSSProperties;
}

export function Select({
  options = [],
  value,
  onChange,
  size = "sm",
  leadingIcon,
  style,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const current = value ?? options[0];
  const height = size === "sm" ? "var(--control-height-sm)" : "var(--control-height)";

  return (
    <div style={{ position: "relative", ...style }}>
      <button
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        style={{
          height,
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          padding: "0 10px",
          borderRadius: "var(--radius-sm)",
          background: "var(--gray-0)",
          border: "1px solid var(--border-default)",
          color: "var(--text-secondary)",
          fontFamily: "var(--font-body)",
          fontSize: "12px",
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        {leadingIcon && <Icon name={leadingIcon} size={14} />}
        {current}
        <Icon
          name="chevron-down"
          size={14}
          style={{
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform var(--dur-fast) var(--ease-standard)",
          }}
        />
      </button>
      {open && (
        <ul
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 20,
            minWidth: "100%",
            listStyle: "none",
            margin: 0,
            padding: "4px",
            background: "var(--surface-raised)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius-sm)",
            boxShadow: "var(--shadow-popover)",
          }}
        >
          {options.map((option) => (
            <li key={option}>
              <button
                type="button"
                onClick={() => {
                  onChange?.(option);
                  setOpen(false);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "7px 10px",
                  borderRadius: "var(--radius-xs)",
                  background:
                    option === current ? "var(--surface-active)" : "transparent",
                  border: "none",
                  cursor: "pointer",
                  color:
                    option === current
                      ? "var(--text-accent)"
                      : "var(--text-secondary)",
                  fontFamily: "var(--font-body)",
                  fontSize: "12px",
                  whiteSpace: "nowrap",
                }}
              >
                {option}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
