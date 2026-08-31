/**
 * Display formatting shared by more than one module. These are pure and
 * timezone-agnostic apart from the caller's `Date`, so server code can format
 * once and hand the strings to the client rather than have both sides derive
 * them and disagree.
 */

/** "$ 1,150.00" — the design puts a space after the currency symbol. */
export function formatMoney(cents: number, withCents = true) {
  const amount = (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: withCents ? 2 : 0,
    maximumFractionDigits: withCents ? 2 : 0,
  });
  return `$ ${amount}`;
}

/** "Aug 28" */
export function formatDay(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

/** "Aug 28 · 16:40" — the stamp on a stock level and a stock movement. */
export function formatStamp(date: Date) {
  const at = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${formatDay(date)} · ${at}`;
}

/**
 * Dollars as typed ("240", "240.00", "1,150.50") to integer cents. Returns
 * `null` when the text is not a plain amount, so callers can tell "zero" from
 * "unreadable"; an empty string is zero.
 */
export function parseCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!cleaned) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/**
 * Caps how much text is sent to a language model. Input tokens are the bulk of
 * the bill on a triage workload, and the tail of a long email rarely changes
 * the summary — so callers clip before sending rather than trusting the source
 * to be short.
 */
export function clip(text: string, maxChars: number): string {
  const trimmed = text.trim();
  return trimmed.length <= maxChars ? trimmed : `${trimmed.slice(0, maxChars)}…`;
}
