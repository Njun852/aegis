"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { postReceiptAction } from "@/app/actions/purchasing";
import { ColumnLabel, Notice, Panel } from "@/components/forms/form-kit";
import { useToast } from "@/components/layout/toast-provider";
import { Badge, Button, Icon } from "@/components/ui";
import { variancePercent } from "@/lib/purchasing";
import { formatAmount, formatPeso } from "@/lib/quotations";
import type { Receipt } from "@/types";

const GRID = "grid items-center gap-3 grid-cols-[minmax(170px,1.5fr)_70px_110px_110px_90px_100px]";

export function ReceiptView({ receipt }: { receipt: Receipt }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const finish = () =>
    startTransition(async () => {
      const result = await postReceiptAction(receipt.ref);
      if (!result.ok) {
        toast({ tone: "error", title: "Not finished", description: result.error, key: "receipt-post" });
        return;
      }
      toast({ tone: "success", title: `${receipt.ref} posted`, description: "Every line is now in stock.", key: "receipt-post" });
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/suppliers?tab=receipts" className="inline-flex items-center gap-1.5" style={{ fontSize: "12.5px", color: "var(--text-secondary)", textDecoration: "none" }}>
          <Icon name="arrow-left" size={14} />
          Receipts
        </Link>
        <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "22px", lineHeight: "28px", fontWeight: 700, letterSpacing: "-.02em" }}>
          {receipt.ref}
        </h2>
        <Badge tone={receipt.status === "Posted" ? "positive" : "warning"}>{receipt.status}</Badge>
        {receipt.status === "Posting" && (
          <span className="ml-auto">
            <Button icon="refresh-cw" onClick={finish} disabled={pending}>
              {pending ? "Posting…" : "Finish posting"}
            </Button>
          </span>
        )}
      </div>

      {receipt.status === "Posting" && (
        <Notice tone="warning">
          Posting this receipt was interrupted. Lines with a batch are already in stock; Finish posting adds the rest and
          never adds a line twice.
        </Notice>
      )}

      <Panel title={receipt.supplierName} icon="truck">
        <div className="flex flex-wrap gap-x-6 gap-y-1" style={{ fontSize: "12.5px" }}>
          <span>Received {receipt.receivedDay}</span>
          {receipt.receiptNo && <span>Their No. {receipt.receiptNo}</span>}
          {receipt.purchaseOrderRef && (
            <Link href={`/suppliers/orders/${receipt.purchaseOrderRef}`} style={{ color: "var(--text-accent)" }}>
              Against {receipt.purchaseOrderRef}
            </Link>
          )}
          {!receipt.stocked && <span style={{ color: "var(--text-muted)" }}>Costs only, no stock moved</span>}
        </div>
        {receipt.notes && <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{receipt.notes}</span>}

        <div className="overflow-x-auto">
          <div className="flex min-w-[660px] flex-col">
            <div className={GRID} style={{ padding: "0 4px 8px", borderBottom: "1px solid var(--border-subtle)" }}>
              <ColumnLabel>Part</ColumnLabel>
              <ColumnLabel align="right">Qty</ColumnLabel>
              <ColumnLabel align="right">Cost each</ColumnLabel>
              <ColumnLabel align="right">Total</ColumnLabel>
              <ColumnLabel align="right">vs expected</ColumnLabel>
              <ColumnLabel>Batch</ColumnLabel>
            </div>
            {receipt.lines.map((line) => {
              const change = variancePercent(line.unitCostCents, line.expectedCostCents);
              return (
                <div key={line.id} className={GRID} style={{ padding: "9px 4px", borderBottom: "1px solid var(--gray-50)" }}>
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span style={{ fontSize: "12.5px", fontWeight: 500 }}>{line.description}</span>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{line.sku ?? "Not linked to Inventory"}</span>
                  </span>
                  <span style={{ fontSize: "12.5px", textAlign: "right" }}>
                    {line.qty} {line.unit}
                  </span>
                  <span style={{ fontSize: "12.5px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatAmount(line.unitCostCents)}</span>
                  <span style={{ fontSize: "12.5px", fontWeight: 600, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {formatAmount(line.qty * line.unitCostCents)}
                  </span>
                  <span
                    title={line.expectedCostCents !== null ? `Expected ${formatAmount(line.expectedCostCents)}` : undefined}
                    style={{ fontSize: "12px", textAlign: "right", color: change === null || change === 0 ? "var(--text-muted)" : change > 0 ? "var(--status-negative)" : "var(--status-positive)" }}
                  >
                    {change === null ? "—" : change === 0 ? "as expected" : `${change > 0 ? "+" : ""}${change}%`}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px", color: line.moveRef ? "var(--text-primary)" : "var(--status-warning)" }}>
                    {line.batchRef ?? (line.moveRef === "cost-only" ? "cost only" : line.moveRef ? line.moveRef : "not yet")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap items-baseline justify-end gap-6" style={{ fontSize: "12.5px" }}>
          {receipt.varianceCents !== 0 && (
            <span style={{ color: receipt.varianceCents > 0 ? "var(--status-negative)" : "var(--status-positive)" }}>
              {receipt.varianceCents > 0 ? "Cost " : "Saved "}
              {formatPeso(Math.abs(receipt.varianceCents))} {receipt.varianceCents > 0 ? "more than expected" : "against expected"}
            </span>
          )}
          <span style={{ fontWeight: 700 }}>Total {formatPeso(receipt.totalCents)}</span>
        </div>
      </Panel>
    </div>
  );
}
