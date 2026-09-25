import type { AdRange } from "@/types";

/**
 * The exact window a Meta `date_preset` covers, so anything AEGIS counts beside
 * Meta's figures — bookings, for cost per booking — covers the same days.
 *
 * Meta's `last_7d` and `last_30d` are whole days in the **ad account's** time
 * zone, ending at the start of today: today is excluded. `maximum` is the whole
 * account history, today included. Counting bookings over a different window
 * than the spend would make cost per booking quietly wrong at the edges.
 *
 * Pure and client-safe.
 */

export interface DateWindow {
  /** Inclusive. Null for no lower bound. */
  from: Date | null;
  /** Exclusive. Null for no upper bound. */
  to: Date | null;
}

const DAYS: Record<Exclude<AdRange, "maximum">, number> = {
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

export function windowForRange(range: AdRange, timeZone: string, now = new Date()): DateWindow {
  if (range === "maximum") return { from: null, to: null };
  const today = startOfDayIn(now, timeZone);
  const from = new Date(today.getTime() - DAYS[range] * 24 * 60 * 60 * 1000);
  return { from, to: today };
}
