import type { KeyboardEvent } from "react";

/**
 * Table rows here are grid containers, not buttons, so they need the keyboard
 * behaviour a button would have given them for free. Pair with
 * `role="button"` and `tabIndex={0}` on the row.
 */
export function activateOnKey(action: () => void) {
  return (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    action();
  };
}
