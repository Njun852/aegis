"use client";

import Link from "next/link";
import { jobOrderLabel } from "@/lib/job-orders";
import { formatPeso } from "@/lib/quotations";
import type { JobPartUse } from "@/types";

/**
 * Inventory's "Used on jobs" list: every part taken from stock for a job
 * order, who it was used for (customer and car) and what it cost from its
 * batches. The costing record of where each unit went.
 */

const GRID =
  "grid gap-3 items-center grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_88px] wide:grid-cols-[110px_minmax(0,1.4fr)_minmax(0,1.3fr)_64px_104px_96px]";

export function filterJobUses(uses: JobPartUse[], search: string): JobPartUse[] {
  const term = search.trim().toLowerCase();
  if (!term) return uses;
  return uses.filter((use) =>
    [use.description, use.sku, use.customer, use.plate, use.makeModel, use.jobOrderRef, use.moveRef].some((value) =>
      value.toLowerCase().includes(term),
    ),
  );
}

function Label({ children, className }: { children: string; className?: string }) {
  return (
    <span className={className} style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
      {children}
    </span>
  );
}

export function JobUsesList({ uses, total }: { uses: JobPartUse[]; total: number }) {
  const costCents = uses.filter((use) => !use.returned).reduce((sum, use) => sum + use.costCents, 0);
  return (
    <>
      <div className={GRID} style={{ padding: "0 10px 8px", borderBottom: "1px solid var(--border-subtle)" }}>
        <Label className="hidden wide:block">Taken</Label>
        <Label>Part</Label>
        <Label>Used for</Label>
        <Label className="hidden text-right wide:block">Qty</Label>
        <Label className="text-right">Cost</Label>
        <Label className="hidden wide:block">Job order</Label>
      </div>
      {uses.map((use) => (
        <div
          key={use.moveRef}
          className={GRID}
          style={{
            padding: "9px 10px",
            borderBottom: "1px solid var(--border-subtle)",
            fontSize: "12.5px",
            opacity: use.returned ? 0.6 : 1,
          }}
        >
          <span className="hidden wide:block" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
            {use.when}
          </span>
          <span className="flex min-w-0 flex-col">
            <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{use.description}</span>
            <span className="wide:hidden" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              {use.quantity} {use.unit} · {use.when} · {use.jobOrderRef}
            </span>
            {use.returned && <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Put back in stock (job cancelled)</span>}
          </span>
          <span className="flex min-w-0 flex-col">
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{use.customer || "No name"}</span>
            <span style={{ fontSize: "11px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {[use.plate, use.makeModel].filter(Boolean).join(" · ") || "No car"}
            </span>
          </span>
          <span className="hidden text-right wide:block" style={{ fontVariantNumeric: "tabular-nums" }}>
            {use.quantity}
          </span>
          <span className="text-right" style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, textDecoration: use.returned ? "line-through" : "none" }}>
            {formatPeso(use.costCents)}
          </span>
          <span className="hidden wide:block">
            <Link
              href={`/quotations/jobs/${encodeURIComponent(use.jobOrderRef)}`}
              style={{ color: "var(--accent-primary)", textDecoration: "none", fontWeight: 600 }}
            >
              {use.jobOrderRef}
            </Link>
            <span style={{ display: "block", fontSize: "11px", color: "var(--text-muted)" }}>{jobOrderLabel(use.jobStatus)}</span>
          </span>
        </div>
      ))}
      {uses.length === 0 ? (
        <div style={{ padding: "30px 10px", textAlign: "center", fontSize: "12.5px", color: "var(--text-muted)" }}>
          {total === 0
            ? "No parts have been taken for a job order yet. They are taken when a job order is made or recorded."
            : "No parts used on jobs match this search and period."}
        </div>
      ) : (
        <div className="flex justify-end" style={{ padding: "8px 10px 2px", fontSize: "12.5px", gap: 8 }}>
          <span style={{ color: "var(--text-secondary)" }}>Cost of parts used</span>
          <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatPeso(costCents)}</span>
        </div>
      )}
    </>
  );
}
