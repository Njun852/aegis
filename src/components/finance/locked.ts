import type { CSSProperties } from "react";

/**
 * A field that is shown but can no longer change (an amount already paid
 * against, an opening balance money has moved from). Without this a disabled
 * input looks exactly like an editable one.
 */
export function locked(base: CSSProperties, isLocked: boolean): CSSProperties {
  return isLocked ? { ...base, background: "var(--surface-inset)", color: "var(--text-muted)", cursor: "not-allowed" } : base;
}
