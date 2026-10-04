"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { draftRestockOrdersAction } from "@/app/actions/purchasing";
import { Modal, Notice } from "@/components/forms/form-kit";
import { useToast } from "@/components/layout/toast-provider";
import { Button } from "@/components/ui";
import { formatPeso } from "@/lib/quotations";
import type { RestockSuggestion } from "@/types";

/**
 * Items at or below their reorder point, with how many to order and from
 * whom. Creates drafts only, one per supplier; nothing is ordered until a
 * person places the order and marks it ordered.
 */
export function RestockModal({ suggestions, onClose }: { suggestions: RestockSuggestion[]; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const orderable = suggestions.filter((entry) => !entry.skipped);
  const skipped = suggestions.filter((entry) => entry.skipped);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(orderable.map((entry) => entry.sku)));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const suppliers = new Set(orderable.filter((entry) => picked.has(entry.sku)).map((entry) => entry.supplierRef));

  const toggle = (sku: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });

  const create = () => {
    setError(null);
    startTransition(async () => {
      const result = await draftRestockOrdersAction([...picked]);
      if (!result.ok) {
        setError(result.error);
        toast({ tone: "error", title: "No orders drafted", description: result.error });
        return;
      }
      toast({
        tone: "success",
        title: `${result.refs.length} draft ${result.refs.length === 1 ? "order" : "orders"} created`,
        description: `${result.refs.join(", ")}. Check each, place it, then mark it ordered.`,
      });
      router.refresh();
      onClose();
    });
  };

  return (
    <Modal
      title="Reorder low stock"
      icon="package"
      onClose={onClose}
      width={640}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button icon="check" onClick={create} disabled={pending || picked.size === 0}>
            {pending ? "Drafting…" : `Draft ${suppliers.size} ${suppliers.size === 1 ? "order" : "orders"}`}
          </Button>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      {suggestions.length === 0 ? (
        <span style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>Nothing is at or below its reorder point.</span>
      ) : (
        <>
          <span style={{ fontSize: "12.5px", color: "var(--text-secondary)", textWrap: "pretty" }}>
            Quantities bring each item back to its target, less what is already on open orders. Suppliers come from the
            price book: the preferred one, else the most recently costed.
          </span>
          <div className="flex flex-col" style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)" }}>
            {orderable.map((entry) => (
              <label
                key={entry.sku}
                className="flex items-center gap-2.5"
                style={{ padding: "9px 12px", borderBottom: "1px solid var(--gray-50)", fontSize: "12.5px", cursor: "pointer" }}
              >
                <input type="checkbox" checked={picked.has(entry.sku)} onChange={() => toggle(entry.sku)} />
                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
                  <span style={{ fontWeight: 600 }}>{entry.name}</span>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    {entry.onHand} on hand · reorder at {entry.reorder} · target {entry.target}
                  </span>
                </span>
                <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.3 }}>
                  <span style={{ fontWeight: 600 }}>
                    Order {entry.qty} {entry.unit}
                  </span>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    {entry.supplierName}
                    {entry.costCents !== null ? ` · ${formatPeso(entry.costCents)} each` : ""}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {skipped.length > 0 && (
            <div className="flex flex-col gap-1">
              <span style={{ fontSize: "12px", fontWeight: 600 }}>Not included</span>
              {skipped.map((entry) => (
                <span key={entry.sku} style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                  {entry.name}: {entry.skipped}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
