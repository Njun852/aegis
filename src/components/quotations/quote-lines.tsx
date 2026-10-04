"use client";

import type { CSSProperties } from "react";
import { Button, Icon } from "@/components/ui";
import {
  amountInput,
  descriptionKey,
  emptyLine,
  formatAmount,
  lineAmountCents,
  parseAmount,
  parseQty,
  priceFromCost,
} from "@/lib/quotations";
import { CELL, ColumnLabel, NUMBER_CELL, Panel } from "@/components/forms/form-kit";
import { checkLineCost, findCostSource, type CostCheck } from "@/lib/quote-costing";
import type { QuoteCostSource, QuoteLine, QuoteLineOrigin, QuotePriceItem, QuoteSection } from "@/types";

/** A line as the editor holds it: the numbers kept as typed until the save reads them. */
export interface EditorLine extends QuoteLine {
  qtyText: string;
  priceText: string;
  costText: string;
}

const GRID =
  "grid items-start gap-2 grid-cols-[64px_minmax(180px,1fr)_60px_64px_100px_100px_96px_28px]";

const ORIGIN_NOTE: Partial<Record<QuoteLineOrigin, { text: string; color: string }>> = {
  "price-list": { text: "Price from the price list", color: "var(--text-muted)" },
  photo: { text: "Read from the photo. Check it", color: "var(--status-info)" },
  suggested: { text: "AI suggestion. Check the work and price", color: "var(--status-warning)" },
};

export interface QuoteLinesProps {
  section: QuoteSection;
  title: string;
  noun: string;
  lines: EditorLine[];
  priceItems: QuotePriceItem[];
  /** What parts cost now. Empty for labor. */
  costSources: QuoteCostSource[];
  markupPercent: number;
  onChange: (lines: EditorLine[]) => void;
}

export function QuoteLines({
  section,
  title,
  noun,
  lines,
  priceItems,
  costSources,
  markupPercent,
  onChange,
}: QuoteLinesProps) {
  const listId = `quote-price-list-${section}`;
  const known = priceItems.filter((item) => item.section === section);
  // Parts on record in Inventory or Suppliers but never quoted yet are offered too.
  const knownKeys = new Set(known.map((item) => descriptionKey(item.description)));
  const costed = costSources.filter((source) => !knownKeys.has(descriptionKey(source.label)));

  const patch = (id: string, change: Partial<EditorLine>) =>
    onChange(lines.map((line) => (line.id === id ? { ...line, ...change } : line)));

  const setDescription = (line: EditorLine, description: string) => {
    const change: Partial<EditorLine> = { description };
    // Choosing a remembered line fills what is still empty. Anything already
    // typed is the person's and stays.
    const match = known.find((item) => descriptionKey(item.description) === descriptionKey(description));
    if (match && line.priceText.trim() === "") {
      change.priceText = amountInput(match.unitPriceCents);
      change.origin = "price-list";
      if (line.unit.trim() === "") change.unit = match.unit;
      if (line.costText.trim() === "" && match.costCents !== null) {
        change.costText = amountInput(match.costCents);
      }
    }
    // The cost comes from what the part costs now when it is on record:
    // stock on hand, else the supplier. It replaces a remembered cost, which
    // may be months old, but never one the person typed by hand.
    const source = findCostSource(description, costSources);
    const typedByHand = line.costText.trim() !== "" && !line.costNote;
    if (source && !typedByHand) {
      change.costText = amountInput(source.costCents);
      change.costNote = source.note;
      change.sku = source.sku;
      if ((change.unit ?? line.unit).trim() === "") change.unit = source.unit;
      if ((change.priceText ?? line.priceText).trim() === "") {
        change.priceText = amountInput(priceFromCost(source.costCents, markupPercent));
        change.origin = "typed";
      }
    } else if (!source && line.costNote && change.costText === undefined) {
      // The wording no longer names the part the cost was filled from.
      change.costText = "";
      change.costNote = "";
      change.sku = null;
    }
    patch(line.id, change);
  };

  /** Takes the cost on record, and with `reprice` the price at the markup over it. */
  const takeCurrentCost = (line: EditorLine, source: QuoteCostSource, reprice: boolean) =>
    patch(line.id, {
      costText: amountInput(source.costCents),
      costNote: source.note,
      sku: source.sku,
      ...(reprice
        ? { priceText: amountInput(priceFromCost(source.costCents, markupPercent)), origin: "typed" as const }
        : {}),
    });

  /** A cost typed with no price offers the price at the business's markup. */
  const offerPrice = (line: EditorLine) => {
    const cost = parseAmount(line.costText);
    if (typeof cost !== "number" || line.priceText.trim() !== "") return;
    patch(line.id, { priceText: amountInput(priceFromCost(cost, markupPercent)), origin: "typed" });
  };

  const add = () => {
    const line = emptyLine(section);
    onChange([...lines, { ...line, qtyText: "1", priceText: "", costText: "" }]);
  };

  const remove = (id: string) => {
    const rest = lines.filter((line) => line.id !== id);
    // Keep one row to type into rather than an empty table.
    onChange(rest.length > 0 ? rest : [{ ...emptyLine(section), qtyText: "1", priceText: "", costText: "" }]);
  };

  const subtotal = lines.reduce((sum, line) => {
    const qty = parseQty(line.qtyText);
    const price = parseAmount(line.priceText);
    return qty !== undefined && typeof price === "number"
      ? sum + lineAmountCents({ qty, unitPriceCents: price })
      : sum;
  }, 0);

  return (
    <Panel
      title={title}
      icon={section === "parts" ? "package" : "wrench"}
      action={
        <span style={{ fontSize: "12.5px", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          {formatAmount(subtotal)}
        </span>
      }
    >
      <datalist id={listId}>
        {known.map((item) => (
          <option key={item.description} value={item.description} label={formatAmount(item.unitPriceCents)} />
        ))}
        {costed.map((source) => (
          <option key={`cost-${source.label}`} value={source.label} label={`Cost ${formatAmount(source.costCents)}`} />
        ))}
      </datalist>

      <div className="overflow-x-auto">
        <div className="flex min-w-[740px] flex-col gap-1.5">
          <div className={GRID} style={{ padding: "0 2px 6px", borderBottom: "1px solid var(--border-subtle)" }}>
            <ColumnLabel>P.O.</ColumnLabel>
            <ColumnLabel>Description</ColumnLabel>
            <ColumnLabel align="right">Qty</ColumnLabel>
            <ColumnLabel>Unit</ColumnLabel>
            <ColumnLabel align="right">Unit price</ColumnLabel>
            <ColumnLabel align="right">Amount</ColumnLabel>
            <ColumnLabel align="right">
              <span title="What it costs the business. Never printed or emailed.">
                Cost <Icon name="eye-off" size={10} style={{ verticalAlign: "-1px" }} />
              </span>
            </ColumnLabel>
            <span />
          </div>

          {lines.map((line) => {
            const qty = parseQty(line.qtyText);
            const price = parseAmount(line.priceText);
            const cost = parseAmount(line.costText);
            const described = line.description.trim() !== "";
            const amount =
              qty !== undefined && typeof price === "number" ? lineAmountCents({ qty, unitPriceCents: price }) : null;
            const note = ORIGIN_NOTE[line.origin];
            const loss =
              typeof price === "number" && typeof cost === "number" && price < cost;
            const check =
              described && price !== undefined && cost !== undefined
                ? checkLineCost(
                    { section, description: line.description, unitPriceCents: price, costCents: cost },
                    costSources,
                  )
                : null;

            return (
              <div key={line.id} className={GRID} style={{ padding: "0 2px" }}>
                <input
                  aria-label="P.O."
                  style={CELL}
                  value={line.po}
                  maxLength={30}
                  onChange={(event) => patch(line.id, { po: event.target.value })}
                />
                <span className="flex min-w-0 flex-col gap-1">
                  <input
                    aria-label={`${title} description`}
                    style={CELL}
                    list={listId}
                    value={line.description}
                    maxLength={160}
                    placeholder={`Add a ${noun}`}
                    onChange={(event) => setDescription(line, event.target.value)}
                  />
                  {note && described && (
                    <span style={{ fontSize: "10.5px", color: note.color, paddingLeft: 2 }}>{note.text}</span>
                  )}
                  {line.costNote && described && typeof cost === "number" && (
                    <span style={{ fontSize: "10.5px", color: "var(--text-muted)", paddingLeft: 2 }}>
                      Cost: {line.costNote}
                    </span>
                  )}
                </span>
                <input
                  aria-label="Quantity"
                  style={invalid(NUMBER_CELL, described && qty === undefined)}
                  inputMode="decimal"
                  value={line.qtyText}
                  onChange={(event) => patch(line.id, { qtyText: event.target.value })}
                />
                <input
                  aria-label="Unit"
                  style={CELL}
                  value={line.unit}
                  maxLength={20}
                  placeholder={section === "parts" ? "pc" : ""}
                  onChange={(event) => patch(line.id, { unit: event.target.value })}
                />
                <input
                  aria-label="Unit price"
                  style={
                    described && price === null
                      ? { ...NUMBER_CELL, borderColor: "var(--status-warning)", background: "var(--status-warning-soft)" }
                      : invalid(NUMBER_CELL, price === undefined)
                  }
                  inputMode="decimal"
                  placeholder={described ? "Price?" : "0.00"}
                  value={line.priceText}
                  onChange={(event) =>
                    patch(line.id, {
                      priceText: event.target.value,
                      origin: line.origin === "suggested" ? "suggested" : "typed",
                    })
                  }
                />
                <span
                  style={{
                    ...NUMBER_CELL,
                    border: "1px solid transparent",
                    background: "var(--surface-inset)",
                    color: amount === null ? "var(--text-muted)" : "var(--text-primary)",
                  }}
                >
                  {amount === null ? "-" : formatAmount(amount)}
                </span>
                <input
                  aria-label="Cost, internal"
                  title={loss ? "The price is below the cost." : "What it costs the business. Never printed."}
                  style={{
                    ...invalid(NUMBER_CELL, cost === undefined),
                    background: "var(--gray-25)",
                    borderStyle: "dashed",
                    ...(loss ? { color: "var(--status-negative)" } : {}),
                  }}
                  inputMode="decimal"
                  placeholder="—"
                  value={line.costText}
                  // A cost typed by hand is the person's own; it no longer says where it came from.
                  onChange={(event) => patch(line.id, { costText: event.target.value, costNote: "" })}
                  onBlur={() => offerPrice(line)}
                />
                <button
                  type="button"
                  aria-label={`Remove ${line.description || noun}`}
                  onClick={() => remove(line.id)}
                  style={{
                    width: 28,
                    height: 31,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "none",
                    background: "transparent",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <Icon name="x" size={14} />
                </button>
                {check && (
                  <CostNotice
                    check={check}
                    markupPercent={markupPercent}
                    priceCents={typeof price === "number" ? price : null}
                    onUseCost={() => takeCurrentCost(line, check.source, false)}
                    onReprice={() => takeCurrentCost(line, check.source, true)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <Button variant="secondary" size="sm" icon="plus" onClick={add}>
          Add {noun}
        </Button>
      </div>
    </Panel>
  );
}

function invalid(style: CSSProperties, bad: boolean): CSSProperties {
  return bad ? { ...style, borderColor: "var(--status-negative)" } : style;
}

/**
 * Spans the row under a part line whose cost on record has moved past it, or
 * which has no cost while one is on record. Offers the new cost, and the price
 * at the business's markup over it; neither is applied without a click.
 */
function CostNotice({
  check,
  markupPercent,
  priceCents,
  onUseCost,
  onReprice,
}: {
  check: CostCheck;
  markupPercent: number;
  priceCents: number | null;
  onUseCost: () => void;
  onReprice: () => void;
}) {
  const { source } = check;
  const newPrice = priceFromCost(source.costCents, markupPercent);
  const cost = formatAmount(source.costCents);
  let message: string;
  if (check.risen) {
    message =
      priceCents !== null && check.markupNow !== null
        ? `Cost is now ${cost} (${source.note}). At ${formatAmount(priceCents)} your markup is ${check.markupNow}%, not ${check.markupWas ?? markupPercent}%.`
        : `Cost is now ${cost} (${source.note}).`;
  } else {
    message =
      check.markupNow !== null
        ? `Cost on record: ${cost} (${source.note}), a markup of ${check.markupNow}% at this price.`
        : `Cost on record: ${cost} (${source.note}).`;
  }
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      style={{
        gridColumn: "2 / -1",
        padding: "6px 9px",
        borderRadius: "var(--radius-sm)",
        background: check.risen ? "var(--status-warning-soft)" : "var(--surface-inset)",
        fontSize: "11px",
        color: "var(--text-primary)",
      }}
    >
      {check.risen && <Icon name="alert-triangle" size={12} color="var(--status-warning)" />}
      <span style={{ flex: 1, minWidth: 200, textWrap: "pretty" }}>{message}</span>
      <Button size="sm" variant="secondary" onClick={onUseCost}>
        Use this cost
      </Button>
      {priceCents !== newPrice && (
        <Button size="sm" variant="secondary" onClick={onReprice}>
          Price at {markupPercent}%: {formatAmount(newPrice)}
        </Button>
      )}
    </div>
  );
}
