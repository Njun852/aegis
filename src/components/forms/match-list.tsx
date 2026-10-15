"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { Icon } from "@/components/ui";

/**
 * Records on file that match what is being typed, hung under the field, as on
 * the New Booking form. Picking one is a mousedown, so it lands before the
 * field's blur closes the list.
 */
export interface MatchOption {
  key: string;
  icon: string;
  title: string;
  detail?: string;
  tag?: string;
}

export function MatchList({
  id,
  label,
  options,
  active,
  onHover,
  onPick,
}: {
  id: string;
  label: string;
  options: MatchOption[];
  active: number;
  onHover: (index: number) => void;
  onPick: (index: number) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div
      id={id}
      role="listbox"
      aria-label={label}
      style={{
        position: "absolute",
        top: "calc(100% + 4px)",
        left: 0,
        right: 0,
        zIndex: 5,
        padding: 4,
        background: "var(--surface-card)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-popover)",
      }}
    >
      {options.map((option, index) => (
        <div
          key={option.key}
          role="option"
          aria-selected={index === active}
          onMouseDown={(event) => {
            event.preventDefault();
            onPick(index);
          }}
          onMouseEnter={() => onHover(index)}
          className="flex items-center gap-2.5"
          style={{
            padding: "7px 9px",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
            background: index === active ? "var(--surface-hover)" : "transparent",
          }}
        >
          <span style={{ color: "var(--text-muted)", flex: "0 0 auto" }}>
            <Icon name={option.icon} size={14} />
          </span>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: "12.5px",
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {option.title}
            {option.detail && <span style={{ fontWeight: 400, color: "var(--text-muted)" }}> · {option.detail}</span>}
          </span>
          {option.tag && (
            <span style={{ flex: "0 0 auto", fontFamily: "var(--font-mono)", fontSize: "10.5px", color: "var(--text-muted)" }}>
              {option.tag}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Arrow keys move through the matches, Enter picks, Escape closes. Returns a
 * key handler for the field; Enter is only taken while a match is highlighted,
 * so it never swallows a normal keystroke.
 */
export function matchKeys(options: {
  count: number;
  active: number;
  setActive: (index: number) => void;
  onPick: (index: number) => void;
  onClose: () => void;
}) {
  return (event: KeyboardEvent<HTMLInputElement>) => {
    if (options.count === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      options.setActive((options.active + 1) % options.count);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      options.setActive(options.active <= 0 ? options.count - 1 : options.active - 1);
    } else if (event.key === "Enter" && options.active >= 0) {
      event.preventDefault();
      options.onPick(options.active);
    } else if (event.key === "Escape") {
      options.onClose();
    }
  };
}

/** The "Linked to … · Unlink" line under a group of fields filled from a record. */
export function LinkedNote({ children, onUnlink }: { children: ReactNode; onUnlink: () => void }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5" style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
      <Icon name="check" size={12} />
      {children}
      <button
        type="button"
        onClick={onUnlink}
        style={{
          border: "none",
          background: "none",
          padding: 0,
          cursor: "pointer",
          fontFamily: "var(--font-body)",
          fontSize: "11.5px",
          color: "var(--text-accent)",
        }}
      >
        Unlink
      </button>
    </span>
  );
}
