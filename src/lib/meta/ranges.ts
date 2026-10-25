import type { AdDayRange, AdDayReports, AdRange } from "@/types";

/**
 * The exact window a Meta `date_preset` covers, so anything AEGIS counts beside
 * Meta's figures — bookings, for cost per booking — covers the same days.
 *
 * Meta's `last_7d` and `last_30d` are whole days in the **ad account's** time
 * zone, ending at the start of today: today is excluded. `today` and
 * `yesterday` are single days in that same time zone, today running up to now.
 * `maximum` is the whole account history, today included. Counting bookings
 * over a different window than the spend would make cost per booking quietly
 * wrong at the edges.
 *
 * Pure and client-safe.
 */

export interface DateWindow {
  /** Inclusive. Null for no lower bound. */
  from: Date | null;
  /** Exclusive. Null for no upper bound. */
  to: Date | null;
}

const DAYS: Record<Exclude<AdRange, "maximum" | AdDayRange>, number> = {
  last_7d: 7,
  last_30d: 30,
};

function zonedParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

/** Midnight at the start of `instant`'s calendar day, in `timeZone`. */
export function startOfDayIn(instant: Date, timeZone: string): Date {
  let zone = timeZone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    zone = "UTC";
  }

  const { year, month, day } = zonedParts(instant, zone);
  const guess = Date.UTC(year, month - 1, day);
  // How far the zone's wall clock is from UTC at that moment.
  const at = zonedParts(new Date(guess), zone);
  const offset = Date.UTC(at.year, at.month - 1, at.day, at.hour, at.minute, at.second) - guess;
  return new Date(guess - offset);
}

const HOUR = 60 * 60 * 1000;

export function isDayRange(range: AdRange): range is AdDayRange {
  return range === "today" || range === "yesterday";
}

export function windowForRange(range: AdRange, timeZone: string, now = new Date()): DateWindow {
  if (range === "maximum") return { from: null, to: null };
  const today = startOfDayIn(now, timeZone);
  // Single days step from one midnight to the next by way of midday, so a day
  // that is 23 or 25 hours long (daylight saving elsewhere) still lands on it.
  if (range === "today") return { from: today, to: startOfDayIn(new Date(today.getTime() + 36 * HOUR), timeZone) };
  if (range === "yesterday") return { from: startOfDayIn(new Date(today.getTime() - 12 * HOUR), timeZone), to: today };
  const from = new Date(today.getTime() - DAYS[range] * 24 * HOUR);
  return { from, to: today };
}

/** "2026-10-19": `instant`'s calendar day in `timeZone`. */
export function dateKeyIn(instant: Date, timeZone: string): string {
  let zone = timeZone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    zone = "UTC";
  }
  const { year, month, day } = zonedParts(instant, zone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "Oct 19, 2026", from a date key. The key is already a local day, so no zone applies. */
function dayName(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export interface DayFigures {
  /** The calendar day the range means now, e.g. "2026-10-19". */
  date: string;
  /** The same day for people: "Oct 19, 2026". */
  label: string;
  /** Whether the last sync read this day at all. False means its figures are another day's. */
  read: boolean;
  /**
   * Why there are no figures for the day, in plain words, or null when the
   * stored figures are that day's. Never shown as zero instead.
   */
  missing: string | null;
  /** A caveat that holds even when the figures are there. */
  note: string | null;
}

/**
 * Whether the stored Today or Yesterday figures are for the day the range
 * means right now. A sync made yesterday holds yesterday's "today", which
 * must not be shown as today's; and a day Meta returned nothing for is said
 * to be unreported, not shown as a day of zero spend.
 */
export function dayFigures(
  range: AdDayRange,
  days: AdDayReports | null | undefined,
  timeZone: string,
  now = new Date(),
): DayFigures {
  const date = dateKeyIn(windowForRange(range, timeZone, now).from!, timeZone);
  const which = `${range} (${dayName(date)})`;
  const report = days?.[range];

  const label = dayName(date);
  if (!report || report.date !== date) {
    return {
      date,
      label,
      read: false,
      missing: `AEGIS has not read ${which} from Meta yet. Press Sync now to read it.`,
      note: null,
    };
  }
  if (report.rows === 0) {
    return {
      date,
      label,
      read: true,
      missing:
        range === "today"
          ? `Meta has not reported anything for ${which} yet: either nothing has run so far, or Meta has not caught up. Sync again later.`
          : `Meta reported nothing for ${which}: either nothing ran that day, or Meta has not reported it yet.`,
      note: null,
    };
  }
  return {
    date,
    label,
    read: true,
    missing: null,
    note:
      range === "today"
        ? "Today so far. Meta keeps adding to today's figures; these are as of the last sync."
        : "Meta can still adjust yesterday's figures slightly as late results come in.",
  };
}
