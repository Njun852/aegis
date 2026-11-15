/**
 * The Ads daily report writes its figures as slots ({spend},
 * {c:<campaign id>.costPerResult}) and the server fills them with the figures
 * of the last sync each time it is shown, so the report's numbers always match
 * the screen beside it. Pure, so the check script can test it.
 */

/**
 * Puts today's figures into a stored report's slots. A slot no longer known
 * (a campaign gone since) reads as a dash rather than a stale number.
 */
export function fillSlots(text: string, values: Record<string, string>): string {
  return text.replace(/\{([A-Za-z]+|c:[\w-]+\.[A-Za-z]+)\}/g, (_, slot: string) => values[slot] ?? "—");
}

/**
 * A report is kept only when it wrote its amounts as slots. One that typed an
 * amount out ("₱909") would disagree with the screen within minutes, so it is
 * refused and the request counts as failed rather than shown.
 */
export function parseReport(raw: unknown): string | null {
  const report = (raw as { report?: unknown })?.report;
  if (typeof report !== "string") return null;
  const trimmed = report.trim();
  if (trimmed.length === 0) return null;
  if (/(₱|PHP|\$|USD)\s?\d/.test(trimmed.replace(/\{[^{}]*\}/g, ""))) return null;
  return trimmed;
}
