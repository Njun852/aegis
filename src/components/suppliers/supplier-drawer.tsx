"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  addSupplierItemAction,
  deleteSupplierItemAction,
  setItemCostAction,
  setPreferredItemAction,
  setSupplierActiveAction,
  updateSupplierItemAction,
} from "@/app/actions/suppliers";
import { CELL, NUMBER_CELL, Notice, SELECT } from "@/components/forms/form-kit";
import { useToast } from "@/components/layout/toast-provider";
import { Badge, Button, Icon, IconButton } from "@/components/ui";
import { amountInput, formatPeso, parseAmount } from "@/lib/quotations";
import { STALE_COST_DAYS, comparisonId, describeAge } from "@/lib/suppliers";
import { SupplierModal } from "./supplier-modal";
import type { InventoryOption, Supplier, SupplierItem } from "@/types";

export interface SupplierDrawerProps {
  supplier: Supplier;
  /** This supplier's price book. */
  items: SupplierItem[];
  /** Every supplier's, to show where a part is cheaper. */
  allItems: SupplierItem[];
  inventory: InventoryOption[];
  inventoryEnabled: boolean;
  onClose: () => void;
}

const SOURCE_LABEL: Record<SupplierItem["costSource"], string> = {
  typed: "typed in",
  inventory: "from Inventory",
  purchase: "from a purchase",
  photo: "from a receipt photo",
};

export function SupplierDrawer({ supplier, items, allItems, inventory, inventoryEnabled, onClose }: SupplierDrawerProps) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  const toggleActive = () => {
    if (supplier.active && !window.confirm(`Mark ${supplier.name} as no longer used? Its costs and history are kept.`)) return;
    startTransition(async () => {
      const result = await setSupplierActiveAction(supplier.ref, !supplier.active);
      if (!result.ok) {
        toast({ tone: "error", title: "Not changed", description: result.error });
        return;
      }
      toast({ tone: "success", title: supplier.active ? `${supplier.name} set aside` : `${supplier.name} back in use` });
      router.refresh();
    });
  };

  const details = [
    { icon: "user", label: "Contact", value: supplier.contactPerson },
    { icon: "phone", label: "Phone", value: supplier.phone },
    { icon: "mail", label: "Email", value: supplier.email },
    { icon: "credit-card", label: "Terms", value: supplier.terms },
    { icon: "truck", label: "Delivery", value: supplier.leadTimeDays === null ? "" : `${supplier.leadTimeDays} days usually` },
    { icon: "file-text", label: "Notes", value: supplier.notes },
  ].filter((row) => row.value);

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(23,28,37,.18)" }} />
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 520,
          maxWidth: "94vw",
          zIndex: 71,
          background: "var(--surface-card)",
          borderLeft: "1px solid var(--border-default)",
          boxShadow: "var(--shadow-popover)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="flex items-start gap-3" style={{ padding: "16px 16px 14px", borderBottom: "1px solid var(--border-subtle)" }}>
          <span style={{ width: 38, height: 38, flex: "0 0 auto", borderRadius: 10, background: "var(--accent-soft)", color: "var(--accent-primary)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="truck" size={18} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "16px", fontWeight: 700, overflowWrap: "anywhere" }}>{supplier.name}</div>
            <div className="flex items-center gap-2" style={{ marginTop: 3 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "10.5px", color: "var(--text-muted)" }}>{supplier.ref}</span>
              {!supplier.active && <Badge tone="neutral">No longer used</Badge>}
            </div>
          </div>
          <IconButton icon="x" size={32} label="Close" onClick={onClose} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto" style={{ padding: 16 }}>
          {details.length > 0 ? (
            <div className="flex flex-col gap-2" style={{ padding: "12px 14px", border: "1px solid var(--border-default)", borderRadius: 14 }}>
              {details.map((row) => (
                <div key={row.label} className="flex items-start gap-2.5">
                  <span style={{ color: "var(--text-muted)", marginTop: 1 }}>
                    <Icon name={row.icon} size={14} />
                  </span>
                  <span style={{ width: 70, flex: "0 0 auto", fontSize: "11.5px", color: "var(--text-muted)" }}>{row.label}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: "12.5px", fontWeight: 500, overflowWrap: "anywhere" }}>{row.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>No contact details yet. Use Edit to add them.</span>
          )}

          <PriceBook
            supplier={supplier}
            items={items}
            allItems={allItems}
            inventory={inventory}
            inventoryEnabled={inventoryEnabled}
          />
        </div>

        <div className="flex items-center gap-2" style={{ padding: "13px 16px", borderTop: "1px solid var(--border-subtle)", background: "var(--gray-25)" }}>
          <Button variant="secondary" icon="pen-line" onClick={() => setEditing(true)}>
            Edit details
          </Button>
          <Button variant="ghost" onClick={toggleActive} disabled={pending}>
            {supplier.active ? "No longer used" : "Use again"}
          </Button>
        </div>
      </aside>

      {editing && (
        <SupplierModal supplier={supplier} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />
      )}
    </>
  );
}

function PriceBook({
  supplier,
  items,
  allItems,
  inventory,
  inventoryEnabled,
}: Omit<SupplierDrawerProps, "onClose">) {
  const router = useRouter();
  const toast = useToast();
  const [description, setDescription] = useState("");
  const [sku, setSku] = useState("");
  const [unit, setUnit] = useState("");
  const [cost, setCost] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const pickItem = (value: string) => {
    setSku(value);
    const item = inventory.find((entry) => entry.sku === value);
    // Linking to an item fills what is still empty; the supplier's own wording, once typed, stays.
    if (item && !description.trim()) setDescription(item.name);
    if (item && !unit.trim()) setUnit(item.unit);
  };

  const add = () => {
    const costCents = parseAmount(cost);
    if (!description.trim()) {
      setError("Describe the part as the supplier sells it.");
      return;
    }
    if (typeof costCents !== "number" || costCents <= 0) {
      setError("Enter what the supplier charges per unit.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await addSupplierItemAction(supplier.ref, { description, sku: sku || null, unit, costCents });
      if (!result.ok) {
        setError(result.error);
        toast({ tone: "error", title: "Not added", description: result.error, key: "supplier-item" });
        return;
      }
      toast({ tone: "success", title: "Added to the price book", description: `${description.trim()} at ${formatPeso(costCents)}`, key: "supplier-item" });
      setDescription("");
      setSku("");
      setUnit("");
      setCost("");
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-2.5">
      <span className="flex items-baseline justify-between">
        <span style={{ fontSize: "var(--text-overline-size)", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text-muted)" }}>
          Price book
        </span>
        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
          {items.length} {items.length === 1 ? "part" : "parts"} · per unit
        </span>
      </span>

      {items.map((item) => (
        <PriceRow
          key={item.ref}
          item={item}
          others={allItems.filter((other) => other.ref !== item.ref && comparisonId(other) === comparisonId(item))}
          inventory={inventory}
          inventoryEnabled={inventoryEnabled}
        />
      ))}
      {items.length === 0 && (
        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Nothing yet. Add the parts you buy from {supplier.name}.</span>
      )}

      <div className="flex flex-col gap-2" style={{ padding: 12, border: "1px dashed var(--border-strong)", borderRadius: "var(--radius-md)" }}>
        <span style={{ fontSize: "12px", fontWeight: 600 }}>Add a part</span>
        {error && <Notice tone="error">{error}</Notice>}
        {inventoryEnabled && (
          <select style={SELECT} value={sku} onChange={(event) => pickItem(event.target.value)} aria-label="Inventory item">
            <option value="">Not linked to an Inventory item</option>
            {inventory.map((option) => (
              <option key={option.sku} value={option.sku}>
                {option.name} · {option.sku}
              </option>
            ))}
          </select>
        )}
        <div className="grid grid-cols-[minmax(0,1fr)_70px_110px] gap-2">
          <input aria-label="Description" style={CELL} value={description} maxLength={160} placeholder="As the supplier writes it" onChange={(event) => setDescription(event.target.value)} />
          <input aria-label="Unit" style={CELL} value={unit} maxLength={20} placeholder="pc" onChange={(event) => setUnit(event.target.value)} />
          <input aria-label="Cost per unit" style={NUMBER_CELL} inputMode="decimal" value={cost} placeholder="Cost" onChange={(event) => setCost(event.target.value)} />
        </div>
        <div>
          <Button size="sm" icon="plus" onClick={add} disabled={pending}>
            {pending ? "Adding…" : "Add"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PriceRow({
  item,
  others,
  inventory,
  inventoryEnabled,
}: {
  item: SupplierItem;
  others: SupplierItem[];
  inventory: InventoryOption[];
  inventoryEnabled: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(item.description);
  const [unit, setUnit] = useState(item.unit);
  const [sku, setSku] = useState(item.sku ?? "");
  const [cost, setCost] = useState(amountInput(item.costCents));
  const [pending, startTransition] = useTransition();

  const cheaper = useMemo(
    () => others.filter((other) => other.costCents < item.costCents).sort((a, b) => a.costCents - b.costCents)[0] ?? null,
    [others, item.costCents],
  );
  const stale = item.costAgeDays > STALE_COST_DAYS;

  const run = (work: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        toast({ tone: "error", title: "Not saved", description: result.error, key: `supplier-item-${item.ref}` });
        return;
      }
      toast({ tone: "success", title: success, key: `supplier-item-${item.ref}` });
      setEditing(false);
      router.refresh();
    });

  const save = () => {
    const costCents = parseAmount(cost);
    if (typeof costCents !== "number" || costCents <= 0) {
      toast({ tone: "error", title: "Not saved", description: "Enter a cost above zero." });
      return;
    }
    run(async () => {
      const details = await updateSupplierItemAction(item.ref, { description, sku: sku || null, unit });
      if (!details.ok || costCents === item.costCents) return details;
      return setItemCostAction(item.ref, costCents);
    }, costCents === item.costCents ? "Part updated" : `Cost changed to ${formatPeso(costCents)}`);
  };

  return (
    <div style={{ padding: "10px 12px", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", display: "flex", flexDirection: "column", gap: 6 }}>
      {editing ? (
        <>
          {inventoryEnabled && (
            <select style={SELECT} value={sku} onChange={(event) => setSku(event.target.value)} aria-label="Inventory item">
              <option value="">Not linked to an Inventory item</option>
              {inventory.map((option) => (
                <option key={option.sku} value={option.sku}>
                  {option.name} · {option.sku}
                </option>
              ))}
            </select>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)_70px_110px] gap-2">
            <input aria-label="Description" style={CELL} value={description} maxLength={160} onChange={(event) => setDescription(event.target.value)} />
            <input aria-label="Unit" style={CELL} value={unit} maxLength={20} onChange={(event) => setUnit(event.target.value)} />
            <input aria-label="Cost per unit" style={NUMBER_CELL} inputMode="decimal" value={cost} onChange={(event) => setCost(event.target.value)} />
          </div>
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>A new cost is kept in the history with the old one.</span>
          <div className="flex items-center gap-2">
            <Button size="sm" icon="check" onClick={save} disabled={pending}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
              Cancel
            </Button>
            <span className="ml-auto">
              <Button
                size="sm"
                variant="ghost"
                icon="trash-2"
                disabled={pending}
                onClick={() => {
                  if (!window.confirm(`Remove “${item.description}” from this price book? Its cost history is kept.`)) return;
                  run(() => deleteSupplierItemAction(item.ref), "Removed from the price book");
                }}
              >
                Remove
              </Button>
            </span>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-start gap-2.5">
            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
              <span style={{ fontSize: "12.5px", fontWeight: 600, overflowWrap: "anywhere" }}>{item.description}</span>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", overflowWrap: "anywhere" }}>
                {item.sku ? `${item.itemName ?? item.sku} · ${item.sku}` : inventoryEnabled ? "Not linked to Inventory" : ""}
              </span>
            </span>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.3 }}>
              <span style={{ fontSize: "13px", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {formatPeso(item.costCents)}
                {item.unit && <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: "11px" }}> / {item.unit}</span>}
              </span>
              <span style={{ fontSize: "11px", color: stale ? "var(--status-warning)" : "var(--text-muted)" }}>
                {describeAge(item.costAgeDays)} · {SOURCE_LABEL[item.costSource]}
              </span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => run(() => setPreferredItemAction(item.ref, !item.preferred), item.preferred ? "No longer preferred" : `${item.supplierName} is preferred for this part`)}
              disabled={pending}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                height: 24,
                padding: "0 9px",
                borderRadius: "var(--radius-pill)",
                border: `1px solid ${item.preferred ? "var(--blue-200)" : "var(--border-default)"}`,
                background: item.preferred ? "var(--accent-soft)" : "transparent",
                color: item.preferred ? "var(--text-accent)" : "var(--text-secondary)",
                fontFamily: "var(--font-body)",
                fontSize: "11px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Icon name="check" size={11} />
              {item.preferred ? "Preferred" : "Make preferred"}
            </button>
            {cheaper && (
              <span style={{ fontSize: "11px", color: "var(--status-warning)" }}>
                {formatPeso(cheaper.costCents)} at {cheaper.supplierName} ({describeAge(cheaper.costAgeDays)})
              </span>
            )}
            <span className="ml-auto">
              <Button size="sm" variant="ghost" icon="pen-line" onClick={() => setEditing(true)}>
                Edit
              </Button>
            </span>
          </div>
        </>
      )}
    </div>
  );
}
