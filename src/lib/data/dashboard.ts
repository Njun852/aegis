import type { DateRange } from "@/types";

/** The dashboard's date ranges, in the picker's order. Every figure is real; there are no samples here any more. */
export const DATE_RANGES: DateRange[] = [
  "This month",
  "Last month",
  "This quarter",
];

export const DEFAULT_DATE_RANGE: DateRange = DATE_RANGES[0];
