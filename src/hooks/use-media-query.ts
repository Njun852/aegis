import { useSyncExternalStore } from "react";

/**
 * Whether a CSS media query matches, kept current as the window changes.
 *
 * The server has no window, so it renders the desktop answer (false), and the
 * client corrects it straight after hydration. Anything that differs on a
 * phone must therefore look right first as desktop and then switch, rather
 * than the other way round.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
