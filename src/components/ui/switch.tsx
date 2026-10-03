"use client";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** What the switch controls, for screen readers: "Text reminders for Juan". */
  label: string;
  disabled?: boolean;
  title?: string;
}

/**
 * An on/off switch. It shows the state something is in, which a button that
 * names the next action cannot: "on" is blue with the knob to the right.
 */
export function Switch({ checked, onChange, label, disabled = false, title }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={(event) => {
        // A switch often sits in a row that opens something when clicked.
        event.stopPropagation();
        onChange(!checked);
      }}
      style={{
        width: 34,
        height: 20,
        flex: "0 0 auto",
        borderRadius: "var(--radius-pill)",
        border: "none",
        padding: 3,
        display: "inline-flex",
        alignItems: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        transition: "background var(--dur-fast) var(--ease-standard)",
        background: checked ? "var(--accent-primary)" : "var(--border-strong)",
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: "var(--radius-circle)",
          background: "#fff",
          boxShadow: "0 1px 2px rgba(23,28,37,.25)",
          transform: checked ? "translateX(14px)" : "translateX(0)",
          transition: "transform var(--dur-fast) var(--ease-standard)",
        }}
      />
    </button>
  );
}
