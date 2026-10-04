"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { receiveGoodsAction } from "@/app/actions/purchasing";
import { CELL, ColumnLabel, Field, INPUT, NUMBER_CELL, Notice, Panel, SELECT } from "@/components/forms/form-kit";
import { useToast } from "@/components/layout/toast-provider";
import { Button, Icon } from "@/components/ui";
import { outstanding, variancePercent } from "@/lib/purchasing";
import { amountInput, descriptionKey, formatAmount, formatPeso, newLineId, parseAmount } from "@/lib/quotations";
import type { InventoryOption, PurchaseOrder, Supplier, SupplierItem } from "@/types";

export interface ReceiveFormProps {
  /** The order being received against, or null for goods bought without one. */
  order: PurchaseOrder | null;
  suppliers: Supplier[];
  supplierItems: SupplierItem[];
  inventory: InventoryOption[];
  inventoryEnabled: boolean;
  todayKey: string;
}

interface Row {
  id: string;
  orderLineId: string | null;
  description: string;
  sku: string;
  unit: string;
  qtyText: string;
  costText: string;
  expectedCostCents: number | null;
  /** For order lines: what is still to come. */
  outstanding: number | null;
}

const GRID = "grid items-center gap-2 grid-cols-[minmax(170px,1.5fr)_minmax(140px,1fr)_80px_60px_110px_110px_28px]";

function freeRow(): Row {
  return { id: newLineId(), orderLineId: null, description: "", sku: "", unit: "", qtyText: "1", costText: "", expectedCostCents: null, outstanding: null };
}

/**
 * Goods arriving. Against an order, each outstanding line is listed at the
 * quantity still to come and the cost expected; staff change what actually
 * arrived and what it actually cost. Posting puts every line into Inventory as
 * a batch and updates the supplier's cost.
 */
export function ReceiveForm({ order, suppliers, supplierItems, inventory, inventoryEnabled, todayKey }: ReceiveFormProps) {
  const router = useRouter();
  const toast = useToast();
  const [supplierRef, setSupplierRef] = useState(order?.supplierRef ?? "");
  const [receiptNo, setReceiptNo] = useState("");
  const [receivedDate, setReceivedDate] = useState(todayKey);
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>(() =>
    order
      ? order.lines
          .filter((line) => outstanding(line) > 0)
          .map((line) => ({
            id: newLineId(),
            orderLineId: line.id,
            description: line.description,
            sku: line.sku ?? "",
            unit: line.unit,
            qtyText: String(outstanding(line)),
            costText: amountInput(line.expectedCostCents),
            expectedCostCents: line.expectedCostCents,
            outstanding: outstanding(line),
          }))
      : [freeRow()],
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const priceBook = useMemo(() => supplierItems.filter((item) => item.supplierRef === supplierRef), [supplierItems, supplierRef]);

  const change = (id: string, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const setDescription = (row: Row, description: string) => {
    const match = priceBook.find((item) => descriptionKey(item.description) === descriptionKey(description));
    change(row.id, {
      description,
      ...(match && !row.orderLineId
        ? {
            sku: match.sku ?? row.sku,
            unit: row.unit || match.unit,
            costText: row.costText || amountInput(match.costCents),
            // The price book cost is what they charged last time: what this receipt is compared with.
            expectedCostCents: match.costCents,
          }
        : {}),
    });
  };

  const total = rows.reduce((sum, row) => {
    const qty = Number(row.qtyText);
    const cost = parseAmount(row.costText);
    return Number.isInteger(qty) && typeof cost === "number" ? sum + qty * cost : sum;
  }, 0);

  const submit = (confirmDuplicate = false) => {
    setError(null);
    const lines = rows
      .filter((row) => row.description.trim() || row.sku)
      .map((row) => ({
        id: row.id,
        orderLineId: row.orderLineId,
        description: row.description,
        sku: row.sku || null,
        unit: row.unit,
        qty: Number(row.qtyText),
        unitCostCents: parseAmount(row.costText) ?? 0,
        expectedCostCents: row.expectedCostCents,
      }));
    const bad = lines.find((line) => !Number.isInteger(line.qty) || line.qty < 0);
    if (bad) {
      setError(`${bad.description}: the quantity must be a whole number of units.`);
      return;
    }
    const over = rows.find((row) => row.outstanding !== null && Number(row.qtyText) > row.outstanding);
    if (over) {
      setError(`${over.description}: only ${over.outstanding} still to come on ${order?.ref}.`);
      return;
    }
    startTransition(async () => {
      const result = await receiveGoodsAction({
        supplierRef,
        purchaseOrderRef: order?.ref ?? null,
        receiptNo,
        receivedDate,
        notes,
        lines,
        confirmDuplicate,
      });
      if (!result.ok) {
        if ("duplicateOf" in result) {
          if (window.confirm(`${result.error} Record it again anyway?`)) submit(true);
          return;
        }
        setError(result.error);
        toast({ tone: "error", title: "Not received", description: result.error, key: "receive" });
        return;
      }
      toast({
        tone: "success",
        title: `${result.ref} received`,
        description: inventoryEnabled
          ? "The goods are in Inventory as new batches, and the supplier's costs are updated."
          : "The supplier's costs are updated.",
        key: "receive",
      });
      router.push(`/suppliers/receipts/${result.ref}`);
    });
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={order ? `/suppliers/orders/${order.ref}` : "/suppliers?tab=receipts"} className="inline-flex items-center gap-1.5" style={{ fontSize: "12.5px", color: "var(--text-secondary)", textDecoration: "none" }}>
          <Icon name="arrow-left" size={14} />
          {order ? order.ref : "Receipts"}
        </Link>
        <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "22px", lineHeight: "28px", fontWeight: 700, letterSpacing: "-.02em" }}>
          {order ? `Receive ${order.ref}` : "Receive goods"}
        </h2>
        <div className="ml-auto">
          <Button icon="check" onClick={() => submit()} disabled={pending || !supplierRef}>
            {pending ? "Receiving…" : inventoryEnabled ? "Receive into stock" : "Record receipt"}
          </Button>
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {!inventoryEnabled && (
        <Notice tone="info">This business has no Inventory module, so the receipt records costs only and no stock moves.</Notice>
      )}

      <div className="grid gap-3.5 wide:grid-cols-[minmax(0,1fr)_300px]">
        <Panel title="What arrived" icon="package" action={<span style={{ fontSize: "12.5px", fontWeight: 600 }}>{formatPeso(total)}</span>}>
          <datalist id="receive-price-book">
            {priceBook.map((item) => (
              <option key={item.ref} value={item.description} label={formatAmount(item.costCents)} />
            ))}
          </datalist>
          <div className="overflow-x-auto">
            <div className="flex min-w-[720px] flex-col gap-1.5">
              <div className={GRID} style={{ padding: "0 2px 6px", borderBottom: "1px solid var(--border-subtle)" }}>
                <ColumnLabel>Description</ColumnLabel>
                <ColumnLabel>{inventoryEnabled ? "Inventory item" : ""}</ColumnLabel>
                <ColumnLabel align="right">Qty</ColumnLabel>
                <ColumnLabel>Unit</ColumnLabel>
                <ColumnLabel align="right">Cost each</ColumnLabel>
                <ColumnLabel align="right">vs expected</ColumnLabel>
                <span />
              </div>
              {rows.map((row) => {
                const cost = parseAmount(row.costText);
                const change_ = typeof cost === "number" ? variancePercent(cost, row.expectedCostCents) : null;
                return (
                  <div key={row.id} className={GRID} style={{ padding: "0 2px" }}>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <input aria-label="Description" style={CELL} list="receive-price-book" value={row.description} disabled={row.orderLineId !== null} maxLength={160} onChange={(event) => setDescription(row, event.target.value)} />
                      {row.outstanding !== null && (
                        <span style={{ fontSize: "10.5px", color: "var(--text-muted)", paddingLeft: 2 }}>
                          {row.outstanding} still to come · enter 0 if none arrived
                        </span>
                      )}
                    </span>
                    {inventoryEnabled ? (
                      <select aria-label="Inventory item" style={{ ...SELECT, ...CELL, paddingRight: 28 }} value={row.sku} disabled={row.orderLineId !== null && row.sku !== ""} onChange={(event) => {
                        const item = inventory.find((entry) => entry.sku === event.target.value);
                        change(row.id, { sku: event.target.value, description: row.description || item?.name || "", unit: row.unit || item?.unit || "" });
                      }}>
                        <option value="">New item, created now</option>
                        {inventory.map((option) => (
                          <option key={option.sku} value={option.sku}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span />
                    )}
                    <input aria-label="Quantity received" style={NUMBER_CELL} inputMode="numeric" value={row.qtyText} onChange={(event) => change(row.id, { qtyText: event.target.value })} />
                    <input aria-label="Unit" style={CELL} value={row.unit} maxLength={20} onChange={(event) => change(row.id, { unit: event.target.value })} />
                    <input aria-label="Cost each" style={NUMBER_CELL} inputMode="decimal" value={row.costText} placeholder="0.00" onChange={(event) => change(row.id, { costText: event.target.value })} />
                    <span
                      title={row.expectedCostCents !== null ? `Expected ${formatAmount(row.expectedCostCents)}` : "Nothing to compare with"}
                      style={{
                        ...NUMBER_CELL,
                        border: "1px solid transparent",
                        color: change_ === null || change_ === 0 ? "var(--text-muted)" : change_ > 0 ? "var(--status-negative)" : "var(--status-positive)",
                      }}
                    >
                      {change_ === null ? "—" : change_ === 0 ? "as expected" : `${change_ > 0 ? "+" : ""}${change_}%`}
                    </span>
                    <button type="button" aria-label="Remove line" onClick={() => setRows((current) => current.filter((entry) => entry.id !== row.id))} style={{ width: 28, height: 31, border: "none", background: "transparent", color: "var(--text-muted)", cursor: "pointer" }}>
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <Button variant="secondary" size="sm" icon="plus" onClick={() => setRows((current) => [...current, freeRow()])}>
              {order ? "Add something not on the order" : "Add part"}
            </Button>
          </div>
          <span style={{ fontSize: "11px", color: "var(--text-muted)", textWrap: "pretty" }}>
            Whole units only, since Inventory counts in whole units. Each line becomes its own batch at the cost entered here.
          </span>
        </Panel>

        <div className="flex min-w-0 flex-col gap-3.5">
          <Panel title="Receipt" icon="file-text">
            <Field label="Supplier" required>
              <select style={SELECT} value={supplierRef} disabled={order !== null} onChange={(event) => setSupplierRef(event.target.value)}>
                <option value="">Pick a supplier</option>
                {suppliers.map((entry) => (
                  <option key={entry.ref} value={entry.ref}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Their receipt or invoice No." hint="Used to warn if the same receipt is entered twice.">
              <input style={INPUT} value={receiptNo} maxLength={40} onChange={(event) => setReceiptNo(event.target.value)} />
            </Field>
            <Field label="Received on" required>
              <input style={INPUT} type="date" max={todayKey} value={receivedDate} onChange={(event) => setReceivedDate(event.target.value)} />
            </Field>
            <Field label="Notes">
              <textarea rows={2} maxLength={600} style={{ ...INPUT, resize: "vertical" }} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </Field>
          </Panel>
        </div>
      </div>
    </div>
  );
}
