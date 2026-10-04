"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ColumnLabel } from "@/components/forms/form-kit";
import { Badge, Button, Icon, SearchInput } from "@/components/ui";
import type { BadgeTone } from "@/components/ui";
import { activateOnKey } from "@/lib/interaction";
import { OPEN_STATUSES, filterOrders } from "@/lib/purchasing";
import { formatPeso } from "@/lib/quotations";
import { RestockModal } from "./restock-modal";
import type { PurchaseOrder, PurchaseOrderStatus, PurchaseOrderStatusFilter, Receipt, RestockSuggestion } from "@/types";

export const ORDER_TONE: Record<PurchaseOrderStatus, BadgeTone> = {
  Draft: "neutral",
  Ordered: "info",
  "Partly received": "warning",
  Received: "positive",
  Cancelled: "neutral",
};

const GRID =
  "grid gap-3 items-center grid-cols-[86px_minmax(140px,1.3fr)_120px_20px] wide:grid-cols-[86px_minmax(170px,1.3fr)_minmax(0,1fr)_120px_130px_120px_22px]";

const SECTION = {
  background: "var(--surface-card)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-card)",
  padding: "12px 12px 10px",
  display: "flex",
  flexDirection: "column" as const,
  gap: "10px",
  minWidth: 0,
};

export function OrdersPanel({
  orders,
  restock,
  inventoryEnabled,
}: {
  orders: PurchaseOrder[];
  restock: RestockSuggestion[];
  inventoryEnabled: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<PurchaseOrderStatusFilter>("Open");
  const [restocking, setRestocking] = useState(false);
  const visible = useMemo(() => filterOrders(orders, { status, search }), [orders, status, search]);
  const lowStock = restock.filter((entry) => !entry.skipped).length;

  const filters: PurchaseOrderStatusFilter[] = ["Open", "All", "Draft", "Ordered", "Partly received", "Received", "Cancelled"];
  const count = (filter: PurchaseOrderStatusFilter) =>
    filter === "All"
      ? orders.length
      : filter === "Open"
        ? orders.filter((order) => OPEN_STATUSES.includes(order.status)).length
        : orders.filter((order) => order.status === filter).length;

  return (
    <>
      <section style={SECTION}>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput placeholder="Search order, supplier, part..." value={search} onChange={setSearch} width={230} />
          <span className="ml-auto flex flex-wrap items-center gap-2">
            {inventoryEnabled && (
              <Button variant="secondary" icon="package" onClick={() => setRestocking(true)}>
                Low stock{lowStock > 0 ? ` (${lowStock})` : ""}
              </Button>
            )}
            <Button variant="secondary" icon="arrow-down" onClick={() => router.push("/suppliers/receive")}>
              Receive without order
            </Button>
            <Button icon="plus" onClick={() => router.push("/suppliers/orders/new")}>
              New order
            </Button>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {filters.map((filter) => {
            const active = status === filter;
            return (
              <button
                key={filter}
                type="button"
                onClick={() => setStatus(filter)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  height: 28,
                  padding: "0 11px",
                  borderRadius: "var(--radius-pill)",
                  border: `1px solid ${active ? "var(--blue-200)" : "var(--border-default)"}`,
                  cursor: "pointer",
                  fontFamily: "var(--font-body)",
                  fontSize: "12px",
                  fontWeight: active ? 700 : 500,
                  color: active ? "var(--blue-600)" : "var(--text-primary)",
                  background: active ? "var(--accent-soft)" : "var(--surface-card)",
                }}
              >
                {filter}
                <span style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{count(filter)}</span>
              </button>
            );
          })}
        </div>

        <div className={GRID} style={{ padding: "0 10px 8px", borderBottom: "1px solid var(--border-subtle)" }}>
          <ColumnLabel>Order</ColumnLabel>
          <ColumnLabel>Supplier</ColumnLabel>
          <ColumnLabel className="hidden wide:block">Parts</ColumnLabel>
          <ColumnLabel className="hidden wide:block">Ordered</ColumnLabel>
          <ColumnLabel>Status</ColumnLabel>
          <ColumnLabel align="right" className="hidden wide:block">
            Expected cost
          </ColumnLabel>
          <span />
        </div>
        <div className="flex flex-col">
          {visible.map((order) => {
            const open = () => router.push(`/suppliers/orders/${encodeURIComponent(order.ref)}`);
            const parts = order.lines.map((line) => line.description).join(", ");
            return (
              <div
                key={order.ref}
                role="link"
                tabIndex={0}
                aria-label={`${order.ref}, ${order.supplierName}, ${order.status}`}
                onClick={open}
                onKeyDown={activateOnKey(open)}
                className={GRID}
                style={{ padding: 10, borderRadius: 10, cursor: "pointer", borderBottom: "1px solid var(--gray-50)" }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "12.5px" }}>{order.ref}</span>
                <span className="flex min-w-0 flex-col leading-tight">
                  <span style={{ fontSize: "12.5px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {order.supplierName}
                  </span>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    {order.lines.length} {order.lines.length === 1 ? "line" : "lines"}
                    {order.origin === "low-stock" ? " · from low stock" : ""}
                  </span>
                </span>
                <span className="hidden wide:block" style={{ fontSize: "12px", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {parts}
                </span>
                <span className="hidden flex-col leading-tight wide:flex">
                  <span style={{ fontSize: "12.5px" }}>{order.orderedDay ?? "Not yet"}</span>
                  {order.expectedDay && order.status !== "Received" && (
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>due {order.expectedDay}</span>
                  )}
                </span>
                <span>
                  <Badge tone={ORDER_TONE[order.status]}>{order.closedShort ? "Closed short" : order.status}</Badge>
                </span>
                <span className="hidden wide:block" style={{ fontSize: "12.5px", fontWeight: 600, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {formatPeso(order.expectedTotalCents)}
                </span>
                <span style={{ color: "var(--text-muted)", display: "inline-flex", justifyContent: "flex-end" }}>
                  <Icon name="chevron-right" size={15} />
                </span>
              </div>
            );
          })}
          {visible.length === 0 && (
            <div style={{ padding: "30px 10px", textAlign: "center", fontSize: "12.5px", color: "var(--text-muted)" }}>
              {orders.length === 0 ? "No purchase orders yet." : "No orders match."}
            </div>
          )}
        </div>
      </section>
      {restocking && <RestockModal suggestions={restock} onClose={() => setRestocking(false)} />}
    </>
  );
}

const RECEIPT_GRID =
  "grid gap-3 items-center grid-cols-[86px_minmax(140px,1.3fr)_110px_20px] wide:grid-cols-[86px_minmax(170px,1.3fr)_110px_100px_120px_110px_22px]";

export function ReceiptsPanel({ receipts }: { receipts: Receipt[] }) {
  const router = useRouter();
  return (
    <section style={SECTION}>
      <div className="flex items-center gap-2">
        <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
          Goods received, newest first. Each line went into Inventory as a batch and updated the supplier&apos;s cost.
        </span>
        <span className="ml-auto">
          <Button variant="secondary" icon="arrow-down" onClick={() => router.push("/suppliers/receive")}>
            Receive goods
          </Button>
        </span>
      </div>
      <div className={RECEIPT_GRID} style={{ padding: "0 10px 8px", borderBottom: "1px solid var(--border-subtle)" }}>
        <ColumnLabel>Receipt</ColumnLabel>
        <ColumnLabel>Supplier</ColumnLabel>
        <ColumnLabel className="hidden wide:block">Their No.</ColumnLabel>
        <ColumnLabel className="hidden wide:block">Order</ColumnLabel>
        <ColumnLabel>Received</ColumnLabel>
        <ColumnLabel align="right" className="hidden wide:block">
          Total
        </ColumnLabel>
        <span />
      </div>
      <div className="flex flex-col">
        {receipts.map((receipt) => {
          const open = () => router.push(`/suppliers/receipts/${encodeURIComponent(receipt.ref)}`);
          return (
            <div
              key={receipt.ref}
              role="link"
              tabIndex={0}
              aria-label={`${receipt.ref}, ${receipt.supplierName}`}
              onClick={open}
              onKeyDown={activateOnKey(open)}
              className={RECEIPT_GRID}
              style={{ padding: 10, borderRadius: 10, cursor: "pointer", borderBottom: "1px solid var(--gray-50)" }}
            >
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "12.5px" }}>{receipt.ref}</span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span style={{ fontSize: "12.5px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {receipt.supplierName}
                </span>
                <span style={{ fontSize: "11px", color: receipt.status === "Posting" ? "var(--status-warning)" : "var(--text-muted)" }}>
                  {receipt.status === "Posting" ? "Not finished posting" : `${receipt.lines.length} ${receipt.lines.length === 1 ? "line" : "lines"}`}
                </span>
              </span>
              <span className="hidden wide:block" style={{ fontSize: "12.5px" }}>
                {receipt.receiptNo || "—"}
              </span>
              <span className="hidden wide:block" style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                {receipt.purchaseOrderRef ?? "—"}
              </span>
              <span style={{ fontSize: "12.5px" }}>{receipt.receivedDay}</span>
              <span className="hidden wide:block" style={{ fontSize: "12.5px", fontWeight: 600, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {formatPeso(receipt.totalCents)}
              </span>
              <span style={{ color: "var(--text-muted)", display: "inline-flex", justifyContent: "flex-end" }}>
                <Icon name="chevron-right" size={15} />
              </span>
            </div>
          );
        })}
        {receipts.length === 0 && (
          <div style={{ padding: "30px 10px", textAlign: "center", fontSize: "12.5px", color: "var(--text-muted)" }}>
            Nothing received yet.
          </div>
        )}
      </div>
    </section>
  );
}
