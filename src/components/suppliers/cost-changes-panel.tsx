"use client";

import { useMemo, useState } from "react";
import { ColumnLabel } from "@/components/forms/form-kit";
import { formatPeso } from "@/lib/quotations";
import type { SupplierCostChange } from "@/types";

const GRID = "grid gap-3 items-center grid-cols-[100px_minmax(160px,1.4fr)_minmax(0,1fr)_120px_80px]";

const SOURCE: Record<SupplierCostChange["source"], string> = {
  typed: "Typed in",
  inventory: "From Inventory",
  purchase: "Purchase",
  photo: "Receipt photo",
};

/** Every cost change in the last four months, newest first. Increases are what eat into margins. */
export function CostChangesPanel({
  changes,
  onOpenSupplier,
}: {
  changes: SupplierCostChange[];
  onOpenSupplier: (ref: string) => void;
}) {
  const [risesOnly, setRisesOnly] = useState(false);
  const visible = useMemo(
    () => (risesOnly ? changes.filter((change) => (change.changePercent ?? 0) > 0) : changes),
    [changes, risesOnly],
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
        gap: 10,
        minWidth: 0,
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2" style={{ fontSize: "12px", cursor: "pointer" }}>
          <input type="checkbox" checked={risesOnly} onChange={(event) => setRisesOnly(event.target.checked)} />
          Only increases
        </label>
        <span className="ml-auto" style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
          Last 4 months · {visible.length} {visible.length === 1 ? "change" : "changes"}
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-[640px] flex-col">
          <div className={GRID} style={{ padding: "0 10px 8px", borderBottom: "1px solid var(--border-subtle)" }}>
            <ColumnLabel>Date</ColumnLabel>
            <ColumnLabel>Part</ColumnLabel>
            <ColumnLabel>Supplier</ColumnLabel>
            <ColumnLabel align="right">Cost</ColumnLabel>
            <ColumnLabel align="right">Change</ColumnLabel>
          </div>
          {visible.map((change, index) => {
            const up = (change.changePercent ?? 0) > 0;
            const down = (change.changePercent ?? 0) < 0;
            return (
              <div key={`${change.itemRef}-${change.at}-${index}`} className={GRID} style={{ padding: "9px 10px", borderBottom: "1px solid var(--gray-50)" }}>
                <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{change.day}</span>
                <span className="flex min-w-0 flex-col leading-tight">
                  <span style={{ fontSize: "12.5px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {change.description}
                  </span>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    {SOURCE[change.source]}
                    {change.documentRef ? ` · ${change.documentRef}` : ""}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onOpenSupplier(change.supplierRef)}
                  style={{ border: "none", background: "none", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: "var(--font-body)", fontSize: "12.5px", color: "var(--text-accent)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {change.supplierName}
                </button>
                <span className="flex flex-col items-end leading-tight">
                  <span style={{ fontSize: "12.5px", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{formatPeso(change.costCents)}</span>
                  {change.previousCents !== null && (
                    <span style={{ fontSize: "11px", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums", textDecoration: "line-through" }}>
                      {formatPeso(change.previousCents)}
                    </span>
                  )}
                </span>
                <span
                  style={{
                    fontSize: "12.5px",
                    fontWeight: 700,
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    color: up ? "var(--status-negative)" : down ? "var(--status-positive)" : "var(--text-muted)",
                  }}
                >
                  {change.changePercent === null ? "First" : `${up ? "+" : ""}${change.changePercent}%`}
                </span>
              </div>
            );
          })}
          {visible.length === 0 && (
            <div style={{ padding: "26px 10px", textAlign: "center", fontSize: "12.5px", color: "var(--text-muted)" }}>
              {changes.length === 0 ? "No cost changes recorded yet." : "No increases in the last four months."}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
