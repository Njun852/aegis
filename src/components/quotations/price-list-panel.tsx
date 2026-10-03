"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { deletePriceItemAction, updatePriceItemAction } from "@/app/actions/quotations";
import { useToast } from "@/components/layout/toast-provider";
import { Button, Icon, SearchInput } from "@/components/ui";
import { QUOTE_SECTIONS, amountInput, formatAmount, parseAmount, priceFromCost } from "@/lib/quotations";
import { CELL, ColumnLabel, NUMBER_CELL, Notice } from "@/components/forms/form-kit";
import type { QuotePriceItem } from "@/types";

const GRID =
  "grid gap-3 items-center grid-cols-[minmax(160px,1fr)_70px_110px_110px_90px_150px]";

/**
 * The remembered lines. Nobody has to fill this in: every saved quotation
 * adds its lines, and this screen is for correcting a price or removing a
 * one-off.
 */
export function PriceListPanel({ items, markupPercent }: { items: QuotePriceItem[]; markupPercent: number }) {
  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();
  const visible = useMemo(
    () => (term ? items.filter((item) => item.description.toLowerCase().includes(term)) : items),
    [items, term],
  );

  return (
    <section
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-card)",
        padding: "12px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        minWidth: 0,
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput placeholder="Search the price list..." value={search} onChange={setSearch} width={240} />
        <span style={{ fontSize: "11.5px", color: "var(--text-muted)", flex: 1, minWidth: 200, textWrap: "pretty" }}>
          Filled in as quotations are saved: each line is remembered at the price it was last quoted, and offered
          when the same wording is typed again. Costs stay internal.
        </span>
      </div>

      {items.length === 0 ? (
        <div style={{ padding: "26px 10px", textAlign: "center", fontSize: "12.5px", color: "var(--text-muted)" }}>
          Nothing yet. Save a quotation and its lines appear here.
        </div>
      ) : (
        QUOTE_SECTIONS.map((section) => {
          const rows = visible.filter((item) => item.section === section.key);
          if (rows.length === 0) return null;
          return (
            <div key={section.key} className="overflow-x-auto">
              <div className="flex min-w-[700px] flex-col">
                <div style={{ fontSize: "12.5px", fontWeight: 700, padding: "4px 10px 8px" }}>{section.label}</div>
                <div className={GRID} style={{ padding: "0 10px 8px", borderBottom: "1px solid var(--border-subtle)" }}>
                  <ColumnLabel>Description</ColumnLabel>
                  <ColumnLabel>Unit</ColumnLabel>
                  <ColumnLabel align="right">Price</ColumnLabel>
                  <ColumnLabel align="right">Cost</ColumnLabel>
                  <ColumnLabel align="right">Quoted</ColumnLabel>
                  <span />
                </div>
                {rows.map((item) => (
                  <PriceRow key={`${item.section}:${item.description}`} item={item} markupPercent={markupPercent} />
                ))}
              </div>
            </div>
          );
        })
      )}
      {items.length > 0 && visible.length === 0 && (
        <div style={{ padding: "20px 10px", textAlign: "center", fontSize: "12.5px", color: "var(--text-muted)" }}>
          Nothing on the price list matches this search.
        </div>
      )}
    </section>
  );
}

function PriceRow({ item, markupPercent }: { item: QuotePriceItem; markupPercent: number }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [unit, setUnit] = useState(item.unit);
  const [price, setPrice] = useState(amountInput(item.unitPriceCents));
  const [cost, setCost] = useState(amountInput(item.costCents));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    const priceCents = parseAmount(price);
    const costCents = parseAmount(cost);
    if (typeof priceCents !== "number") {
      setError("Enter a price.");
      return;
    }
    if (costCents === undefined) {
      setError("The cost is not an amount.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updatePriceItemAction(item.section, item.description, {
        unit,
        unitPriceCents: priceCents,
        costCents,
      });
      if (!result.ok) {
        toast({ tone: "error", title: "Price not saved", description: result.error });
        return;
      }
      toast({ tone: "success", title: "Price list updated", description: `${item.description}: ${formatAmount(priceCents)}` });
      setEditing(false);
      router.refresh();
    });
  };

  const remove = () => {
    if (!window.confirm(`Remove “${item.description}” from the price list? Saved quotations keep their lines.`)) return;
    startTransition(async () => {
      const result = await deletePriceItemAction(item.section, item.description);
      if (!result.ok) {
        toast({ tone: "error", title: "Not removed", description: result.error });
        return;
      }
      toast({ tone: "success", title: "Removed from the price list", description: item.description });
      router.refresh();
    });
  };

  const margin =
    item.costCents !== null && item.costCents > 0
      ? Math.round(((item.unitPriceCents - item.costCents) / item.costCents) * 100)
      : null;

  return (
    <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--gray-50)" }}>
      <div className={GRID}>
        <span style={{ fontSize: "12.5px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" }}>
          {item.description}
          <span style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", fontWeight: 400 }}>
            Last quoted {item.lastUsedDay}
          </span>
        </span>
        {editing ? (
          <>
            <input aria-label="Unit" style={CELL} value={unit} maxLength={20} onChange={(event) => setUnit(event.target.value)} />
            <input aria-label="Price" style={NUMBER_CELL} inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} />
            <input
              aria-label="Cost"
              style={{ ...NUMBER_CELL, borderStyle: "dashed" }}
              inputMode="decimal"
              placeholder="—"
              value={cost}
              onChange={(event) => setCost(event.target.value)}
            />
          </>
        ) : (
          <>
            <span style={{ fontSize: "12.5px" }}>{item.unit || "—"}</span>
            <span style={{ fontSize: "12.5px", fontWeight: 600, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
              {formatAmount(item.unitPriceCents)}
            </span>
            <span style={{ fontSize: "12.5px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)" }}>
              {item.costCents === null ? "—" : formatAmount(item.costCents)}
              {margin !== null && (
                <span style={{ display: "block", fontSize: "10.5px", color: margin < 0 ? "var(--status-negative)" : "var(--text-muted)" }}>
                  {margin >= 0 ? "+" : ""}
                  {margin}%
                </span>
              )}
            </span>
          </>
        )}
        <span style={{ fontSize: "12.5px", textAlign: "right", color: "var(--text-secondary)" }}>
          {item.useCount}×
        </span>
        <span className="flex items-center justify-end gap-1.5">
          {editing ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
                Cancel
              </Button>
              <Button size="sm" icon="check" onClick={save} disabled={pending}>
                Save
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" icon="pen-line" onClick={() => setEditing(true)} disabled={pending}>
                Edit
              </Button>
              <button
                type="button"
                aria-label={`Remove ${item.description}`}
                onClick={remove}
                disabled={pending}
                style={{
                  width: 28,
                  height: 28,
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
                <Icon name="trash-2" size={14} />
              </button>
            </>
          )}
        </span>
      </div>
      {editing && (
        <div style={{ marginTop: 6, fontSize: "11px", color: "var(--text-muted)" }}>
          {error ? (
            <Notice tone="error">{error}</Notice>
          ) : (
            `Changes apply to quotations started from now on. At ${markupPercent}% markup, a cost of 1,000.00 is offered at ${formatAmount(priceFromCost(100_000, markupPercent))}.`
          )}
        </div>
      )}
    </div>
  );
}
