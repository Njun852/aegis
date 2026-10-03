import type {
  QuoteLine,
  QuoteLineOrigin,
  QuotePriceItem,
  QuoteSection,
  QuoteStatus,
  QuoteTotals,
  QuotationConfig,
  QuotationSettings,
  QuotationSummary,
} from "@/types";

/**
 * Pure quotation rules: line amounts, totals, markup, the price-list match.
 * Nothing here touches the database, so the editor, the PDF and the check
 * script all compute a total the same way.
 */

export const QUOTE_STATUSES: QuoteStatus[] = ["Draft", "Sent"];

export const QUOTE_SECTIONS: { key: QuoteSection; label: string; noun: string }[] = [
  { key: "parts", label: "Parts", noun: "part" },
  { key: "labor", label: "Labor", noun: "labor line" },
];

export const MAX_LINES = 60;
export const MAX_QTY = 9999;
/** One peso short of ten million: far above any job, low enough to catch a slipped key. */
export const MAX_AMOUNT_CENTS = 999_999_900;

export const DEFAULT_QUOTATION_SETTINGS: QuotationSettings = {
  address: "",
  contact: "",
  notes: "",
  footer: "Thank you for your business!",
  markupPercent: 50,
  logo: null,
};

/** The stored config with every gap filled, so screens never branch on absence. */
export function quoteSettingsOf(config: QuotationConfig | undefined): QuotationSettings {
  return {
    address: config?.address ?? DEFAULT_QUOTATION_SETTINGS.address,
    contact: config?.contact ?? DEFAULT_QUOTATION_SETTINGS.contact,
    notes: config?.notes ?? DEFAULT_QUOTATION_SETTINGS.notes,
    footer: config?.footer ?? DEFAULT_QUOTATION_SETTINGS.footer,
    markupPercent: config?.markupPercent ?? DEFAULT_QUOTATION_SETTINGS.markupPercent,
    logo: config?.logo ?? null,
  };
}

/** Quantity × unit price, rounded to the centavo. Zero while the line is unpriced. */
export function lineAmountCents(line: Pick<QuoteLine, "qty" | "unitPriceCents">): number {
  if (line.unitPriceCents === null) return 0;
  return Math.round(line.qty * line.unitPriceCents);
}

/** A row nobody has typed into. The editor keeps a few of these and the save drops them. */
export function isBlankLine(line: QuoteLine): boolean {
  return (
    line.description.trim() === "" &&
    line.po.trim() === "" &&
    line.unitPriceCents === null &&
    line.costCents === null
  );
}

export function quoteTotals(lines: QuoteLine[], discountCents: number): QuoteTotals {
  let partsCents = 0;
  let laborCents = 0;
  let unpricedCount = 0;
  let costCents = 0;
  let marginCents = 0;
  let costedLines = 0;
  let pricedLines = 0;

  for (const line of lines) {
    if (isBlankLine(line)) continue;
    if (line.unitPriceCents === null) {
      unpricedCount += 1;
      continue;
    }
    const amount = lineAmountCents(line);
    pricedLines += 1;
    if (line.section === "parts") partsCents += amount;
    else laborCents += amount;

    if (line.costCents !== null) {
      const cost = Math.round(line.qty * line.costCents);
      costCents += cost;
      marginCents += amount - cost;
      costedLines += 1;
    }
  }

  const subtotalCents = partsCents + laborCents;
  // A discount larger than the bill would print a negative total; it is held
  // at the subtotal instead, and the editor refuses to save one anyway.
  const discount = Math.min(Math.max(discountCents, 0), subtotalCents);
  return {
    partsCents,
    laborCents,
    subtotalCents,
    discountCents: discount,
    totalCents: subtotalCents - discount,
    unpricedCount,
    costCents,
    marginCents: marginCents - discount,
    costedLines,
    pricedLines,
  };
}

/**
 * The price offered for a cost at the business's markup, rounded to the whole
 * peso: 1,500.00 at 50% is 2,250.00. Only ever a suggestion the person can
 * overwrite.
 */
export function priceFromCost(costCents: number, markupPercent: number): number {
  return Math.round((costCents * (1 + markupPercent / 100)) / 100) * 100;
}

/** "2,250.00", as the printed form shows money: no currency sign. */
export function formatAmount(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** "₱ 75,600.00", for the screens. The printed form uses `formatAmount`. */
export function formatPeso(cents: number): string {
  return `₱ ${formatAmount(cents)}`;
}

/**
 * An amount as typed ("2250", "2,250.00", "₱2,250", "PHP 2250") to centavos.
 * `null` when it is empty, `undefined` when it cannot be read, so callers can
 * tell "not priced yet" from "typo".
 */
export function parseAmount(input: string): number | null | undefined {
  const cleaned = input.replace(/php|[₱$,\s]/gi, "");
  if (!cleaned) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return undefined;
  return Math.round(Number(cleaned) * 100);
}

/** A quantity as typed. Two decimals at most, for litres and metres. */
export function parseQty(input: string): number | undefined {
  const cleaned = input.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return undefined;
  const qty = Number(cleaned);
  return qty > 0 && qty <= MAX_QTY ? qty : undefined;
}

/** For an input's value: "2250.00" without separators, empty for null. */
export function amountInput(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

/**
 * What a price-list match is made on: "Remove/Install Injectors" and
 * "remove - install injectors" are one line.
 */
export function descriptionKey(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const STOP_WORDS = new Set(["and", "the", "of", "for", "with", "a", "an", "to"]);

function words(key: string): Set<string> {
  return new Set(key.split(" ").filter((word) => word.length > 1 && !STOP_WORDS.has(word)));
}

/**
 * The remembered line a description most likely means, or null. An exact key
 * wins; otherwise the words must mostly agree, so "turbo clean" finds "Turbo
 * cleaning" through the shared stem but "turbo replacement" does not.
 *
 * Used where nobody picked from the list (a line read off a photo), so it errs
 * towards no match: a missing price is visible, a wrong one is not.
 */
export function matchPriceItem<T extends Pick<QuotePriceItem, "section" | "description">>(
  description: string,
  section: QuoteSection,
  items: T[],
): T | null {
  const key = descriptionKey(description);
  if (!key) return null;

  const candidates = items.filter((item) => item.section === section);
  const exact = candidates.find((item) => descriptionKey(item.description) === key);
  if (exact) return exact;

  const target = words(key);
  if (target.size === 0) return null;

  let best: T | null = null;
  let bestScore = 0;
  for (const item of candidates) {
    const other = words(descriptionKey(item.description));
    if (other.size === 0) continue;
    let shared = 0;
    for (const word of target) {
      if (other.has(word) || [...other].some((o) => stemMatch(word, o))) shared += 1;
    }
    const score = shared / Math.max(target.size, other.size);
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return bestScore >= 0.75 ? best : null;
}

/** "clean" and "cleaning", "injector" and "injectors". Four letters at least, so "oil" is not "oiled". */
function stemMatch(a: string, b: string): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 4 && long.startsWith(short) && long.length - short.length <= 3;
}

let lineCounter = 0;

/** A key for a new editor row. Unique within a session, which is all a row key needs. */
export function newLineId(): string {
  lineCounter += 1;
  return `ln-${Date.now().toString(36)}-${lineCounter}`;
}

export function emptyLine(section: QuoteSection, origin: QuoteLineOrigin = "typed"): QuoteLine {
  return {
    id: newLineId(),
    section,
    po: "",
    description: "",
    qty: 1,
    unit: "",
    unitPriceCents: null,
    costCents: null,
    origin,
  };
}

/** "2026-09-14" for a date in Asia/Manila, where the shop is. */
export function manilaDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** "2026-09-14" to "Sep 14, 2026", read as a calendar day so no timezone can shift it. */
export function formatQuoteDay(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function filterQuotations(
  quotes: QuotationSummary[],
  options: { status: QuoteStatus | "All"; search: string },
): QuotationSummary[] {
  const term = options.search.trim().toLowerCase();
  const plateTerm = term.replace(/[^a-z0-9]/g, "");
  return quotes.filter((quote) => {
    if (options.status !== "All" && quote.status !== options.status) return false;
    if (!term) return true;
    return (
      quote.ref.toLowerCase().includes(term) ||
      quote.customer.toLowerCase().includes(term) ||
      quote.company.toLowerCase().includes(term) ||
      quote.makeModel.toLowerCase().includes(term) ||
      (plateTerm !== "" && quote.plate.toLowerCase().replace(/[^a-z0-9]/g, "").includes(plateTerm))
    );
  });
}

/**
 * The email that carries the PDF, prefilled for a person to read and change
 * before sending. Plain text, like every message AEGIS sends.
 */
export function defaultQuoteEmail(
  quote: {
    ref: string;
    billTo: { name: string; company: string };
    vehicle: { plate: string; makeModel: string };
    totals: { totalCents: number };
  },
  businessName: string,
  contact: string,
): { subject: string; body: string } {
  const who = quote.billTo.name.trim() || quote.billTo.company.trim();
  const car = [quote.vehicle.makeModel.trim(), quote.vehicle.plate.trim() && `(${quote.vehicle.plate.trim()})`]
    .filter(Boolean)
    .join(" ");
  const body = [
    who ? `Good day ${who},` : "Good day,",
    "",
    `Please find attached our quotation ${quote.ref}${car ? ` for your ${car}` : ""}, with a total of PHP ${formatAmount(quote.totals.totalCents)}.`,
    "",
    "Let us know if you have any questions or would like to go ahead.",
    "",
    "Thank you,",
    businessName,
    ...(contact.trim() ? [contact.trim()] : []),
  ].join("\n");
  return { subject: `Quotation ${quote.ref} from ${businessName}`, body };
}
