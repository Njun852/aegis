"use client";

import { Icon } from "./icon";
import { IconButton } from "./icon-button";

export type ToastTone = "success" | "error" | "info";

const TONES: Record<
  ToastTone,
  { icon: string; bg: string; fg: string; border: string }
> = {
  success: {
    icon: "check-circle-2",
    bg: "var(--status-positive-soft)",
    fg: "var(--status-positive)",
    border: "var(--green-400)",
  },
  error: {
    icon: "circle-alert",
    bg: "var(--status-negative-soft)",
    fg: "var(--status-negative)",
    border: "var(--red-400)",
  },
  // Used for anything the AI reports back, which is why it borrows the accent
  // and the sparkles rather than a neutral grey.
  info: {
    icon: "sparkles",
    bg: "var(--accent-soft)",
    fg: "var(--accent-primary)",
    border: "var(--blue-200)",
  },
};

export interface ToastProps {
  tone: ToastTone;
  title: string;
  description?: string;
  onDismiss: () => void;
}

/**
 * One notification. Presentational only — the queue, the timers and the
 * viewport live in `src/components/layout/toast-provider.tsx`.
 */
export function Toast({ tone, title, description, onDismiss }: ToastProps) {
  const style = TONES[tone];

  return (
    <div
      // Errors interrupt; everything else waits for a pause in speech.
      role={tone === "error" ? "alert" : "status"}
      className="aegis-toast flex items-start gap-2.5"
      style={{
        width: 344,
        maxWidth: "calc(100vw - 32px)",
        padding: "12px 12px 12px 13px",
        background: "var(--surface-raised)",
        border: `1px solid ${style.border}`,
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-popover)",
        pointerEvents: "auto",
      }}
    >
      <span
        style={{
          width: 26,
          height: 26,
          flex: "0 0 auto",
          borderRadius: "8px",
          background: style.bg,
          color: style.fg,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 1,
        }}
      >
        <Icon name={style.icon} size={14} />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          style={{
            fontSize: "12.5px",
            fontWeight: 600,
            color: "var(--text-primary)",
            textWrap: "pretty",
            overflowWrap: "anywhere",
          }}
        >
          {title}
        </span>
        {description && (
          <span
            style={{
              fontSize: "11.5px",
              lineHeight: "16px",
              color: "var(--text-secondary)",
              textWrap: "pretty",
              overflowWrap: "anywhere",
            }}
          >
            {description}
          </span>
        )}
      </span>

      <IconButton
        icon="x"
        size={26}
        label="Dismiss"
        onClick={onDismiss}
        // Borderless, but keeping the component's own hover fill so the target
        // still confirms itself under the cursor.
        style={{ flex: "0 0 auto", border: "none" }}
      />
    </div>
  );
}
