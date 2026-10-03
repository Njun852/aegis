"use client";

import { useMemo, useState } from "react";
import { Badge, SearchInput } from "@/components/ui";
import { formatPeso } from "@/lib/quotations";
import { STALE_COST_DAYS, describeAge, filterComparisons, planningCost } from "@/lib/suppliers";
import type { PartComparison } from "@/lib/suppliers";

/**
 * Each part with what every supplier charges for it, cheapest first. The
 * planning cost (preferred supplier, else the most recently confirmed) is
 * what quotations will use, and it is marked, because it is not always the
 * cheapest: a cheap price a year old is not a price.
 */
export function PriceComparison({
  groups,
  onOpenSupplier,
}: {
  groups: PartComparison[];
  onOpenSupplier: (ref: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [multiOnly, setMultiOnly] = useState(false);
  const visible = useMemo(
    () => filterComparisons(groups, search).filter((group) => !multiOnly || group.entries.length > 1),
    [groups, search, multiOnly],
  );

  return (
    <section
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-card)",
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minWidth: 0,
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput placeholder="Search parts or suppliers..." value={search} onChange={setSearch} width={240} />
        <label className="flex items-center gap-2" style={{ fontSize: "12px", cursor: "pointer" }}>
          <input type="checkbox" checked={multiOnly} onChange={(event) => setMultiOnly(event.target.checked)} />
          Only parts with more than one supplier
        </label>
        <span className="ml-auto" style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
          {visible.length} of {groups.length} parts
        </span>
      </div>

      {groups.length === 0 ? (
        <div style={{ padding: "26px 10px", textAlign: "center", fontSize: "12.5px", color: "var(--text-muted)" }}>
          No costs yet. Open a supplier and add the parts they sell.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {visible.map((group) => {
            const planning = planningCost(group);
            const spread =
              group.entries.length > 1
                ? group.entries[group.entries.length - 1].costCents - group.cheapestCents
                : 0;
            return (
              <div key={group.id} style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                <div className="flex flex-wrap items-baseline gap-2" style={{ padding: "9px 12px", background: "var(--gray-25)", borderBottom: "1px solid var(--border-subtle)" }}>
                  <span style={{ fontSize: "12.5px", fontWeight: 700 }}>{group.label}</span>
                  {group.sku ? (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "10.5px", color: "var(--text-muted)" }}>{group.sku}</span>
                  ) : (
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>not linked to Inventory</span>
                  )}
                  {spread > 0 && (
                    <span className="ml-auto" style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                      {formatPeso(spread)} between cheapest and dearest
                    </span>
                  )}
                </div>
                {group.entries.map((entry, index) => (
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
                    {planning?.ref === entry.ref && !entry.preferred && (
                      <Badge tone="neutral">Used for quotes</Badge>
                    )}
                    <span style={{ fontSize: "13px", fontWeight: 700, fontVariantNumeric: "tabular-nums", minWidth: 96, textAlign: "right" }}>
                      {formatPeso(entry.costCents)}
                      {entry.unit && <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: "11px" }}> / {entry.unit}</span>}
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
          {visible.length === 0 && (
            <div style={{ padding: "20px 10px", textAlign: "center", fontSize: "12.5px", color: "var(--text-muted)" }}>
              No parts match.
            </div>
          )}
        </div>
      )}
      <span style={{ fontSize: "11px", color: "var(--text-muted)", textWrap: "pretty" }}>
        Quotations will cost a part at the preferred supplier&apos;s price, or the most recently confirmed one when none is
        preferred, not simply the cheapest.
      </span>
    </section>
  );
}
