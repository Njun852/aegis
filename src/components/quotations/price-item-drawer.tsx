"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { deletePriceItemAction, updatePriceItemAction } from "@/app/actions/quotations";
import { useToast } from "@/components/layout/toast-provider";
import { Button, Icon, SearchInput } from "@/components/ui";
import {
  amountInput,
  formatAmount,
  formatPeso,
  parseAmount,
  priceFromCost,
} from "@/lib/quotations";
import { CELL, Field, NUMBER_CELL, Notice } from "@/components/forms/form-kit";
import type { PriceItemUse, QuotePriceItem } from "@/types";

export function marginOf(item: Pick<QuotePriceItem, "unitPriceCents" | "costCents">): number | null {
  return item.costCents !== null && item.costCents > 0
    ? Math.round(((item.unitPriceCents - item.costCents) / item.costCents) * 100)
    : null;
}

/** What one line sold for, cost and made over every job it went on. */
export function usesTotals(uses: PriceItemUse[]) {
  let qty = 0;
  let sold = 0;
  let cost = 0;
  let costedSold = 0;
  for (const use of uses) {
    qty += use.qty;
    sold += use.amountCents;
    if (use.costCents !== null) {
      cost += use.costCents;
      costedSold += use.amountCents;
    }
  }
  return { qty: Math.round(qty * 100) / 100, sold, cost, profit: costedSold - cost, costed: costedSold > 0 };
}


/**
 * A price list line's panel: its price and cost, editable here, then every
 * job it was used on, newest first. Only the middle scrolls, so the header
 * and the buttons stay in place however many jobs there are.
 */
export function PriceItemDrawer({
  item,
  uses,
  markupPercent,
  onClose,
  crmEnabled = false,
  onOpenSupplier,
  children,
}: {
  item: QuotePriceItem;
  uses: PriceItemUse[];
  markupPercent: number;
  onClose: () => void;
  /** Customers with a CRM record link to it. */
  crmEnabled?: boolean;
  /** Opens a supplier the part was bought from, where suppliers can be opened. */
  onOpenSupplier?: (ref: string) => void;
  /** Shown under the price and cost: the Suppliers screen puts what each supplier charges here. */
  children?: ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [unit, setUnit] = useState(item.unit);
  const [price, setPrice] = useState(amountInput(item.unitPriceCents));
  const [cost, setCost] = useState(amountInput(item.costCents));
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  const term = search.trim().toLowerCase();
  const shown = term
    ? uses.filter((use) => [use.customer, use.company, use.phone, use.plate, use.makeModel, use.jobOrderRef, use.boughtFrom].some((value) => value.toLowerCase().includes(term)))
    : uses;
  const totals = usesTotals(uses);
  const margin = marginOf(item);

  const save = () => {
    const priceCents = parseAmount(price);
    const costCents = parseAmount(cost);
    if (typeof priceCents !== "number") {
      setError("Enter a price.");
      return;
    }
    if (costCents === undefined) {
      setError("The cost is not an amount.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updatePriceItemAction(item.section, item.description, { unit, unitPriceCents: priceCents, costCents });
      if (!result.ok) {
        toast({ tone: "error", title: "Price not saved", description: result.error });
        return;
      }
      toast({ tone: "success", title: "Price list updated", description: `${item.description}: ${formatAmount(priceCents)}` });
      setEditing(false);
      router.refresh();
    });
  };

  const remove = () => {
    if (!window.confirm(`Remove “${item.description}” from the price list? Saved quotations and job orders keep their lines.`)) return;
    startTransition(async () => {
      const result = await deletePriceItemAction(item.section, item.description);
      if (!result.ok) {
        toast({ tone: "error", title: "Not removed", description: result.error });
        return;
      }
      toast({ tone: "success", title: "Removed from the price list", description: item.description });
      onClose();
      router.refresh();
    });
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(23,28,37,.18)" }} />
      <aside
        role="dialog"
        aria-label={item.description}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 480,
          maxWidth: "94vw",
          zIndex: 71,
          background: "var(--surface-card)",
          borderLeft: "1px solid var(--border-default)",
          boxShadow: "var(--shadow-popover)",
          display: "flex",
          flexDirection: "column",
          fontFamily: "var(--font-body)",
          color: "var(--text-primary)",
        }}
      >
        {/* Header: what the line is. */}
        <div className="flex items-start gap-3" style={{ flex: "0 0 auto", padding: "16px", borderBottom: "1px solid var(--border-subtle)" }}>
          <span
            style={{
              width: 38,
              height: 38,
              flex: "0 0 auto",
              borderRadius: "10px",
              background: "var(--surface-inset)",
              color: "var(--text-secondary)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name={item.section === "parts" ? "package" : "wrench"} size={18} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "16px", fontWeight: 700, letterSpacing: "-.015em", overflowWrap: "anywhere" }}>
              {item.description}
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              {item.section === "parts" ? "Part" : "Labor"}
              {item.unit ? ` · per ${item.unit}` : ""} · quoted {item.useCount}× · last {item.lastUsedDay}
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              background: "transparent",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              color: "var(--text-secondary)",
            }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Body: the only part that scrolls. */}
        <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
          {editing ? (
            <div className="flex flex-col gap-2.5">
              <div className="grid grid-cols-3 gap-2.5">
                <Field label="Unit">
                  <input aria-label="Unit" style={CELL} value={unit} maxLength={20} onChange={(event) => setUnit(event.target.value)} />
                </Field>
                <Field label="Price">
                  <input aria-label="Price" style={NUMBER_CELL} inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} />
                </Field>
                <Field label="Cost (internal)">
                  <input
                    aria-label="Cost"
                    style={{ ...NUMBER_CELL, borderStyle: "dashed" }}
                    inputMode="decimal"
                    placeholder="—"
                    value={cost}
                    onChange={(event) => setCost(event.target.value)}
                  />
                </Field>
              </div>
              {error ? (
                <Notice tone="error">{error}</Notice>
              ) : (
                <span style={{ fontSize: "11px", color: "var(--text-muted)", textWrap: "pretty" }}>
                  Applies to quotations started from now on. At {markupPercent}% markup, a cost of 1,000.00 is offered at{" "}
                  {formatAmount(priceFromCost(100_000, markupPercent))}.
                </span>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2.5">
              <Stat label="Price" value={formatAmount(item.unitPriceCents)} />
              <Stat
                label="Cost"
                value={item.costCents === null ? "—" : formatAmount(item.costCents)}
                sub={margin === null ? undefined : `${margin >= 0 ? "+" : ""}${margin}% markup`}
              />
              <Stat label="Jobs" value={String(uses.length)} sub={uses.length ? `${totals.qty} ${item.unit || "used"}` : "Not used yet"} />
            </div>
          )}

          {children}

          {uses.length > 0 && (
            <div
              className="grid grid-cols-3 gap-2.5"
              style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--surface-inset)" }}
            >
              <Stat label="Sold for" value={formatPeso(totals.sold)} plain />
              <Stat label="Cost" value={totals.costed ? formatPeso(totals.cost) : "—"} plain />
              <Stat label="Profit" value={totals.costed ? formatPeso(totals.profit) : "—"} plain strong />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span style={{ fontSize: "12.5px", fontWeight: 700 }}>Used on</span>
              {uses.length > 5 && <SearchInput placeholder="Customer, plate, job no..." value={search} onChange={setSearch} width={200} />}
            </div>
            {uses.length === 0 ? (
              <span style={{ fontSize: "12px", color: "var(--text-muted)", textWrap: "pretty" }}>
                Not on any job order yet. It shows here once a job order with this line is made or recorded.
              </span>
            ) : shown.length === 0 ? (
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>No job matches this search.</span>
            ) : (
              <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {shown.map((use, index) => (
                  <UseRow key={`${use.jobOrderRef}-${index}`} use={use} crmEnabled={crmEnabled} onOpenSupplier={onOpenSupplier} />
                ))}
              </ol>
            )}
          </div>
        </div>

        {/* Footer: what can be done to the line. */}
        <div
          className="flex items-center gap-2"
          style={{ flex: "0 0 auto", padding: "12px 16px", borderTop: "1px solid var(--border-subtle)", background: "var(--gray-25)" }}
        >
          {editing ? (
            <>
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
                Cancel
              </Button>
              <Button icon="check" onClick={save} disabled={pending} style={{ marginLeft: "auto" }}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" icon="trash-2" onClick={remove} disabled={pending}>
                Remove
              </Button>
              <Button variant="secondary" icon="pen-line" onClick={() => setEditing(true)} disabled={pending} style={{ marginLeft: "auto" }}>
                Edit price
              </Button>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function Stat({ label, value, sub, plain, strong }: { label: string; value: string; sub?: string; plain?: boolean; strong?: boolean }) {
  return (
    <div
      className="flex min-w-0 flex-col"
      style={plain ? { gap: 1 } : { gap: 1, padding: "8px 10px", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}
    >
      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontSize: "14px", fontWeight: strong ? 700 : 600, fontVariantNumeric: "tabular-nums" }}>{value}</span>
      {sub && <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{sub}</span>}
    </div>
  );
}

/**
 * One job the line went on: who (with how to reach them), which car and, for
 * a part, who it was bought from on the left; the money on the right.
 */
function UseRow({ use, crmEnabled, onOpenSupplier }: { use: PriceItemUse; crmEnabled: boolean; onOpenSupplier?: (ref: string) => void }) {
  const router = useRouter();
  const profit = use.costCents === null ? null : use.amountCents - use.costCents;
  const reach = [use.company, use.phone, use.email].filter(Boolean).join(" · ");
  const link = { color: "var(--accent-primary)", textDecoration: "none" } as const;
  const jobHref = `/quotations/jobs/${encodeURIComponent(use.jobOrderRef)}`;
  // The whole row opens the job order; the customer and supplier links inside go to their own records.
  const inner = (event: { stopPropagation: () => void }) => event.stopPropagation();
  return (
    <li
      role="link"
      tabIndex={0}
      aria-label={`Open ${use.jobOrderRef}, ${use.customer || "no name"}`}
      title={`Open ${use.jobOrderRef}`}
      onClick={() => router.push(jobHref)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        router.push(jobHref);
      }}
      className="flex items-start gap-3 hover:bg-[var(--surface-hover)]"
      style={{ padding: "9px 10px", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", cursor: "pointer" }}
    >
      <span className="flex min-w-0 flex-1 flex-col" style={{ gap: 1 }}>
        <span className="flex items-center gap-2" style={{ fontSize: "12px" }}>
          <Link href={jobHref} onClick={inner} tabIndex={-1} style={{ color: "var(--accent-primary)", textDecoration: "none", fontWeight: 700 }}>
            {use.jobOrderRef}
          </Link>
          <span style={{ color: "var(--text-muted)" }}>{use.when}</span>
        </span>
        <span style={{ fontSize: "12.5px", fontWeight: 600, overflowWrap: "anywhere" }}>
          {crmEnabled && use.customerRef ? (
            <Link href={`/crm?customer=${encodeURIComponent(use.customerRef)}`} onClick={inner} onKeyDown={inner} style={{ ...link, fontWeight: 600 }}>
              {use.customer || "No name"}
            </Link>
          ) : (
            use.customer || "No name"
          )}
        </span>
        {reach && (
          <span style={{ fontSize: "11.5px", color: "var(--text-secondary)", overflowWrap: "anywhere" }}>{reach}</span>
        )}
        <span className="flex items-center gap-1.5" style={{ fontSize: "11.5px", color: "var(--text-secondary)", overflowWrap: "anywhere" }}>
          <Icon name="car" size={12} style={{ flex: "0 0 auto", color: "var(--text-muted)" }} />
          {[use.plate, use.makeModel].filter(Boolean).join(" · ") || "No car given"}
        </span>
        {use.boughtFrom && (
          <span className="flex items-center gap-1.5" style={{ fontSize: "11.5px", color: "var(--text-secondary)", overflowWrap: "anywhere" }}>
            <Icon name="truck" size={12} style={{ flex: "0 0 auto", color: "var(--text-muted)" }} />
            Bought from{" "}
            {use.boughtFromRef && onOpenSupplier ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenSupplier(use.boughtFromRef as string);
                }}
                onKeyDown={inner}
                style={{ ...link, border: "none", background: "none", padding: 0, cursor: "pointer", font: "inherit", fontWeight: 600 }}
              >
                {use.boughtFrom}
              </button>
            ) : (
              <span style={{ fontWeight: 600 }}>{use.boughtFrom}</span>
            )}
          </span>
        )}
      </span>
      <span className="flex flex-col items-end" style={{ gap: 1, fontVariantNumeric: "tabular-nums", flex: "0 0 auto" }}>
        <span style={{ fontSize: "12.5px", fontWeight: 600 }}>{formatPeso(use.amountCents)}</span>
        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
          {use.qty}
          {use.unit ? ` ${use.unit}` : ""} · cost {use.costCents === null ? "—" : formatPeso(use.costCents)}
          {use.costSource === "quoted" ? " (quoted)" : use.costSource === "bought" ? " (bought)" : ""}
        </span>
        <span style={{ fontSize: "11px", fontWeight: 600, color: profit !== null && profit < 0 ? "var(--status-negative)" : "var(--text-secondary)" }}>
          {profit === null ? "Profit —" : `Profit ${formatPeso(profit)}`}
        </span>
      </span>
      <Icon name="chevron-right" size={14} style={{ flex: "0 0 auto", alignSelf: "center", color: "var(--text-muted)" }} />
    </li>
  );
}
