"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resolveCountAction, setAccountActiveAction, voidPaymentAction } from "@/app/actions/finance";
import { INPUT, Notice } from "@/components/forms/form-kit";
import { useToast } from "@/components/layout/toast-provider";
import { Badge, Button, Icon, IconButton } from "@/components/ui";
import { MIN_RESOLUTION, accountTypeLabel } from "@/lib/finance";
import { formatMoney, formatSignedMoney } from "@/lib/format";
import { formatQuoteDay } from "@/lib/quotations";
import { AccountModal } from "./account-modal";
import { CountBadge } from "./count-badge";
import type { CountRow, MoneyAccountSummary } from "@/types";

export interface AccountDrawerProps {
  account: MoneyAccountSummary;
  counts: CountRow[];
  isAdmin: boolean;
  /** Manila's today, the latest an opening balance can be for. */
  today: string;
  canTransfer: boolean;
  onCount: () => void;
  onTransfer: () => void;
  onClose: () => void;
}

const SECTION = { display: "flex", flexDirection: "column" as const, gap: 8 };
const HEADING = { margin: 0, fontFamily: "var(--font-display)", fontSize: "13.5px", fontWeight: 700 };
const signed = formatSignedMoney;

export function AccountDrawer({ account, counts, isAdmin, today, canTransfer, onCount, onTransfer, onClose }: AccountDrawerProps) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const rowsTotal = account.rows.reduce((sum, row) => sum + row.amountCents, 0);

  const toggleActive = () => {
    if (account.active && !window.confirm(`Mark ${account.name} as no longer used? Its history is kept.`)) return;
    startTransition(async () => {
      const result = await setAccountActiveAction(account.ref, !account.active);
      if (!result.ok) {
        toast({ tone: "error", title: "Not changed", description: result.error });
        return;
      }
      toast({ tone: "success", title: account.active ? `${account.name} set aside` : `${account.name} back in use` });
      router.refresh();
    });
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(23,28,37,.18)" }} />
      <aside
        aria-label={account.name}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 540,
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
            <Icon name={account.type === "cash" ? "wallet" : account.type === "bank" ? "building-2" : "credit-card"} size={18} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "16px", fontWeight: 700, overflowWrap: "anywhere" }}>{account.name}</div>
            <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 3 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "10.5px", color: "var(--text-muted)" }}>{account.ref}</span>
              <Badge tone="accent">{accountTypeLabel(account)}</Badge>
              {account.type !== "cash" && (
                <span style={{ fontSize: "11.5px", color: "var(--text-secondary)" }}>
                  {account.institution} ···{account.numberLast4}
                </span>
              )}
              {!account.active && <Badge tone="neutral">No longer used</Badge>}
            </div>
          </div>
          <IconButton icon="x" size={32} label="Close" onClick={onClose} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto" style={{ padding: 16 }}>
          <div className="flex items-end justify-between gap-3" style={{ padding: "12px 14px", border: "1px solid var(--border-default)", borderRadius: 14 }}>
            <span className="flex flex-col">
              <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>Balance today</span>
              <span style={{ fontFamily: "var(--font-display)", fontSize: "24px", fontWeight: 700, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>
                {formatMoney(account.balanceCents)}
              </span>
            </span>
            <span style={{ fontSize: "11.5px", color: "var(--text-muted)", textAlign: "right" }}>
              Opened with {formatMoney(account.openingBalanceCents)}
              <br />
              on {formatQuoteDay(account.openingDate)}
            </span>
          </div>

          <Activity account={account} isAdmin={isAdmin} rowsTotal={rowsTotal} />

          <section style={SECTION}>
            <h3 style={HEADING}>Counts</h3>
            {counts.length === 0 ? (
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                Never counted. Record a count to check this balance against{" "}
                {account.type === "cash" ? "the cash in the box" : account.bankKind === "passbook" ? "the passbook" : "the statement"}.
              </span>
            ) : (
              counts.map((count) => <CountCard key={count.ref} count={count} isAdmin={isAdmin} />)
            )}
          </section>
        </div>

        <div className="flex flex-wrap items-center gap-2" style={{ padding: "13px 16px", borderTop: "1px solid var(--border-subtle)", background: "var(--gray-25)" }}>
          {account.active && (
            <Button variant="secondary" icon="check" onClick={onCount}>
              Record count
            </Button>
          )}
          {account.active && canTransfer && (
            <Button variant="secondary" icon="arrow-left-right" onClick={onTransfer}>
              Transfer
            </Button>
          )}
          {isAdmin && (
            <>
              <Button variant="ghost" icon="pen-line" onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Button variant="ghost" onClick={toggleActive} disabled={pending}>
                {account.active ? "No longer used" : "Use again"}
              </Button>
            </>
          )}
        </div>
      </aside>

      {editing && (
        <AccountModal account={account} today={today} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />
      )}
    </>
  );
}

/** The rows the balance is made of. They add up to the balance shown, and the footer says so. */
function Activity({ account, isAdmin, rowsTotal }: { account: MoneyAccountSummary; isAdmin: boolean; rowsTotal: number }) {
  const router = useRouter();
  const toast = useToast();
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  const confirmVoid = (ref: string) => {
    startTransition(async () => {
      const result = await voidPaymentAction(ref, reason);
      if (!result.ok) {
        toast({ tone: "error", title: "Not voided", description: result.error, key: "finance-void" });
        return;
      }
      toast({ tone: "success", title: `${ref} voided`, description: "Kept on record as void, with the reason.", key: "finance-void" });
      setVoiding(null);
      setReason("");
      router.refresh();
    });
  };

  return (
    <section style={SECTION}>
      <h3 style={HEADING}>What the balance is made of</h3>
      <div style={{ border: "1px solid var(--border-default)", borderRadius: 12, overflow: "hidden" }}>
        {account.rows.map((row) => (
          <div key={`${row.kind}-${row.ref}`} style={{ borderBottom: "1px solid var(--gray-50)", padding: "8px 12px" }}>
            <div className="flex items-center gap-3">
              <span style={{ width: 84, flex: "0 0 auto", fontSize: "11.5px", color: "var(--text-muted)" }}>{formatQuoteDay(row.dateKey)}</span>
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span style={{ fontSize: "12.5px", overflowWrap: "anywhere" }}>{row.kind === "opening" ? "Opening balance" : row.label}</span>
                {row.kind === "payment" && <span style={{ fontFamily: "var(--font-mono)", fontSize: "10.5px", color: "var(--text-muted)" }}>{row.ref}</span>}
              </span>
              <span
                style={{
                  fontSize: "12.5px",
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                  color: row.amountCents < 0 ? "var(--status-negative)" : "var(--text-primary)",
                }}
              >
                {row.kind === "opening" ? formatMoney(row.amountCents) : signed(row.amountCents)}
              </span>
              {isAdmin && account.voidableRefs.includes(row.ref) && voiding !== row.ref && (
                <Button size="sm" variant="ghost" onClick={() => setVoiding(row.ref)}>
                  Void
                </Button>
              )}
            </div>
            {voiding === row.ref && (
              <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 8 }}>
                <input
                  style={{ ...INPUT, flex: 1, minWidth: 180 }}
                  value={reason}
                  maxLength={300}
                  placeholder="Why is this being voided?"
                  onChange={(event) => setReason(event.target.value)}
                />
                <Button size="sm" variant="secondary" onClick={() => confirmVoid(row.ref)} disabled={pending}>
                  {pending ? "Voiding…" : "Void it"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setVoiding(null)} disabled={pending}>
                  Keep
                </Button>
              </div>
            )}
          </div>
        ))}
        <div className="flex items-center justify-between gap-3" style={{ padding: "9px 12px", background: "var(--gray-25)" }}>
          <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
            {account.rows.length} {account.rows.length === 1 ? "line" : "lines"}, adding up to
          </span>
          <span style={{ fontSize: "13px", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatMoney(rowsTotal)}</span>
        </div>
      </div>
      {account.rows.length === 1 && (
        <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>Nothing has moved through this account since it was opened.</span>
      )}
    </section>
  );
}

function CountCard({ count, isAdmin }: { count: CountRow; isAdmin: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [resolving, setResolving] = useState(false);
  const [resolution, setResolution] = useState("");
  const [adjust, setAdjust] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bookMoved = count.bookNowCents !== count.bookCents;

  const resolve = () => {
    if (resolution.trim().length < MIN_RESOLUTION) {
      setError(`Say what the difference was and why (at least ${MIN_RESOLUTION} characters).`);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await resolveCountAction(count.ref, resolution, adjust);
      if (!result.ok) {
        setError(result.error);
        toast({ tone: "error", title: "Not resolved", description: result.error, key: "finance-resolve" });
        return;
      }
      toast({
        tone: "success",
        title: `${count.ref} explained`,
        description: adjust ? `The book was adjusted by ${signed(count.differenceCents)} to match the count.` : "Removed from the alert list.",
        key: "finance-resolve",
      });
      setResolving(false);
      router.refresh();
    });
  };

  return (
    <div style={{ border: `1px solid ${count.status === "open" ? "var(--status-negative)" : "var(--border-default)"}`, borderRadius: 12, padding: "10px 12px" }}>
      <div className="flex flex-wrap items-center gap-2">
        <span style={{ fontSize: "12.5px", fontWeight: 600 }}>{formatQuoteDay(count.asOf)}</span>
        <CountBadge status={count.status} differenceCents={count.differenceCents} />
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "10.5px", color: "var(--text-muted)" }}>{count.ref}</span>
      </div>
      <div className="grid grid-cols-2 gap-2" style={{ marginTop: 6, fontSize: "12px" }}>
        <span>
          <span style={{ color: "var(--text-muted)" }}>Counted </span>
          {formatMoney(count.countedCents)}
        </span>
        <span>
          <span style={{ color: "var(--text-muted)" }}>Book then </span>
          {formatMoney(count.bookCents)}
        </span>
      </div>
      <div style={{ marginTop: 4, fontSize: "11px", color: "var(--text-muted)" }}>Recorded by {count.createdBy}</div>
      {count.status === "open" && bookMoved && (
        <div style={{ marginTop: 6, fontSize: "11.5px", color: "var(--text-secondary)" }}>
          The book for that day now reads {formatMoney(count.bookNowCents)}
          {count.bookNowCents === count.countedCents ? ", which agrees with the count." : "."}
        </div>
      )}
      {count.status === "resolved" && (
        <div style={{ marginTop: 6, fontSize: "12px", color: "var(--text-secondary)", overflowWrap: "anywhere" }}>
          {count.resolution} <span style={{ color: "var(--text-muted)" }}>· {count.resolvedBy}</span>
        </div>
      )}
      {count.status === "open" && isAdmin && !resolving && (
        <div style={{ marginTop: 8 }}>
          <Button size="sm" variant="secondary" onClick={() => setResolving(true)}>
            Explain the difference
          </Button>
        </div>
      )}
      {count.status === "open" && !isAdmin && (
        <div style={{ marginTop: 6, fontSize: "11.5px", color: "var(--text-muted)" }}>An administrator needs to explain this difference.</div>
      )}
      {resolving && count.status === "open" && (
        <div className="flex flex-col gap-2" style={{ marginTop: 10 }}>
          {error && <Notice tone="error">{error}</Notice>}
          <textarea
            rows={3}
            maxLength={600}
            style={{ ...INPUT, resize: "vertical" }}
            value={resolution}
            placeholder="What the difference was and why: a deposit not yet in the passbook, change given wrongly, a payment not recorded…"
            onChange={(event) => setResolution(event.target.value)}
          />
          <label className="flex items-start gap-2" style={{ fontSize: "12px" }}>
            <input type="checkbox" checked={adjust} onChange={(event) => setAdjust(event.target.checked)} style={{ marginTop: 2 }} />
            <span>
              Adjust the book to the count: records {signed(count.differenceCents)} on {formatQuoteDay(count.asOf)} as an adjustment. It
              moves this balance only and is never income or expense. Leave unticked when the difference is explained another way.
            </span>
          </label>
          <div className="flex gap-2">
            <Button size="sm" icon="check" onClick={resolve} disabled={pending}>
              {pending ? "Saving…" : "Mark explained"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setResolving(false)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
