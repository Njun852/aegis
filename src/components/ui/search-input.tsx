"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { Icon } from "./icon";

export interface SearchInputProps {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  width?: number | string;
  style?: CSSProperties;
}

export function SearchInput({
  placeholder = "Search for anything...",
  value,
  onChange,
  width = 260,
  style,
}: SearchInputProps) {
  const [focus, setFocus] = useState(false);

  return (
    <div style={{ position: "relative", width, ...style }}>
      <input
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          width: "100%",
          height: "var(--control-height)",
          padding: "0 34px 0 14px",
          borderRadius: "var(--radius-pill)",
          background: "var(--surface-card)",
          border: `1px solid ${focus ? "var(--border-focus)" : "var(--border-default)"}`,
          boxShadow: focus ? "var(--ring-focus)" : "none",
          color: "var(--text-primary)",
          fontFamily: "var(--font-body)",
          fontSize: "13px",
          outline: "none",
          transition:
            "border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)",
        }}
      />
      <Icon
        name="search"
        size={15}
        color="var(--text-muted)"
        style={{
          position: "absolute",
          right: 13,
          top: "50%",
          transform: "translateY(-50%)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
