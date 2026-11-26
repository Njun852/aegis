"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Icon, SearchInput } from "@/components/ui";
import { PriceItemDrawer, marginOf, usesTotals } from "@/components/quotations/price-item-drawer";
import { descriptionKey, formatPeso, priceItemKey } from "@/lib/quotations";
import { STALE_COST_DAYS, describeAge, planningCost } from "@/lib/suppliers";
import type { PartComparison } from "@/lib/suppliers";
import type { PriceItemUse, QuotePriceItem } from "@/types";

const NO_USES: PriceItemUse[] = [];

/**
 * One part on the price list: what it sells for (the quotation price list),
 * what each supplier charges for it (cheapest first), and every job it went
 * on. A part can be on either side alone: quoted but not yet costed from a
 * supplier, or costed but never quoted.
 */
interface PartRow {
  id: string;
  label: string;
  group: PartComparison | null;
  item: QuotePriceItem | null;
  uses: PriceItemUse[];
}

/** Every wording a supplier group is known by, as match keys. */
function groupKeys(group: PartComparison): string[] {
  return [group.label, ...group.entries.map((entry) => entry.description)].map(descriptionKey);
}

/**
 * Joins the quotation price list to the supplier costs by wording: a price
 * list part takes the supplier group whose Inventory name or any supplier
 * wording reads the same. Each group goes to one part only.
 */
function joinParts(groups: PartComparison[], items: QuotePriceItem[], uses: Record<string, PriceItemUse[]>): PartRow[] {
  const byKey = new Map<string, PartComparison>();
  for (const group of groups) for (const key of groupKeys(group)) if (!byKey.has(key)) byKey.set(key, group);

  const taken = new Set<string>();
  const rows: PartRow[] = [];
  for (const item of items) {
    if (item.section !== "parts") continue;
    const found = byKey.get(descriptionKey(item.description));
    const group = found && !taken.has(found.id) ? found : null;
    if (group) taken.add(group.id);
    rows.push({
      id: `item:${descriptionKey(item.description)}`,
      label: item.description,
      group,
      item,
      uses: uses[priceItemKey("parts", item.description)] ?? NO_USES,
    });
  }
  for (const group of groups) {
    if (taken.has(group.id)) continue;
    const used = groupKeys(group)
      .map((key) => uses[`parts:${key}`])
      .find((list) => list && list.length);
    rows.push({ id: group.id, label: group.label, group, item: null, uses: used ?? NO_USES });
  }
  return rows.sort((a, b) => a.label.localeCompare(b.label));
}

function matchesSearch(row: { label: string; group: PartComparison | null; uses: PriceItemUse[] }, term: string): boolean {
  if (!term) return true;
  const has = (value: string | null | undefined) => (value ?? "").toLowerCase().includes(term);
  return (
    has(row.label) ||
    has(row.group?.sku) ||
    (row.group?.entries ?? []).some((entry) => has(entry.description) || has(entry.supplierName)) ||
    row.uses.some((use) =>
      [use.customer, use.company, use.phone, use.plate, use.makeModel, use.jobOrderRef, use.boughtFrom].some(has),
    )
  );
}

const CARD = {
  background: "var(--surface-card)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-card)",
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 12,
  minWidth: 0,
} as const;

/**
 * The price list, on the Suppliers screen (25 Nov 2026; it was a tab of
 * Quotations). Each part shows what it sells for, what every supplier charges
 * (the planning cost marked, since it is not always the cheapest: a cheap
 * price a year old is not a price), and the jobs it went on: which customer,
 * which car, who it was bought from and what it made. Labor lines follow,
 * with their jobs. Clicking a part or labor line opens its panel, where the
 * price is edited and every job is listed.
 */
export function PriceComparison({
  groups,
  priceItems,
  uses,
  markupPercent,
  quotesEnabled,
  crmEnabled,
  onOpenSupplier,
}: {
  groups: PartComparison[];
  /** The quotation price list. Empty when the business does not keep Quotations. */
  priceItems: QuotePriceItem[];
  /** Where each price list line was used, by `priceItemKey`. */
  uses: Record<string, PriceItemUse[]>;
  markupPercent: number;
  quotesEnabled: boolean;
  crmEnabled: boolean;
  onOpenSupplier: (ref: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [multiOnly, setMultiOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const term = search.trim().toLowerCase();

  const parts = useMemo(() => joinParts(groups, priceItems, uses), [groups, priceItems, uses]);
  const labor = useMemo(
    () =>
      priceItems
        .filter((item) => item.section === "labor")
        .map((item) => ({
          id: `labor:${descriptionKey(item.description)}`,
          label: item.description,
          group: null,
          item,
          uses: uses[priceItemKey("labor", item.description)] ?? NO_USES,
        })),
    [priceItems, uses],
  );

  const visibleParts = parts.filter(
    (row) => matchesSearch(row, term) && (!multiOnly || (row.group?.entries.length ?? 0) > 1),
  );
  const visibleLabor = multiOnly ? [] : labor.filter((row) => matchesSearch(row, term));
  const open = openId ? [...parts, ...labor].find((row) => row.id === openId && row.item) ?? null : null;

  // A supplier opens in its own drawer, so this one closes first.
  const openSupplier = (ref: string) => {
    setOpenId(null);
    onOpenSupplier(ref);
  };

  return (
    <>
      <section style={CARD}>
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput placeholder="Search parts, suppliers, customers, plates..." value={search} onChange={setSearch} width={300} />
          <label className="flex items-center gap-2" style={{ fontSize: "12px", cursor: "pointer" }}>
            <input type="checkbox" checked={multiOnly} onChange={(event) => setMultiOnly(event.target.checked)} />
            Only parts with more than one supplier
          </label>
          <span className="ml-auto" style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
            {visibleParts.length} of {parts.length} parts
          </span>
        </div>

        {parts.length === 0 ? (
          <div style={{ padding: "26px 10px", textAlign: "center", fontSize: "12.5px", color: "var(--text-muted)" }}>
            No parts yet. Open a supplier and add the parts they sell{quotesEnabled ? ", or save a quotation" : ""}.
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {visibleParts.map((row) => (
              <PartCard key={row.id} row={row} onOpen={row.item ? () => setOpenId(row.id) : null} onOpenSupplier={onOpenSupplier} />
            ))}
            {visibleParts.length === 0 && (
              <div style={{ padding: "20px 10px", textAlign: "center", fontSize: "12.5px", color: "var(--text-muted)" }}>
                No parts match.
              </div>
            )}
          </div>
        )}
        <span style={{ fontSize: "11px", color: "var(--text-muted)", textWrap: "pretty" }}>
          Quotations cost a part at the preferred supplier&apos;s price, or the most recently confirmed one when none is
          preferred, not simply the cheapest. Costs and profit stay internal.
        </span>
      </section>

      {visibleLabor.length > 0 && (
        <section style={CARD}>
          <span className="flex items-center gap-2" style={{ fontSize: "13px", fontWeight: 700 }}>
            <Icon name="wrench" size={14} />
            Labor
          </span>
          <div className="flex flex-col">
            {visibleLabor.map((row) => (
              <LaborRow key={row.id} row={row} onOpen={() => setOpenId(row.id)} />
            ))}
          </div>
        </section>
      )}

      {open?.item && (
        <PriceItemDrawer
          key={open.id}
          item={open.item}
          uses={open.uses}
          markupPercent={markupPercent}
          crmEnabled={crmEnabled}
          onOpenSupplier={openSupplier}
          onClose={() => setOpenId(null)}
        >
          {open.group && <SupplierCosts group={open.group} onOpenSupplier={openSupplier} />}
        </PriceItemDrawer>
      )}
    </>
  );
}

/** A part: its price, what each supplier charges, and a line on the jobs it went on. */
function PartCard({
  row,
  onOpen,
  onOpenSupplier,
}: {
  row: PartRow;
  onOpen: (() => void) | null;
  onOpenSupplier: (ref: string) => void;
}) {
  const { group, item, uses } = row;
  const planning = group ? planningCost(group) : null;
  const spread = group && group.entries.length > 1 ? group.entries[group.entries.length - 1].costCents - group.cheapestCents : 0;
  const margin = item ? marginOf(item) : null;
  const totals = usesTotals(uses);
  const last = uses[0];

  return (
    <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1" style={{ padding: "9px 12px", background: "var(--gray-25)", borderBottom: "1px solid var(--border-subtle)" }}>
        <span style={{ fontSize: "12.5px", fontWeight: 700 }}>{row.label}</span>
        {group && !group.sku && <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>not linked to Inventory</span>}
        {spread > 0 && (
          <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>· {formatPeso(spread)} between cheapest and dearest</span>
        )}
        {item && (
          <span className="ml-auto" style={{ fontSize: "12px", fontVariantNumeric: "tabular-nums" }}>
            <span style={{ color: "var(--text-muted)" }}>Sells at </span>
            <span style={{ fontWeight: 700 }}>{formatPeso(item.unitPriceCents)}</span>
            {item.unit && <span style={{ color: "var(--text-muted)" }}> / {item.unit}</span>}
            {margin !== null && (
              <span style={{ color: margin < 0 ? "var(--status-negative)" : "var(--text-muted)" }}>
                {" "}
                · {margin >= 0 ? "+" : ""}
                {margin}%
              </span>
            )}
          </span>
        )}
      </div>

      {group ? (
        group.entries.map((entry, index) => (
          <button
            key={entry.ref}
            type="button"
            onClick={() => onOpenSupplier(entry.supplierRef)}
            className="flex w-full items-center gap-3"
            style={{
              padding: "8px 12px",
              border: "none",
              borderTop: index === 0 ? "none" : "1px solid var(--gray-50)",
              background: "transparent",
              textAlign: "left",
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              color: "var(--text-primary)",
            }}
          >
            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
              <span style={{ fontSize: "12.5px", fontWeight: 500 }}>
                {entry.supplierName}
                {entry.description !== group.label && (
                  <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> · “{entry.description}”</span>
                )}
              </span>
              <span style={{ fontSize: "11px", color: entry.costAgeDays > STALE_COST_DAYS ? "var(--status-warning)" : "var(--text-muted)" }}>
                {describeAge(entry.costAgeDays)}
              </span>
            </span>
            {index === 0 && group.entries.length > 1 && <Badge tone="positive">Cheapest</Badge>}
            {entry.preferred && <Badge tone="accent">Preferred</Badge>}
            {planning?.ref === entry.ref && !entry.preferred && <Badge tone="accent">Preferred (automatic)</Badge>}
            <span style={{ fontSize: "13px", fontWeight: 700, fontVariantNumeric: "tabular-nums", minWidth: 96, textAlign: "right" }}>
              {formatPeso(entry.costCents)}
              {entry.unit && <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: "11px" }}> / {entry.unit}</span>}
            </span>
          </button>
        ))
      ) : (
        <div style={{ padding: "8px 12px", fontSize: "11.5px", color: "var(--text-muted)" }}>
          No supplier cost yet. Open a supplier and add this part to compare.
        </div>
      )}

      {(onOpen || uses.length > 0) && (
        <div
          onClick={onOpen ?? undefined}
          className="flex w-full flex-wrap items-center gap-x-3 gap-y-1"
          style={{
            padding: "8px 12px",
            borderTop: "1px solid var(--border-subtle)",
            background: "var(--surface-inset)",
            cursor: onOpen ? "pointer" : "default",
            fontSize: "11.5px",
            color: "var(--text-secondary)",
          }}
        >
          <Icon name="users" size={13} style={{ color: "var(--text-muted)" }} />
          {uses.length === 0 ? (
            <span>Not used on a job yet</span>
          ) : (
            <>
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                Used on {uses.length} {uses.length === 1 ? "job" : "jobs"}
              </span>
              {/* The latest job opens straight to its job order. */}
              <Link
                href={`/quotations/jobs/${encodeURIComponent(last.jobOrderRef)}`}
                onClick={(event) => event.stopPropagation()}
                title={`Open ${last.jobOrderRef}`}
                className="hover:underline"
                style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-secondary)", textDecoration: "none" }}
              >
                Last: <span style={{ fontWeight: 700, color: "var(--accent-primary)" }}>{last.jobOrderRef}</span> · {last.customer || "No name"}
                {last.plate ? ` · ${last.plate}` : ""} · {last.when}
              </Link>
              {totals.costed && (
                <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, color: totals.profit < 0 ? "var(--status-negative)" : "var(--text-secondary)" }}>
                  Profit {formatPeso(totals.profit)}
                </span>
              )}
            </>
          )}
          {onOpen && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpen();
              }}
              aria-haspopup="dialog"
              className="ml-auto flex items-center gap-1"
              style={{ border: "none", background: "none", padding: 0, cursor: "pointer", fontFamily: "var(--font-body)", fontSize: "11.5px", color: "var(--accent-primary)", fontWeight: 600 }}
            >
              {uses.length ? "All jobs & price" : "Price"}
              <Icon name="chevron-right" size={13} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** A labor line: its price and how often it was done. */
function LaborRow({ row, onOpen }: { row: { label: string; item: QuotePriceItem; uses: PriceItemUse[] }; onOpen: () => void }) {
  const totals = usesTotals(row.uses);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className="flex w-full items-center gap-3"
      style={{
        padding: "9px 10px",
        border: "none",
        borderBottom: "1px solid var(--gray-50)",
        background: "transparent",
        textAlign: "left",
        cursor: "pointer",
        fontFamily: "var(--font-body)",
        color: "var(--text-primary)",
      }}
    >
      <span className="flex min-w-0 flex-1 flex-col" style={{ lineHeight: 1.3 }}>
        <span style={{ fontSize: "12.5px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.label}</span>
        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
          {row.uses.length ? `Done on ${row.uses.length} ${row.uses.length === 1 ? "job" : "jobs"} · sold ${formatPeso(totals.sold)}` : "Not done on a job yet"}
        </span>
      </span>
      <span style={{ fontSize: "13px", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
        {formatPeso(row.item.unitPriceCents)}
        {row.item.unit && <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: "11px" }}> / {row.item.unit}</span>}
      </span>
      <Icon name="chevron-right" size={14} style={{ color: "var(--text-muted)" }} />
    </button>
  );
}

/** What each supplier charges for the part, inside its panel. */
function SupplierCosts({ group, onOpenSupplier }: { group: PartComparison; onOpenSupplier: (ref: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span style={{ fontSize: "12.5px", fontWeight: 700 }}>Supplier costs</span>
      {group.entries.map((entry, index) => (
        <button
          key={entry.ref}
          type="button"
          onClick={() => onOpenSupplier(entry.supplierRef)}
          className="flex w-full items-center gap-2"
          style={{
            padding: "7px 10px",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            background: "transparent",
            textAlign: "left",
            cursor: "pointer",
            fontFamily: "var(--font-body)",
            color: "var(--text-primary)",
          }}
        >
          <Icon name="truck" size={13} style={{ color: "var(--text-muted)" }} />
          <span style={{ flex: 1, minWidth: 0, fontSize: "12.5px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {entry.supplierName}
          </span>
          {index === 0 && group.entries.length > 1 && <Badge tone="positive">Cheapest</Badge>}
          {entry.preferred && <Badge tone="accent">Preferred</Badge>}
          <span style={{ fontSize: "12.5px", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatPeso(entry.costCents)}</span>
        </button>
      ))}
    </div>
  );
}
