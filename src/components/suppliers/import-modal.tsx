"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { importSuppliersAction } from "@/app/actions/suppliers";
import { Modal, Notice } from "@/components/forms/form-kit";
import { useToast } from "@/components/layout/toast-provider";
import { Button } from "@/components/ui";
import type { SupplierImportCandidate } from "@/types";

/**
 * Turns the supplier names already typed into Inventory into supplier
 * records. Nothing is created until a person ticks the names and confirms:
 * some may be seed data or typos.
 */
export function ImportModal({ candidates, onClose }: { candidates: SupplierImportCandidate[]; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [picked, setPicked] = useState<Set<string>>(() => new Set(candidates.map((candidate) => candidate.name)));
  const [withItems, setWithItems] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (name: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await importSuppliersAction([...picked], withItems);
      if (!result.ok) {
        setError(result.error);
        toast({ tone: "error", title: "Nothing added", description: result.error });
        return;
      }
      toast({
        tone: "success",
        title: `${result.suppliers} ${result.suppliers === 1 ? "supplier" : "suppliers"} added`,
        description: withItems ? `${result.items} parts went into their price books at the current Inventory cost.` : undefined,
      });
      router.refresh();
      onClose();
    });
  };

  return (
    <Modal
      title="Suppliers from Inventory"
      icon="package"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button icon="check" onClick={confirm} disabled={pending || picked.size === 0}>
            {pending ? "Adding…" : `Add ${picked.size} ${picked.size === 1 ? "supplier" : "suppliers"}`}
          </Button>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      <span style={{ fontSize: "12.5px", color: "var(--text-secondary)", textWrap: "pretty" }}>
        These names are typed on Inventory items but have no supplier record. Untick any that are typos or sample
        data. Contact details can be added afterwards.
      </span>
      <div className="flex flex-col" style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)" }}>
        {candidates.map((candidate) => (
          <label
            key={candidate.name}
            className="flex items-center gap-2.5"
            style={{ padding: "9px 12px", borderBottom: "1px solid var(--gray-50)", fontSize: "12.5px", cursor: "pointer" }}
          >
            <input type="checkbox" checked={picked.has(candidate.name)} onChange={() => toggle(candidate.name)} />
            <span style={{ flex: 1, fontWeight: 500 }}>{candidate.name}</span>
            <span style={{ color: "var(--text-muted)" }}>
              {candidate.itemCount} {candidate.itemCount === 1 ? "item" : "items"}
            </span>
          </label>
        ))}
      </div>
      <label className="flex items-start gap-2.5" style={{ fontSize: "12.5px", cursor: "pointer" }}>
        <input type="checkbox" checked={withItems} onChange={(event) => setWithItems(event.target.checked)} style={{ marginTop: 2 }} />
        <span style={{ textWrap: "pretty" }}>
          Also put each supplier&apos;s Inventory items in their price book, at the current average cost, so the cost
          comparison starts filled in.
        </span>
      </label>
    </Modal>
  );
}
