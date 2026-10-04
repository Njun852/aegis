import { descriptionKey, matchPriceItem, priceFromCost } from "@/lib/quotations";
import type { QuoteCostSource, QuoteLine } from "@/types";

/**
 * Pure rules joining quotations to costs: which recorded cost a part line
 * means, what markup a price gives over a cost, and when a line's cost has
 * fallen behind what the part costs now. The sources themselves are built on
 * the server (`src/lib/dal/quote-costing.ts`); nothing here reads a database.
 *
 * Costing applies to parts only. Labor has no supplier and no stock.
 */

/** The recorded cost a description means, or null. Exact wording first, then a cautious fuzzy match. */
export function findCostSource(description: string, sources: QuoteCostSource[]): QuoteCostSource | null {
  const key = descriptionKey(description);
  if (!key) return null;
  const exact = sources.find((source) => source.keys.includes(key));
  if (exact) return exact;
  const entries = sources.flatMap((source) =>
    source.keys.map((wording) => ({ section: "parts" as const, description: wording, source })),
  );
  return matchPriceItem(description, "parts", entries)?.source ?? null;
}

/** The markup a price gives over a cost, as the settings express it: cost 500, price 750 is 50%. */
export function markupOf(priceCents: number, costCents: number): number | null {
  if (costCents <= 0) return null;
  return Math.round(((priceCents - costCents) / costCents) * 100);
}

export interface CostCheck {
  source: QuoteCostSource;
  /** The line has no cost yet and one is on record. */
  available: boolean;
  /** The recorded cost is above the line's. What eats a margin unnoticed. */
  risen: boolean;
  /** Markup at the line's price over the cost now, when the line has a price. */
  markupNow: number | null;
  /** Markup at the line's price over the line's own cost. */
  markupWas: number | null;
}

/**
 * Compares one part line with what the part costs now. Returns null when
 * there is nothing to say: labor, no recorded cost, or the line already
 * carries the current cost (or a higher one, which errs safe).
 */
export function checkLineCost(
  line: Pick<QuoteLine, "section" | "description" | "unitPriceCents" | "costCents">,
  sources: QuoteCostSource[],
): CostCheck | null {
  if (line.section !== "parts" || !line.description.trim()) return null;
  const source = findCostSource(line.description, sources);
  if (!source) return null;

  if (line.costCents === null) {
    return {
      source,
      available: true,
      risen: false,
      markupNow: line.unitPriceCents === null ? null : markupOf(line.unitPriceCents, source.costCents),
      markupWas: null,
    };
  }
  if (source.costCents <= line.costCents) return null;
  return {
    source,
    available: false,
    risen: true,
    markupNow: line.unitPriceCents === null ? null : markupOf(line.unitPriceCents, source.costCents),
    markupWas: line.unitPriceCents === null ? null : markupOf(line.unitPriceCents, line.costCents),
  };
}

/**
 * Fills the cost of part lines that have none from the recorded costs, and a
 * price at the markup where there is no price either. Used for drafts the
 * server writes (a photo read); in the editor the same happens as a person
 * types. A price already on the line is never touched.
 */
export function applyCostSources(lines: QuoteLine[], sources: QuoteCostSource[], markupPercent: number): QuoteLine[] {
  return lines.map((line) => {
    if (line.section !== "parts" || line.costCents !== null) return line;
    const source = findCostSource(line.description, sources);
    if (!source) return line;
    return {
      ...line,
      costCents: source.costCents,
      sku: source.sku,
      costNote: source.note,
      unit: line.unit || source.unit,
      unitPriceCents: line.unitPriceCents ?? priceFromCost(source.costCents, markupPercent),
    };
  });
}
