"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveFollowUpAction, voidCollectionAction, voidInvoiceAction } from "@/app/actions/finance";
import { Field, INPUT, Notice } from "@/components/forms/form-kit";
import { useToast } from "@/components/layout/toast-provider";
import { Badge, Button, Icon, IconButton } from "@/components/ui";
import { AR_AGING_BUCKETS, MIN_DETAILED_REMARK, dueLabel, followUpProblems, isOver90 } from "@/lib/finance";
import { formatMoney } from "@/lib/format";
import { formatQuoteDay } from "@/lib/quotations";
import { StateBadge } from "./bill-badges";
import { useVoid } from "./use-void";
import type { ArFollowUp, FinanceEventLine, InvoiceSummary } from "@/types";

export interface InvoiceDrawerProps {
  invoice: InvoiceSummary;
  history: FinanceEventLine[];
  isAdmin: boolean;
  today: string;
  canCollect: boolean;
  onCollect: () => void;
  onEdit: () => void;
  onClose: () => void;
}

const HEADING = { margin: 0, fontFamily: "var(--font-display)", fontSize: "13.5px", fontWeight: 700 };

export function InvoiceDrawer({ invoice, history, isAdmin, today, canCollect, onCollect, onEdit, onClose }: InvoiceDrawerProps) {
  const collectionVoid = useVoid(voidCollectionAction, "Kept on record as void; the invoice is owed that amount again.");
  const invoiceVoid = useVoid(voidInvoiceAction, "Kept on record as void; it no longer counts as a sale or as receivable.");
  const recorded = invoice.payments.filter((payment) => payment.status === "recorded");
  const open = invoice.outstandingCents > 0;
  const bucket = invoice.bucket ? AR_AGING_BUCKETS.find((entry) => entry.key === invoice.bucket)?.label : null;

  const details = [
    { label: "Invoice no.", value: invoice.number },
    { label: "Invoice date", value: formatQuoteDay(invoice.invoiceDate) },
    { label: "Due date", value: `${formatQuoteDay(invoice.dueDate)}${open ? ` · ${dueLabel(invoice.dueDate, today)}` : ""}` },
    ...(open ? [{ label: "Outstanding for", value: `${invoice.daysOutstanding} ${invoice.daysOutstanding === 1 ? "day" : "days"}${bucket ? ` (${bucket})` : ""}` }] : []),
    { label: "Issued by", value: invoice.createdBy },
    ...(invoice.state === "Void" ? [{ label: "Voided", value: invoice.voidReason }] : []),
  ];

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(23,28,37,.18)" }} />
      <aside
        aria-label={`Invoice ${invoice.number}`}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 560,
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
            <Icon name="inbox" size={18} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "16px", fontWeight: 700, overflowWrap: "anywhere" }}>{invoice.customerName}</div>
            <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 3 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "10.5px", color: "var(--text-muted)" }}>{invoice.ref}</span>
              <StateBadge state={invoice.state} />
              {bucket && <Badge tone={invoice.bucket === "90+" ? "negative" : invoice.bucket === "61-90" ? "warning" : "neutral"}>{bucket}</Badge>}
              {invoice.problems.length > 0 && <Badge tone="negative">Needs follow-up</Badge>}
            </div>
          </div>
          <IconButton icon="x" size={32} label="Close" onClick={onClose} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto" style={{ padding: 16 }}>
          <div className="grid grid-cols-3 gap-2" style={{ padding: "12px 14px", border: "1px solid var(--border-default)", borderRadius: 14 }}>
            {[
              { label: "Original", value: invoice.amountCents },
              { label: "Collected", value: invoice.collectedCents },
              { label: "Outstanding", value: invoice.outstandingCents },
            ].map((figure) => (
              <span key={figure.label} className="flex flex-col">
                <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>{figure.label}</span>
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: figure.label === "Outstanding" ? "20px" : "16px",
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    color: figure.label === "Outstanding" && invoice.bucket === "90+" ? "var(--status-negative)" : "var(--text-primary)",
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
                <span style={{ width: 104, flex: "0 0 auto", fontSize: "11.5px", color: "var(--text-muted)" }}>{row.label}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: "12.5px", fontWeight: 500, overflowWrap: "anywhere" }}>{row.value}</span>
              </div>
            ))}
            {invoice.jobOrderRef && (
              <div className="flex items-start gap-2.5">
                <span style={{ width: 104, flex: "0 0 auto", fontSize: "11.5px", color: "var(--text-muted)" }}>Job order</span>
                <Link href={`/quotations/jobs/${encodeURIComponent(invoice.jobOrderRef)}`} style={{ fontSize: "12.5px", color: "var(--text-accent)" }}>
                  {invoice.jobOrderRef}
                </Link>
              </div>
            )}
            {invoice.customerRef && (
              <div className="flex items-start gap-2.5">
                <span style={{ width: 104, flex: "0 0 auto", fontSize: "11.5px", color: "var(--text-muted)" }}>Customer</span>
                <Link href={`/crm?customer=${encodeURIComponent(invoice.customerRef)}`} style={{ fontSize: "12.5px", color: "var(--text-accent)" }}>
                  {invoice.customerRef}
                </Link>
              </div>
            )}
          </div>

          {invoice.state !== "Void" && open && <FollowUpForm key={JSON.stringify(invoice.followUp)} invoice={invoice} today={today} />}
          {!open && invoice.followUp.remarks && (
            <section className="flex flex-col gap-1">
              <h3 style={HEADING}>Remarks</h3>
              <span style={{ fontSize: "12.5px", whiteSpace: "pre-wrap" }}>{invoice.followUp.remarks}</span>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h3 style={HEADING}>Collections</h3>
            {invoice.payments.length === 0 ? (
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Nothing collected yet.</span>
            ) : (
              <div style={{ border: "1px solid var(--border-default)", borderRadius: 12, overflow: "hidden" }}>
                {invoice.payments.map((payment) => (
                  <div key={payment.ref} style={{ borderBottom: "1px solid var(--gray-50)", padding: "8px 12px", opacity: payment.status === "void" ? 0.6 : 1 }}>
                    <div className="flex items-center gap-3">
                      <span style={{ width: 84, flex: "0 0 auto", fontSize: "11.5px", color: "var(--text-muted)" }}>{formatQuoteDay(payment.paidOn)}</span>
                      <span className="flex min-w-0 flex-1 flex-col leading-tight">
                        <span style={{ fontSize: "12.5px" }}>Into {payment.accountName}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "10.5px", color: "var(--text-muted)" }}>
                          {payment.ref} · {payment.createdBy}
                          {payment.status === "void" && ` · void: ${payment.voidReason ?? ""}`}
                        </span>
                      </span>
                      <span style={{ fontSize: "12.5px", fontWeight: 600, fontVariantNumeric: "tabular-nums", textDecoration: payment.status === "void" ? "line-through" : "none" }}>
                        {formatMoney(payment.amountCents)}
                      </span>
                      {isAdmin && payment.status === "recorded" && collectionVoid.target !== payment.ref && (
                        <Button size="sm" variant="ghost" onClick={() => collectionVoid.setTarget(payment.ref)}>
                          Void
                        </Button>
                      )}
                    </div>
                    {collectionVoid.target === payment.ref && collectionVoid.form}
                  </div>
                ))}
              </div>
            )}
          </section>

          {history.length > 0 && (
            <details>
              <summary style={{ ...HEADING, cursor: "pointer" }}>History ({history.length})</summary>
              <div className="flex flex-col gap-1.5" style={{ marginTop: 8 }}>
                {history.map((line, index) => (
                  <div key={`${line.at}-${index}`} style={{ fontSize: "11.5px", color: "var(--text-secondary)", overflowWrap: "anywhere" }}>
                    <span style={{ color: "var(--text-muted)" }}>
                      {new Date(line.at).toLocaleString("en-US", { timeZone: "Asia/Manila", month: "short", day: "2-digit", hour: "numeric", minute: "2-digit" })} · {line.actor} ·{" "}
                    </span>
                    {line.detail}
                  </div>
                ))}
              </div>
            </details>
          )}

          {invoiceVoid.target === invoice.ref && (
            <section className="flex flex-col gap-1">
              <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                Voiding keeps invoice {invoice.number} on record but takes it out of sales and receivables
                {invoice.jobOrderRef ? `, and frees ${invoice.jobOrderRef} to be invoiced again` : ""}.
              </span>
              {invoiceVoid.form}
            </section>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2" style={{ padding: "13px 16px", borderTop: "1px solid var(--border-subtle)", background: "var(--gray-25)" }}>
          {open && (
            <Button icon="wallet" onClick={onCollect} disabled={!canCollect}>
              Record collection
            </Button>
          )}
          {invoice.state !== "Void" && (
            <Button variant="secondary" icon="pen-line" onClick={onEdit}>
              Edit
            </Button>
          )}
          {isAdmin && invoice.state !== "Void" && recorded.length === 0 && invoiceVoid.target !== invoice.ref && (
            <Button variant="ghost" onClick={() => invoiceVoid.setTarget(invoice.ref)}>
              Void invoice
            </Button>
          )}
          {invoice.state === "Void" && <Badge tone="neutral">Void invoices cannot be changed</Badge>}
        </div>
      </aside>
    </>
  );
}

/**
 * Who is collecting, what was done, what happens next and when. Over 90 days
 * every field is required and "not yet paid" is refused, both here and on the
 * server.
 */
function FollowUpForm({ invoice, today }: { invoice: InvoiceSummary; today: string }) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<ArFollowUp>(invoice.followUp);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const over90 = isOver90(invoice.invoiceDate, today);
  const set = (field: keyof ArFollowUp) => (value: string) => setForm((current) => ({ ...current, [field]: value }));
  const flagged = new Set(invoice.problems.map((problem) => problem.field));

  const save = () => {
    const problems = followUpProblems(form, invoice.invoiceDate, today);
    if (problems.length > 0) {
      setError(problems.map((problem) => problem.message).join(" "));
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await saveFollowUpAction(invoice.ref, { ...form, nextFollowUpDate: form.nextFollowUpDate || null });
      if (!result.ok) {
        setError(result.error);
        toast({ tone: "error", title: "Follow-up not saved", description: result.error, key: "finance-followup" });
        return;
      }
      toast({ tone: "success", title: "Follow-up saved", description: `Invoice ${invoice.number}. It is in the invoice's history.`, key: "finance-followup" });
      router.refresh();
    });
  };

  const box = (field: keyof ArFollowUp) => ({
    ...INPUT,
    borderColor: flagged.has(field) ? "var(--status-negative)" : "var(--border-default)",
  });

  return (
    <section className="flex flex-col gap-3" style={{ padding: "12px 14px", border: `1px solid ${invoice.problems.length > 0 ? "var(--status-negative)" : "var(--border-default)"}`, borderRadius: 14 }}>
      <h3 style={HEADING}>Follow-up</h3>
      {over90 && (
        <Notice tone={invoice.problems.length > 0 ? "error" : "info"}>
          Over 90 days: the reason it is unpaid, detailed remarks, who is responsible, the last action, the next action and the next
          follow-up date are all required. &quot;Not yet paid&quot; is not an acceptable remark.
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {over90 && (
        <Field label="Reason unpaid" required>
          <input style={box("reasonUnpaid")} value={form.reasonUnpaid} maxLength={300} placeholder="Waiting on their head office to release payment…" onChange={(event) => set("reasonUnpaid")(event.target.value)} />
        </Field>
      )}
      <Field label="Remarks" required={over90} hint={over90 ? `What happened and what was agreed, at least ${MIN_DETAILED_REMARK} characters.` : undefined}>
        <textarea rows={3} maxLength={1000} style={{ ...box("remarks"), resize: "vertical" }} value={form.remarks} onChange={(event) => set("remarks")(event.target.value)} />
      </Field>
      <div className="grid grid-cols-1 gap-3 wide:grid-cols-2">
        <Field label="Responsible person" required={over90}>
          <input style={box("responsiblePerson")} value={form.responsiblePerson} maxLength={80} onChange={(event) => set("responsiblePerson")(event.target.value)} />
        </Field>
        <Field label="Next follow-up date" required={over90}>
          <input style={box("nextFollowUpDate")} type="date" value={form.nextFollowUpDate ?? ""} min={today} onChange={(event) => set("nextFollowUpDate")(event.target.value)} />
        </Field>
        <Field label="Last action" required={over90}>
          <input style={box("lastAction")} value={form.lastAction} maxLength={300} placeholder="Called their accounts on Oct 10" onChange={(event) => set("lastAction")(event.target.value)} />
        </Field>
        <Field label="Next action" required={over90}>
          <input style={box("nextAction")} value={form.nextAction} maxLength={300} placeholder="Collect the cheque at their office" onChange={(event) => set("nextAction")(event.target.value)} />
        </Field>
      </div>
      <div>
        <Button size="sm" icon="check" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save follow-up"}
        </Button>
      </div>
    </section>
  );
}
