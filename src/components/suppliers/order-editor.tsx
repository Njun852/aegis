"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  cancelOrderAction,
  closeOrderShortAction,
  markOrderedAction,
  saveOrderAction,
} from "@/app/actions/purchasing";
import { CELL, ColumnLabel, Field, INPUT, Modal, NUMBER_CELL, Notice, Panel, SELECT } from "@/components/forms/form-kit";
import { useToast } from "@/components/layout/toast-provider";
import { Badge, Button, Icon } from "@/components/ui";
import { ORDER_CHANNELS, addDaysToKey, outstanding } from "@/lib/purchasing";
import { amountInput, descriptionKey, formatAmount, formatPeso, newLineId, parseAmount } from "@/lib/quotations";
import { ORDER_TONE } from "./orders-panel";
import type { InventoryOption, OrderChannel, PurchaseOrder, Supplier, SupplierItem } from "@/types";

export interface OrderEditorProps {
  order: PurchaseOrder | null;
  suppliers: Supplier[];
  supplierItems: SupplierItem[];
  inventory: InventoryOption[];
  inventoryEnabled: boolean;
  /** Pre-selected supplier for a new order, from `?supplier=`. */
  defaultSupplierRef: string | null;
  /** Today in Manila, "2026-10-04". */
  todayKey: string;
}

interface DraftLine {
  id: string;
  description: string;
  sku: string;
  unit: string;
  qtyText: string;
  costText: string;
  qtyReceived: number;
  qtyOrdered: number;
}

const GRID = "grid items-center gap-2 grid-cols-[minmax(180px,1.5fr)_minmax(140px,1fr)_70px_64px_110px_110px_28px]";

function blank(): DraftLine {
  return { id: newLineId(), description: "", sku: "", unit: "", qtyText: "1", costText: "", qtyReceived: 0, qtyOrdered: 0 };
}

export function OrderEditor({
  order,
  suppliers,
  supplierItems,
  inventory,
  inventoryEnabled,
  defaultSupplierRef,
  todayKey,
}: OrderEditorProps) {
  const router = useRouter();
  const toast = useToast();
  const [supplierRef, setSupplierRef] = useState(order?.supplierRef ?? defaultSupplierRef ?? "");
  const [notes, setNotes] = useState(order?.notes ?? "");
  const [expectedDate, setExpectedDate] = useState(order?.expectedDate ?? "");
  const [lines, setLines] = useState<DraftLine[]>(() =>
    order
      ? order.lines.map((line) => ({
          id: line.id,
          description: line.description,
          sku: line.sku ?? "",
          unit: line.unit,
          qtyText: String(line.qtyOrdered),
          costText: amountInput(line.expectedCostCents),
          qtyReceived: line.qtyReceived,
          qtyOrdered: line.qtyOrdered,
        }))
      : [blank()],
  );
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [pending, startTransition] = useTransition();

  const status = order?.status ?? "Draft";
  const received = (order?.lines ?? []).some((line) => line.qtyReceived > 0);
  const linesLocked = received || status === "Cancelled" || status === "Received";
  const finished = status === "Cancelled" || status === "Received";
  const supplier = suppliers.find((entry) => entry.ref === supplierRef) ?? null;
  const priceBook = useMemo(() => supplierItems.filter((item) => item.supplierRef === supplierRef), [supplierItems, supplierRef]);

  const change = (id: string, patch: Partial<DraftLine>) => {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
    setDirty(true);
  };

  /** Picking a part this supplier sells fills the item, unit and cost from their price book. */
  const setDescription = (line: DraftLine, description: string) => {
    const match = priceBook.find((item) => descriptionKey(item.description) === descriptionKey(description));
    change(line.id, {
      description,
      ...(match
        ? {
            sku: match.sku ?? line.sku,
            unit: line.unit || match.unit,
            costText: line.costText || amountInput(match.costCents),
          }
        : {}),
    });
  };

  const setItem = (line: DraftLine, sku: string) => {
    const item = inventory.find((entry) => entry.sku === sku);
    const book = priceBook.find((entry) => entry.sku === sku);
    change(line.id, {
      sku,
      description: line.description || book?.description || item?.name || "",
      unit: line.unit || book?.unit || item?.unit || "",
      costText: line.costText || (book ? amountInput(book.costCents) : ""),
    });
  };

  const total = lines.reduce((sum, line) => {
    const qty = Number(line.qtyText);
    const cost = parseAmount(line.costText);
    return Number.isInteger(qty) && typeof cost === "number" ? sum + qty * cost : sum;
  }, 0);

  const save = (): Promise<string | null> =>
    new Promise((resolve) => {
      setError(null);
      const parsed = lines
        .filter((line) => line.description.trim() || line.sku)
        .map((line) => ({
          id: line.id,
          description: line.description,
          sku: line.sku || null,
          unit: line.unit,
          qtyOrdered: Number(line.qtyText),
          expectedCostCents: parseAmount(line.costText) ?? 0,
        }));
      const bad = parsed.find((line) => !Number.isInteger(line.qtyOrdered) || line.qtyOrdered < 1);
      if (bad) {
        setError(`${bad.description || "A line"}: the quantity must be a whole number of units.`);
        resolve(null);
        return;
      }
      startTransition(async () => {
        const result = await saveOrderAction(order?.ref ?? null, { supplierRef, notes, expectedDate, lines: parsed });
        if (!result.ok) {
          setError(result.error);
          toast({ tone: "error", title: "Order not saved", description: result.error, key: "order-save" });
          resolve(null);
          return;
        }
        setDirty(false);
        toast({ tone: "success", title: order ? `${result.ref} saved` : `${result.ref} created`, key: "order-save" });
        if (order) router.refresh();
        else router.replace(`/suppliers/orders/${result.ref}`);
        resolve(result.ref);
      });
    });

  const act = (work: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        toast({ tone: "error", title: "Not done", description: result.error, key: "order-act" });
        return;
      }
      toast({ tone: "success", title: success, key: "order-act" });
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/suppliers?tab=orders" className="inline-flex items-center gap-1.5" style={{ fontSize: "12.5px", color: "var(--text-secondary)", textDecoration: "none" }}>
          <Icon name="arrow-left" size={14} />
          Purchase orders
        </Link>
        <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "22px", lineHeight: "28px", fontWeight: 700, letterSpacing: "-.02em" }}>
          {order ? order.ref : "New purchase order"}
        </h2>
        {order && <Badge tone={ORDER_TONE[status]}>{order.closedShort ? "Closed short" : status}</Badge>}
        {dirty && <span style={{ fontSize: "12px", color: "var(--status-warning)" }}>Unsaved changes</span>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {order && status === "Draft" && (
            <Button variant="ghost" onClick={() => {
              if (window.confirm(`Cancel ${order.ref}?`)) act(() => cancelOrderAction(order.ref), `${order.ref} cancelled`);
            }} disabled={pending}>
              Cancel order
            </Button>
          )}
          {order && status === "Ordered" && !received && (
            <Button variant="ghost" onClick={() => {
              if (window.confirm(`Cancel ${order.ref}? Tell ${order.supplierName} too; AEGIS does not contact suppliers.`)) {
                act(() => cancelOrderAction(order.ref), `${order.ref} cancelled`);
              }
            }} disabled={pending}>
              Cancel order
            </Button>
          )}
          {order && status === "Partly received" && (
            <Button variant="ghost" onClick={() => {
              if (window.confirm(`Close ${order.ref} without the rest? What is still outstanding will not be expected any more.`)) {
                act(() => closeOrderShortAction(order.ref), `${order.ref} closed short`);
              }
            }} disabled={pending}>
              Close the rest
            </Button>
          )}
          {order && status === "Draft" && (
            <Button variant="secondary" icon="send" onClick={async () => {
              if (dirty && !(await save())) return;
              setPlacing(true);
            }} disabled={pending}>
              Mark as ordered
            </Button>
          )}
          {order && (status === "Ordered" || status === "Partly received") && (
            <Button variant="secondary" icon="arrow-down" onClick={() => router.push(`/suppliers/receive?po=${encodeURIComponent(order.ref)}`)}>
              Receive goods
            </Button>
          )}
          {!finished && (order && !dirty && !pending ? (
            <Button variant="secondary" icon="check" disabled>
              Saved
            </Button>
          ) : (
            <Button icon="check" onClick={() => void save()} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          ))}
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {status === "Draft" && order && (
        <Notice tone="info">
          A draft is a record only. Place the order with {order.supplierName} by phone, Messenger or in person, then
          mark it ordered here.
        </Notice>
      )}

      <div className="grid gap-3.5 wide:grid-cols-[minmax(0,1fr)_300px]">
        <Panel title="Parts" icon="package" action={<span style={{ fontSize: "12.5px", fontWeight: 600 }}>{formatPeso(total)}</span>}>
          <datalist id="order-price-book">
            {priceBook.map((item) => (
              <option key={item.ref} value={item.description} label={formatAmount(item.costCents)} />
            ))}
          </datalist>
          <div className="overflow-x-auto">
            <div className="flex min-w-[720px] flex-col gap-1.5">
              <div className={GRID} style={{ padding: "0 2px 6px", borderBottom: "1px solid var(--border-subtle)" }}>
                <ColumnLabel>Description</ColumnLabel>
                <ColumnLabel>{inventoryEnabled ? "Inventory item" : ""}</ColumnLabel>
                <ColumnLabel align="right">{status === "Draft" ? "Qty" : "Got / Qty"}</ColumnLabel>
                <ColumnLabel>Unit</ColumnLabel>
                <ColumnLabel align="right">Expected cost</ColumnLabel>
                <ColumnLabel align="right">Line total</ColumnLabel>
                <span />
              </div>
              {lines.map((line) => {
                const qty = Number(line.qtyText);
                const cost = parseAmount(line.costText);
                const lineTotal = Number.isInteger(qty) && typeof cost === "number" ? qty * cost : null;
                const left = outstanding({ qtyOrdered: line.qtyOrdered, qtyReceived: line.qtyReceived });
                return (
                  <div key={line.id} className={GRID} style={{ padding: "0 2px" }}>
                    <input aria-label="Description" style={CELL} list="order-price-book" value={line.description} disabled={linesLocked} maxLength={160} placeholder="Part as the supplier sells it" onChange={(event) => setDescription(line, event.target.value)} />
                    {inventoryEnabled ? (
                      <select aria-label="Inventory item" style={{ ...SELECT, ...CELL, paddingRight: 28 }} value={line.sku} disabled={linesLocked} onChange={(event) => setItem(line, event.target.value)}>
                        <option value="">New item, created on receipt</option>
                        {inventory.map((option) => (
                          <option key={option.sku} value={option.sku}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span />
                    )}
                    {received || status === "Received" ? (
                      <span style={{ ...NUMBER_CELL, border: "1px solid transparent", color: left > 0 ? "var(--status-warning)" : "var(--status-positive)" }}>
                        {line.qtyReceived} / {line.qtyOrdered}
                      </span>
                    ) : (
                      <input aria-label="Quantity" style={NUMBER_CELL} inputMode="numeric" value={line.qtyText} disabled={linesLocked} onChange={(event) => change(line.id, { qtyText: event.target.value })} />
                    )}
                    <input aria-label="Unit" style={CELL} value={line.unit} disabled={linesLocked} maxLength={20} onChange={(event) => change(line.id, { unit: event.target.value })} />
                    <input aria-label="Expected cost" style={NUMBER_CELL} inputMode="decimal" value={line.costText} disabled={linesLocked} placeholder="0.00" onChange={(event) => change(line.id, { costText: event.target.value })} />
                    <span style={{ ...NUMBER_CELL, border: "1px solid transparent", background: "var(--surface-inset)" }}>
                      {lineTotal === null ? "-" : formatAmount(lineTotal)}
                    </span>
                    {linesLocked ? (
                      <span />
                    ) : (
                      <button type="button" aria-label="Remove line" onClick={() => {
                        setLines((current) => (current.length > 1 ? current.filter((entry) => entry.id !== line.id) : [blank()]));
                        setDirty(true);
                      }} style={{ width: 28, height: 31, border: "none", background: "transparent", color: "var(--text-muted)", cursor: "pointer" }}>
                        <Icon name="x" size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {!linesLocked && (
            <div>
              <Button variant="secondary" size="sm" icon="plus" onClick={() => {
                setLines((current) => [...current, blank()]);
                setDirty(true);
              }}>
                Add part
              </Button>
            </div>
          )}
          {linesLocked && !finished && (
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              Lines are fixed once goods arrive against the order, so it stays a true record of what was asked for.
            </span>
          )}
        </Panel>

        <div className="flex min-w-0 flex-col gap-3.5">
          <Panel title="Supplier" icon="truck">
            <select style={SELECT} value={supplierRef} disabled={linesLocked} onChange={(event) => {
              setSupplierRef(event.target.value);
              setDirty(true);
            }}>
              <option value="">Pick a supplier</option>
              {suppliers.map((entry) => (
                <option key={entry.ref} value={entry.ref} disabled={!entry.active}>
                  {entry.name}
                  {entry.active ? "" : " (no longer used)"}
                </option>
              ))}
            </select>
            {supplier && (
              <span style={{ fontSize: "11.5px", color: "var(--text-secondary)" }}>
                {[supplier.contactPerson, supplier.phone, supplier.terms && `Terms: ${supplier.terms}`].filter(Boolean).join(" · ") || "No contact details yet."}
                {priceBook.length > 0 && ` · ${priceBook.length} parts in their price book`}
              </span>
            )}
          </Panel>
          <Panel title="Details" icon="calendar">
            {order?.orderedDay && (
              <span style={{ fontSize: "12.5px" }}>
                Ordered {order.orderedDay}
                {order.orderedVia ? ` by ${order.orderedVia.toLowerCase()}` : ""}
              </span>
            )}
            <Field label="Expected delivery">
              <input style={INPUT} type="date" value={expectedDate} disabled={finished} onChange={(event) => {
                setExpectedDate(event.target.value);
                setDirty(true);
              }} />
            </Field>
            <Field label="Notes">
              <textarea rows={3} maxLength={600} style={{ ...INPUT, resize: "vertical" }} value={notes} disabled={finished} onChange={(event) => {
                setNotes(event.target.value);
                setDirty(true);
              }} />
            </Field>
            {order && order.receipts.length > 0 && (
              <div className="flex flex-col gap-1">
                <span style={{ fontSize: "11.5px", fontWeight: 600 }}>Received on</span>
                {order.receipts.map((receipt) => (
                  <Link key={receipt.ref} href={`/suppliers/receipts/${receipt.ref}`} style={{ fontSize: "12px", color: "var(--text-accent)" }}>
                    {receipt.ref} · {receipt.day}
                    {receipt.receiptNo ? ` · No. ${receipt.receiptNo}` : ""}
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>

      {placing && order && (
        <PlaceOrderModal
          order={order}
          todayKey={todayKey}
          defaultExpected={supplier?.leadTimeDays != null ? addDaysToKey(todayKey, supplier.leadTimeDays) : expectedDate}
          onClose={() => setPlacing(false)}
          onPlaced={() => {
            setPlacing(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function PlaceOrderModal({
  order,
  todayKey,
  defaultExpected,
  onClose,
  onPlaced,
}: {
  order: PurchaseOrder;
  todayKey: string;
  defaultExpected: string;
  onClose: () => void;
  onPlaced: () => void;
}) {
  const toast = useToast();
  const [via, setVia] = useState<OrderChannel>("Phone");
  const [orderedDate, setOrderedDate] = useState(todayKey);
  const [expected, setExpected] = useState(defaultExpected);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      const result = await markOrderedAction(order.ref, { via, orderedDate, expectedDate: expected });
      if (!result.ok) {
        setError(result.error);
        toast({ tone: "error", title: "Not marked ordered", description: result.error });
        return;
      }
      toast({ tone: "success", title: `${order.ref} marked as ordered`, description: `With ${order.supplierName} by ${via.toLowerCase()}.` });
      onPlaced();
    });

  return (
    <Modal
      title={`Mark ${order.ref} as ordered`}
      icon="send"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button icon="check" onClick={confirm} disabled={pending}>
            {pending ? "Saving…" : "Mark as ordered"}
          </Button>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      <span style={{ fontSize: "12.5px", color: "var(--text-secondary)" }}>
        Record how and when the order was placed with {order.supplierName}. AEGIS does not send it.
      </span>
      <Field label="Placed by">
        <select style={SELECT} value={via} onChange={(event) => setVia(event.target.value as OrderChannel)}>
          {ORDER_CHANNELS.map((channel) => (
            <option key={channel}>{channel}</option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ordered on">
          <input style={INPUT} type="date" max={todayKey} value={orderedDate} onChange={(event) => setOrderedDate(event.target.value)} />
        </Field>
        <Field label="Expected delivery">
          <input style={INPUT} type="date" value={expected} onChange={(event) => setExpected(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
