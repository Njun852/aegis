"use client";

import Link from "next/link";
import { voidPaymentAction } from "@/app/actions/finance";
import { Badge, Button, Icon, IconButton } from "@/components/ui";
import { MONEY_NATURES, feeKindLabel, moneyNatureLabel } from "@/lib/finance";
import { formatMoney } from "@/lib/format";
import { formatQuoteDay } from "@/lib/quotations";
import { AuditLines, RecordTrailPanel } from "./record-trail";
import { useVoid } from "./use-void";
import type { PaymentDetail, RecordTrail } from "@/types";

const LABEL = { width: 104, flex: "0 0 auto", fontSize: "11.5px", color: "var(--text-muted)" };

function title(payment: PaymentDetail): string {
  if (payment.nature) return moneyNatureLabel(payment.nature);
  if (payment.kind === "collection") return "Collection";
  if (payment.kind === "bill") return "Bill payment";
  if (payment.kind === "transfer") return "Transfer";
  return payment.reconciliationRef ? "Count adjustment" : "Other";
}

/**
 * One payment: what moved, between which accounts, the fee, who recorded it
 * and the documents behind it. A transfer or a Money In or Out entry is voided
 * here; a collection or bill payment from the invoice or bill it settles.
 */
export function PaymentDrawer({
  payment,
  trail,
  isAdmin,
  onClose,
}: {
  payment: PaymentDetail;
  trail: RecordTrail;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const paymentVoid = useVoid(voidPaymentAction, "Kept on record as void, with the reason; the balance is as if it never moved.");
  const fee = payment.fee?.cents ?? 0;
  const net = payment.direction === "in" ? payment.amountCents - fee : payment.amountCents + fee;
  const effect = payment.nature ? MONEY_NATURES.find((entry) => entry.key === payment.nature)?.effect : null;
  const voidable = isAdmin && payment.status === "recorded" && (payment.kind === "transfer" || payment.kind === "other");

  const details = [
    { label: "Date", value: formatQuoteDay(payment.paidOn) },
    payment.kind === "transfer"
      ? { label: "From → to", value: `${payment.accountName} → ${payment.toAccountName ?? ""}` }
      : { label: payment.direction === "in" ? "Into" : "From", value: payment.accountName },
    ...(payment.party ? [{ label: "Who", value: payment.party }] : []),
    ...(payment.note ? [{ label: "Description", value: payment.note }] : []),
    ...(payment.kind === "transfer" || payment.kind === "other"
      ? [{ label: "Income effect", value: effect === "income" ? "Counted as a sale" : "None: moves a balance only" + (fee > 0 ? "; the fee is an expense" : "") }]
      : []),
    ...(payment.status === "void" ? [{ label: "Voided", value: `${payment.voidReason ?? ""} (${payment.updatedBy ?? "someone"})` }] : []),
  ];

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 72, background: "rgba(23,28,37,.18)" }} />
      <aside
        aria-label={`Payment ${payment.ref}`}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 520,
          maxWidth: "94vw",
          zIndex: 73,
          background: "var(--surface-card)",
          borderLeft: "1px solid var(--border-default)",
          boxShadow: "var(--shadow-popover)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="flex items-start gap-3" style={{ padding: "16px 16px 14px", borderBottom: "1px solid var(--border-subtle)" }}>
          <span style={{ width: 38, height: 38, flex: "0 0 auto", borderRadius: 10, background: "var(--accent-soft)", color: "var(--accent-primary)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name={payment.kind === "transfer" ? "arrow-left-right" : "wallet"} size={18} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "16px", fontWeight: 700 }}>
              {title(payment)} · {payment.kind === "transfer" ? "moved" : payment.direction === "in" ? "money in" : "money out"}
            </div>
            <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 3 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "10.5px", color: "var(--text-muted)" }}>{payment.ref}</span>
              {payment.status === "void" ? <Badge tone="neutral">Void</Badge> : <Badge tone="accent">Recorded</Badge>}
            </div>
          </div>
          <IconButton icon="x" size={32} label="Close" onClick={onClose} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto" style={{ padding: 16 }}>
          <div className="grid grid-cols-3 gap-2" style={{ padding: "12px 14px", border: "1px solid var(--border-default)", borderRadius: 14, fontVariantNumeric: "tabular-nums" }}>
            {[
              { label: "Gross", value: payment.amountCents },
              { label: fee > 0 && payment.fee ? feeKindLabel(payment.fee.kind) : "Fee", value: fee },
              { label: payment.direction === "in" ? "Net received" : "Total out", value: net },
            ].map((figure) => (
              <span key={figure.label} className="flex flex-col">
                <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>{figure.label}</span>
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "16px",
                    fontWeight: 700,
                    textDecoration: payment.status === "void" ? "line-through" : "none",
                  }}
                >
                  {formatMoney(figure.value)}
                </span>
              </span>
            ))}
          </div>

          <div className="flex flex-col gap-2" style={{ padding: "12px 14px", border: "1px solid var(--border-default)", borderRadius: 14 }}>
            {details.map((row) => (
              <div key={row.label} className="flex items-start gap-2.5">
                <span style={LABEL}>{row.label}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: "12.5px", fontWeight: 500, overflowWrap: "anywhere" }}>{row.value}</span>
              </div>
            ))}
            {(payment.invoiceRef || payment.billRef) && (
              <div className="flex items-start gap-2.5">
                <span style={LABEL}>Settles</span>
                <Link
                  href={
                    payment.invoiceRef
                      ? `/finance?tab=receivables&invoice=${encodeURIComponent(payment.invoiceRef)}`
                      : `/finance?tab=payables&bill=${encodeURIComponent(payment.billRef ?? "")}`
                  }
                  style={{ fontSize: "12.5px", color: "var(--text-accent)" }}
                >
                  {payment.invoiceRef ? `Invoice ${payment.invoiceRef}` : `Bill ${payment.billRef}`}
                </Link>
              </div>
            )}
          </div>

          <AuditLines audit={payment.audit} reference={payment.reference ?? ""} />
          <RecordTrailPanel recordRef={payment.ref} trail={trail} canAttach={payment.status === "recorded"} />

          {paymentVoid.target === payment.ref && (
            <section className="flex flex-col gap-1">
              <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                Voiding keeps {payment.ref} on record but takes it out of the balance{fee > 0 ? ", and its fee out of costs" : ""}.
              </span>
              {paymentVoid.form}
            </section>
          )}
        </div>

        {voidable && paymentVoid.target !== payment.ref && (
          <div className="flex flex-wrap items-center gap-2" style={{ padding: "13px 16px", borderTop: "1px solid var(--border-subtle)", background: "var(--gray-25)" }}>
            <Button variant="ghost" onClick={() => paymentVoid.setTarget(payment.ref)}>
              Void {payment.kind === "transfer" ? "transfer" : "entry"}
            </Button>
          </div>
        )}
      </aside>
    </>
  );
}
