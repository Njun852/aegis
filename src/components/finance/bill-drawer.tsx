"use client";

import Link from "next/link";
import { voidBillAction, voidBillPaymentAction } from "@/app/actions/finance";
import { Badge, Button, Icon, IconButton } from "@/components/ui";
import { dueLabel, expenseCategoryLabel } from "@/lib/finance";
import { formatMoney } from "@/lib/format";
import { formatQuoteDay } from "@/lib/quotations";
import { GroupBadge, StateBadge } from "./bill-badges";
import { useVoid } from "./use-void";
import type { BillSummary } from "@/types";

export interface BillDrawerProps {
  bill: BillSummary;
  isAdmin: boolean;
  today: string;
  canPay: boolean;
  onPay: () => void;
  onEdit: () => void;
  onClose: () => void;
}

export function BillDrawer({ bill, isAdmin, today, canPay, onPay, onEdit, onClose }: BillDrawerProps) {
  const paymentVoid = useVoid(voidBillPaymentAction, "Kept on record as void; the bill owes that amount again.");
  const billVoid = useVoid(voidBillAction, "Kept on record as void; it no longer counts as a cost or as payable.");
  const recorded = bill.payments.filter((payment) => payment.status === "recorded");

  const details = [
    { label: "Invoice / ref", value: bill.reference || "None given" },
    { label: "Category", value: expenseCategoryLabel(bill.category) },
    { label: "Invoice date", value: formatQuoteDay(bill.billDate) },
    {
      label: "Due date",
      value: `${formatQuoteDay(bill.dueDate)}${bill.outstandingCents > 0 ? ` · ${dueLabel(bill.dueDate, today)}` : ""}`,
    },
    { label: "Responsible", value: bill.responsiblePerson || "Nobody named" },
    { label: "Entered by", value: bill.createdBy },
    ...(bill.state === "Void" ? [{ label: "Voided", value: bill.voidReason }] : []),
  ];

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(23,28,37,.18)" }} />
      <aside
        aria-label={`Bill ${bill.ref}`}
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
            <Icon name="file-text" size={18} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "16px", fontWeight: 700, overflowWrap: "anywhere" }}>{bill.payee}</div>
            <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 3 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "10.5px", color: "var(--text-muted)" }}>{bill.ref}</span>
              <StateBadge state={bill.state} />
              {bill.group && <GroupBadge group={bill.group} />}
            </div>
          </div>
          <IconButton icon="x" size={32} label="Close" onClick={onClose} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto" style={{ padding: 16 }}>
          <div className="grid grid-cols-3 gap-2" style={{ padding: "12px 14px", border: "1px solid var(--border-default)", borderRadius: 14 }}>
            {[
              { label: "Original", value: bill.amountCents },
              { label: "Paid", value: bill.paidCents },
              { label: "Outstanding", value: bill.outstandingCents },
            ].map((figure) => (
              <span key={figure.label} className="flex flex-col">
                <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>{figure.label}</span>
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: figure.label === "Outstanding" ? "20px" : "16px",
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    color: figure.label === "Outstanding" && bill.group && bill.daysUntilDue < 0 ? "var(--status-negative)" : "var(--text-primary)",
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
                <span style={{ width: 92, flex: "0 0 auto", fontSize: "11.5px", color: "var(--text-muted)" }}>{row.label}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: "12.5px", fontWeight: 500, overflowWrap: "anywhere" }}>{row.value}</span>
              </div>
            ))}
            {bill.receiptRef && (
              <div className="flex items-start gap-2.5">
                <span style={{ width: 92, flex: "0 0 auto", fontSize: "11.5px", color: "var(--text-muted)" }}>Receipt</span>
                <Link href={`/suppliers/receipts/${encodeURIComponent(bill.receiptRef)}`} style={{ fontSize: "12.5px", color: "var(--text-accent)" }}>
                  {bill.receiptRef}
                </Link>
              </div>
            )}
            {bill.remarks && (
              <div className="flex items-start gap-2.5">
                <span style={{ width: 92, flex: "0 0 auto", fontSize: "11.5px", color: "var(--text-muted)" }}>Remarks</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: "12.5px", overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{bill.remarks}</span>
              </div>
            )}
          </div>

          <section className="flex flex-col gap-2">
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "13.5px", fontWeight: 700 }}>Payments</h3>
            {bill.payments.length === 0 ? (
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Nothing paid yet.</span>
            ) : (
              <div style={{ border: "1px solid var(--border-default)", borderRadius: 12, overflow: "hidden" }}>
                {bill.payments.map((payment) => (
                  <div key={payment.ref} style={{ borderBottom: "1px solid var(--gray-50)", padding: "8px 12px", opacity: payment.status === "void" ? 0.6 : 1 }}>
                    <div className="flex items-center gap-3">
                      <span style={{ width: 84, flex: "0 0 auto", fontSize: "11.5px", color: "var(--text-muted)" }}>{formatQuoteDay(payment.paidOn)}</span>
                      <span className="flex min-w-0 flex-1 flex-col leading-tight">
                        <span style={{ fontSize: "12.5px" }}>From {payment.accountName}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "10.5px", color: "var(--text-muted)" }}>
                          {payment.ref} · {payment.createdBy}
                          {payment.status === "void" && ` · void: ${payment.voidReason ?? ""}`}
                        </span>
                      </span>
                      <span style={{ fontSize: "12.5px", fontWeight: 600, fontVariantNumeric: "tabular-nums", textDecoration: payment.status === "void" ? "line-through" : "none" }}>
                        {formatMoney(payment.amountCents)}
                      </span>
                      {isAdmin && payment.status === "recorded" && paymentVoid.target !== payment.ref && (
                        <Button size="sm" variant="ghost" onClick={() => paymentVoid.setTarget(payment.ref)}>
                          Void
                        </Button>
                      )}
                    </div>
                    {paymentVoid.target === payment.ref && paymentVoid.form}
                  </div>
                ))}
              </div>
            )}
          </section>

          {billVoid.target === bill.ref && (
            <section className="flex flex-col gap-1">
              <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                Voiding keeps {bill.ref} on record but takes it out of costs and payables.
              </span>
              {billVoid.form}
            </section>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2" style={{ padding: "13px 16px", borderTop: "1px solid var(--border-subtle)", background: "var(--gray-25)" }}>
          {bill.outstandingCents > 0 && (
            <Button icon="credit-card" onClick={onPay} disabled={!canPay}>
              Record payment
            </Button>
          )}
          {bill.state !== "Void" && (
            <Button variant="secondary" icon="pen-line" onClick={onEdit}>
              Edit
            </Button>
          )}
          {isAdmin && bill.state !== "Void" && recorded.length === 0 && billVoid.target !== bill.ref && (
            <Button variant="ghost" onClick={() => billVoid.setTarget(bill.ref)}>
              Void bill
            </Button>
          )}
          {bill.state === "Void" && <Badge tone="neutral">Void bills cannot be changed</Badge>}
        </div>
      </aside>
    </>
  );
}
