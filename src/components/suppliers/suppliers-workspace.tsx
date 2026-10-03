"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ColumnLabel } from "@/components/forms/form-kit";
import { Badge, Button, Icon, SearchInput } from "@/components/ui";
import { activateOnKey } from "@/lib/interaction";
import { STALE_COST_DAYS, compareParts, filterSuppliers } from "@/lib/suppliers";
import { CostChangesPanel } from "./cost-changes-panel";
import { ImportModal } from "./import-modal";
import { PriceComparison } from "./price-comparison";
import { SupplierDrawer } from "./supplier-drawer";
import { SupplierModal } from "./supplier-modal";
import type {
  InventoryOption,
  SupplierCostChange,
  SupplierImportCandidate,
  SupplierItem,
  SupplierSummary,
} from "@/types";

export type SuppliersTab = "suppliers" | "prices" | "changes";

const GRID =
  "grid gap-3 items-center grid-cols-[minmax(160px,1.4fr)_90px_20px] wide:grid-cols-[minmax(190px,1.4fr)_minmax(0,1.2fr)_110px_90px_120px_22px]";

export interface SuppliersWorkspaceProps {
  suppliers: SupplierSummary[];
  items: SupplierItem[];
  changes: SupplierCostChange[];
  inventory: InventoryOption[];
  candidates: SupplierImportCandidate[];
  inventoryEnabled: boolean;
  tab: SuppliersTab;
  openRef: string | null;
  businessName: string;
  /** "Now" as the server saw it, so the 30-day window agrees on both sides. */
  nowIso: string;
}

export function SuppliersWorkspace({
  suppliers,
  items,
  changes,
  inventory,
  candidates,
  inventoryEnabled,
  tab,
  openRef,
  businessName,
  nowIso,
}: SuppliersWorkspaceProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [, startNavigation] = useTransition();

  const groups = useMemo(() => compareParts(items), [items]);
  const visibleSuppliers = useMemo(() => filterSuppliers(suppliers, search), [suppliers, search]);
  const open = openRef ? suppliers.find((supplier) => supplier.ref === openRef) ?? null : null;

  const go = (next: { tab?: SuppliersTab; supplier?: string | null }) => {
    const params = new URLSearchParams();
    const nextTab = next.tab ?? tab;
    if (nextTab !== "suppliers") params.set("tab", nextTab);
    const supplier = next.supplier === undefined ? openRef : next.supplier;
    if (supplier) params.set("supplier", supplier);
    const query = params.toString();
    startNavigation(() => router.replace(query ? `/suppliers?${query}` : "/suppliers", { scroll: false }));
  };

  const rises = changes.filter(
    (change) => (change.changePercent ?? 0) > 0 && Date.parse(nowIso) - Date.parse(change.at) < 30 * 86_400_000,
  );
  const stale = items.filter((item) => item.costAgeDays > STALE_COST_DAYS);

  const stats = [
    { label: "Suppliers", value: String(suppliers.filter((s) => s.active).length), icon: "truck", bg: "var(--accent-soft)", fg: "var(--accent-primary)" },
    { label: "Parts priced", value: String(groups.length), icon: "layers", bg: "var(--surface-inset)", fg: "var(--text-secondary)" },
    { label: "Costs up in 30 days", value: String(rises.length), icon: "trending-up", bg: "var(--status-negative-soft)", fg: "var(--status-negative)" },
    { label: `Costs older than ${STALE_COST_DAYS} days`, value: String(stale.length), icon: "clock", bg: "var(--status-warning-soft)", fg: "var(--status-warning)" },
  ];

  const tabs: { id: SuppliersTab; label: string; icon: string }[] = [
    { id: "suppliers", label: "Suppliers", icon: "truck" },
    { id: "prices", label: "Compare costs", icon: "layers" },
    { id: "changes", label: "Cost changes", icon: "trending-up" },
  ];

  return (
    <>
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "22px", lineHeight: "28px", fontWeight: 700, letterSpacing: "-.02em" }}>
              Suppliers
            </h2>
            <p style={{ margin: "3px 0 0", fontSize: "12.5px", color: "var(--text-secondary)" }}>
              {businessName} · what each supplier charges, and how it changes
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {tab === "suppliers" && (
              <SearchInput placeholder="Search suppliers..." value={search} onChange={setSearch} width={220} />
            )}
            {inventoryEnabled && candidates.length > 0 && (
              <Button variant="secondary" icon="package" onClick={() => setImporting(true)}>
                From Inventory ({candidates.length})
              </Button>
            )}
            <Button icon="plus" onClick={() => setAdding(true)}>
              New supplier
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 wide:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              style={{
                background: "var(--surface-card)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md)",
                boxShadow: "var(--shadow-card)",
                padding: "12px 14px",
                display: "flex",
                alignItems: "center",
                gap: "11px",
                minWidth: 0,
              }}
            >
              <span style={{ width: 32, height: 32, flex: "0 0 auto", borderRadius: "9px", background: stat.bg, color: stat.fg, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name={stat.icon} size={15} />
              </span>
              <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.2, minWidth: 0 }}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: "19px", fontWeight: 700, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>
                  {stat.value}
                </span>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {stat.label}
                </span>
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-1" role="tablist" aria-label="Suppliers view">
          {tabs.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => go({ tab: item.id })}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  height: 32,
                  padding: "0 13px",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  fontFamily: "var(--font-body)",
                  fontSize: "12.5px",
                  fontWeight: active ? 700 : 500,
                  color: active ? "var(--text-accent)" : "var(--text-secondary)",
                  background: active ? "var(--accent-soft)" : "transparent",
                }}
              >
                <Icon name={item.icon} size={14} />
                {item.label}
              </button>
            );
          })}
        </div>

        {tab === "prices" && <PriceComparison groups={groups} onOpenSupplier={(ref) => go({ supplier: ref })} />}
        {tab === "changes" && <CostChangesPanel changes={changes} onOpenSupplier={(ref) => go({ supplier: ref })} />}
        {tab === "suppliers" && (
          <section
            style={{
              background: "var(--surface-card)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-card)",
              padding: "12px 12px 10px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              minWidth: 0,
            }}
          >
            <div className={GRID} style={{ padding: "0 10px 8px", borderBottom: "1px solid var(--border-subtle)" }}>
              <ColumnLabel>Supplier</ColumnLabel>
              <ColumnLabel className="hidden wide:block">Contact</ColumnLabel>
              <ColumnLabel className="hidden wide:block">Terms</ColumnLabel>
              <ColumnLabel align="right">Parts</ColumnLabel>
              <ColumnLabel className="hidden wide:block">Last cost</ColumnLabel>
              <span />
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {visibleSuppliers.map((supplier) => {
                const select = () => go({ supplier: supplier.ref });
                return (
                  <div
                    key={supplier.ref}
                    role="button"
                    tabIndex={0}
                    aria-label={`${supplier.name}, ${supplier.itemCount} parts`}
                    onClick={select}
                    onKeyDown={activateOnKey(select)}
                    className={GRID}
                    style={{
                      padding: "10px",
                      borderRadius: "10px",
                      cursor: "pointer",
                      borderBottom: "1px solid var(--gray-50)",
                      background: supplier.ref === openRef ? "var(--surface-active)" : "transparent",
                      opacity: supplier.active ? 1 : 0.55,
                    }}
                  >
                    <span className="flex min-w-0 flex-col leading-tight">
                      <span style={{ fontSize: "12.5px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {supplier.name}
                      </span>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        {supplier.ref}
                        {!supplier.active && " · no longer used"}
                      </span>
                    </span>
                    <span className="hidden min-w-0 flex-col leading-tight wide:flex">
                      <span style={{ fontSize: "12.5px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {supplier.contactPerson || supplier.phone || "—"}
                      </span>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {supplier.contactPerson ? supplier.phone || supplier.email : supplier.email}
                      </span>
                    </span>
                    <span className="hidden wide:block" style={{ fontSize: "12.5px" }}>
                      {supplier.terms || "—"}
                    </span>
                    <span style={{ fontSize: "12.5px", fontWeight: 600, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {supplier.itemCount}
                    </span>
                    <span className="hidden wide:block" style={{ fontSize: "12.5px", color: "var(--text-secondary)" }}>
                      {supplier.lastCostDay ?? "—"}
                    </span>
                    <span style={{ color: "var(--text-muted)", display: "inline-flex", justifyContent: "flex-end" }}>
                      <Icon name="chevron-right" size={15} />
                    </span>
                  </div>
                );
              })}
              {visibleSuppliers.length === 0 && (
                <div style={{ padding: "30px 10px", textAlign: "center", fontSize: "12.5px", color: "var(--text-muted)" }}>
                  {suppliers.length === 0 ? (
                    <>
                      No suppliers yet. Add one, or{" "}
                      {inventoryEnabled && candidates.length > 0 ? "bring in the supplier names already typed in Inventory." : "start with the ones you buy from most."}
                    </>
                  ) : (
                    "No suppliers match this search."
                  )}
                </div>
              )}
            </div>
            {suppliers.some((supplier) => !supplier.active) && (
              <span style={{ fontSize: "11px", color: "var(--text-muted)", padding: "0 10px" }}>
                <Badge tone="neutral">Faded</Badge> suppliers are no longer used; their costs and history are kept.
              </span>
            )}
          </section>
        )}
      </div>

      {open && (
        <SupplierDrawer
          key={open.ref}
          supplier={open}
          items={items.filter((item) => item.supplierRef === open.ref)}
          allItems={items}
          inventory={inventory}
          inventoryEnabled={inventoryEnabled}
          onClose={() => go({ supplier: null })}
        />
      )}
      {adding && (
        <SupplierModal
          supplier={null}
          onClose={() => setAdding(false)}
          onSaved={(ref) => {
            setAdding(false);
            go({ tab: "suppliers", supplier: ref });
          }}
        />
      )}
      {importing && <ImportModal candidates={candidates} onClose={() => setImporting(false)} />}
    </>
  );
}
