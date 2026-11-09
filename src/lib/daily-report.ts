/**
 * The line under a daily report: when it was written, in Manila time, and
 * that it refreshes hourly. Client-safe; only shown after someone opens the
 * report, so it never renders on the server.
 */
export function dailyReportFootnote(at: string): string {
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(at));
  return `Updated ${time} · refreshes hourly while today's figures change`;
}

/** A report as the screens hold it. */
export interface DailyReportView {
  text: string;
  /** ISO 8601. */
  at: string;
}
