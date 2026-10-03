import type { CSSProperties, ReactNode } from "react";
import { Icon } from "@/components/ui";

/**
 * Inputs, labels and notices shared by the quotation screens, styled like the
 * CRM and Fleet forms so the module reads as part of the same app.
 */

export const INPUT: CSSProperties = {
  width: "100%",
  minWidth: 0,
  font: "inherit",
  fontSize: "13px",
  color: "var(--text-primary)",
  background: "var(--surface-card)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-md)",
  padding: "8px 11px",
  outline: "none",
};

/** The tighter input used inside the line tables. */
export const CELL: CSSProperties = {
  ...INPUT,
  fontSize: "12.5px",
  padding: "6px 8px",
  borderRadius: "var(--radius-sm)",
};

export const NUMBER_CELL: CSSProperties = {
  ...CELL,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};

export const SELECT: CSSProperties = {
  ...INPUT,
  background: undefined,
  backgroundColor: "var(--surface-card)",
  appearance: "none",
  paddingRight: "32px",
  cursor: "pointer",
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2378839A' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 11px center",
};

export function Field({
  label,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 ${className ?? ""}`}>
      <span style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--text-primary)" }}>
        {label}
        {required && <span style={{ color: "var(--status-negative)" }}> *</span>}
      </span>
      {children}
      {hint && <span style={{ fontSize: "11px", color: "var(--text-muted)", textWrap: "pretty" }}>{hint}</span>}
    </label>
  );
}

export function Notice({
  tone,
  children,
}: {
  tone: "error" | "warning" | "info";
  children: ReactNode;
}) {
  const palette = {
    error: { border: "#F5C6C1", bg: "#FEF3F2", fg: "#912018", icon: "#D92D20", glyph: "circle-alert" },
    warning: {
      border: "var(--amber-200, #FDE3A7)",
      bg: "var(--status-warning-soft)",
      fg: "var(--text-primary)",
      icon: "var(--status-warning)",
      glyph: "alert-triangle",
    },
    info: {
      border: "var(--blue-200)",
      bg: "var(--accent-soft)",
      fg: "var(--text-primary)",
      icon: "var(--accent-primary)",
      glyph: "circle-alert",
    },
  }[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className="flex items-start gap-2.5"
      style={{
        padding: "10px 12px",
        border: `1px solid ${palette.border}`,
        background: palette.bg,
        borderRadius: "var(--radius-md)",
        fontSize: "12px",
        color: palette.fg,
        overflowWrap: "anywhere",
        textWrap: "pretty",
      }}
    >
      <span style={{ color: palette.icon, flex: "0 0 auto", marginTop: 1 }}>
        <Icon name={palette.glyph} size={15} />
      </span>
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  );
}

export function Panel({
  title,
  icon,
  action,
  children,
  style,
}: {
  title: string;
  icon: string;
  action?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <section
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-card)",
        padding: "14px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        minWidth: 0,
        ...style,
      }}
    >
      <div className="flex items-center gap-2.5">
        <span
          style={{
            width: 26,
            height: 26,
            flex: "0 0 auto",
            borderRadius: "var(--radius-sm)",
            background: "var(--accent-soft)",
            color: "var(--accent-primary)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={icon} size={14} />
        </span>
        <h3
          style={{
            margin: 0,
            flex: 1,
            fontFamily: "var(--font-display)",
            fontSize: "14px",
            fontWeight: 700,
            letterSpacing: "-.01em",
          }}
        >
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function ColumnLabel({
  children,
  align,
  className,
}: {
  children?: ReactNode;
  align?: "right";
  className?: string;
}) {
  return (
    <span
      className={className}
      style={{
        fontSize: "var(--text-overline-size)",
        letterSpacing: ".1em",
        textTransform: "uppercase",
        color: "var(--text-muted)",
        textAlign: align,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/** The modal frame the settings and price-list editors share. */
export function Modal({
  title,
  icon,
  onClose,
  footer,
  children,
  width = 560,
}: {
  title: string;
  icon: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
  width?: number;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      <div onClick={onClose} className="absolute inset-0" style={{ background: "rgba(23,28,37,.28)" }} />
      <div
        role="dialog"
        aria-label={title}
        className="relative flex max-h-full w-full flex-col overflow-hidden"
        style={{
          maxWidth: width,
          background: "var(--surface-card)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-popover)",
        }}
      >
        <div
          className="flex flex-none items-center gap-3"
          style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-subtle)" }}
        >
          <span
            style={{
              width: 30,
              height: 30,
              flex: "0 0 auto",
              borderRadius: "var(--radius-sm)",
              background: "var(--accent-soft)",
              color: "var(--accent-primary)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name={icon} size={15} />
          </span>
          <span style={{ flex: 1, fontFamily: "var(--font-display)", fontSize: "15px", fontWeight: 700 }}>
            {title}
          </span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              background: "transparent",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              color: "var(--text-secondary)",
            }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto" style={{ padding: "16px" }}>
          {children}
        </div>
        {footer && (
          <div
            className="flex flex-none items-center justify-end gap-2.5"
            style={{ padding: "12px 16px", borderTop: "1px solid var(--border-subtle)", background: "var(--gray-25)" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
