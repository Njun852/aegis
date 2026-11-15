/**
 * The line under a daily report: when it was written, in Manila time, and
 * that it refreshes hourly. Client-safe; only shown after someone opens the
 * report, so it never renders on the server.
 */
export function dailyReportFootnote(at: string, { liveFigures = false }: { liveFigures?: boolean } = {}): string {
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(at));
  // The Ads report's figures are filled in from the last sync each time it is
  // shown; only its wording dates from when it was written.
  return liveFigures
    ? `Figures as of the last sync · wording from ${time}, rewritten hourly while today's figures change`
    : `Updated ${time} · refreshes hourly while today's figures change`;
}

/** A report as the screens hold it. */
export interface DailyReportView {
  text: string;
  /** ISO 8601. */
  at: string;
}
