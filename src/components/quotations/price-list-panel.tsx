"use client";

import { useMemo, useState } from "react";
import { Icon, SearchInput } from "@/components/ui";
import { QUOTE_SECTIONS, formatAmount, priceItemKey } from "@/lib/quotations";
import { ColumnLabel } from "@/components/forms/form-kit";
import { PriceItemDrawer, marginOf } from "./price-item-drawer";
import type { PriceItemUse, QuotePriceItem } from "@/types";

const GRID = "grid gap-3 items-center grid-cols-[minmax(150px,1fr)_64px_96px_96px_64px_84px_16px]";

const NO_USES: PriceItemUse[] = [];

/** How a line is told apart on this screen; the same wording can be a part and a labor line. */
const rowKey = (item: QuotePriceItem) => `${item.section}:${item.description}`;

/**
 * The remembered lines. Nobody has to fill this in: every saved quotation
 * adds its lines. The list stays one plain row per line; clicking a part or
 * labor line opens its panel, which holds the editing and every job it was
 * used on (who, which car, what it sold for and cost), however long that is.
 */
export function PriceListPanel({
  items,
  uses,
  markupPercent,
}: {
  items: QuotePriceItem[];
  /** Where each line was used, by `priceItemKey`. */
  uses: Record<string, PriceItemUse[]>;
  markupPercent: number;
}) {
  const [search, setSearch] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const term = search.trim().toLowerCase();
  const usesOf = (item: QuotePriceItem) => uses[priceItemKey(item.section, item.description)] ?? NO_USES;

  // A customer's name, a plate or a job order finds the lines used for them.
  const visible = useMemo(
    () =>
      term
        ? items.filter(
            (item) =>
              item.description.toLowerCase().includes(term) ||
              (uses[priceItemKey(item.section, item.description)] ?? []).some((use) =>
                [use.customer, use.plate, use.makeModel, use.jobOrderRef].some((value) => value.toLowerCase().includes(term)),
              ),
          )
        : items,
    [items, uses, term],
  );
  const selected = openKey ? (items.find((item) => rowKey(item) === openKey) ?? null) : null;

  return (
    <>
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
          <SearchInput placeholder="Search item, customer, plate..." value={search} onChange={setSearch} width={260} />
          <span style={{ fontSize: "11.5px", color: "var(--text-muted)", flex: 1, minWidth: 200, textWrap: "pretty" }}>
            Every saved quotation adds its lines here. Click a line to edit it and see the jobs it was used on. Costs
            stay internal.
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
                <div className="flex min-w-[620px] flex-col">
                  <div style={{ fontSize: "12.5px", fontWeight: 700, padding: "4px 10px 8px" }}>{section.label}</div>
                  <div className={GRID} style={{ padding: "0 10px 8px", borderBottom: "1px solid var(--border-subtle)" }}>
                    <ColumnLabel>Description</ColumnLabel>
                    <ColumnLabel>Unit</ColumnLabel>
                    <ColumnLabel align="right">Price</ColumnLabel>
                    <ColumnLabel align="right">Cost</ColumnLabel>
                    <ColumnLabel align="right">Quoted</ColumnLabel>
                    <ColumnLabel align="right">Jobs</ColumnLabel>
                    <span />
                  </div>
                  {rows.map((item) => (
                    <PriceRow
                      key={rowKey(item)}
                      item={item}
                      jobs={usesOf(item).length}
                      active={openKey === rowKey(item)}
                      onOpen={() => setOpenKey(rowKey(item))}
                    />
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

      {selected && (
        <PriceItemDrawer
          key={rowKey(selected)}
          item={selected}
          uses={usesOf(selected)}
          markupPercent={markupPercent}
          onClose={() => setOpenKey(null)}
        />
      )}
    </>
  );
}

/** One plain row: the whole of it opens the line's panel. */
function PriceRow({ item, jobs, active, onOpen }: { item: QuotePriceItem; jobs: number; active: boolean; onOpen: () => void }) {
  const margin = marginOf(item);
  const number = { fontSize: "12.5px", textAlign: "right" as const, fontVariantNumeric: "tabular-nums" as const };
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className={GRID}
      style={{
        width: "100%",
        padding: "9px 10px",
        border: "none",
        borderBottom: "1px solid var(--border-subtle)",
        background: active ? "var(--accent-soft)" : "transparent",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "var(--font-body)",
        color: "var(--text-primary)",
      }}
    >
      <span className="flex min-w-0 flex-col">
        <span style={{ fontSize: "12.5px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.description}
        </span>
        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Last quoted {item.lastUsedDay}</span>
      </span>
      <span style={{ fontSize: "12.5px", color: "var(--text-secondary)" }}>{item.unit || "—"}</span>
      <span style={{ ...number, fontWeight: 600 }}>{formatAmount(item.unitPriceCents)}</span>
      <span style={{ ...number, color: "var(--text-secondary)" }}>
        {item.costCents === null ? "—" : formatAmount(item.costCents)}
        {margin !== null && (
          <span style={{ display: "block", fontSize: "10.5px", color: margin < 0 ? "var(--status-negative)" : "var(--text-muted)" }}>
            {margin >= 0 ? "+" : ""}
            {margin}%
          </span>
        )}
      </span>
      <span style={{ ...number, color: "var(--text-secondary)" }}>{item.useCount}×</span>
      <span style={{ ...number, color: jobs ? "var(--text-primary)" : "var(--text-muted)", fontWeight: jobs ? 600 : 400 }}>
        {jobs || "—"}
      </span>
      <Icon name="chevron-right" size={14} style={{ color: "var(--text-muted)" }} />
    </button>
  );
}

