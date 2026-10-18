"use client";

import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState, useTransition } from "react";
import { Modal, Notice } from "@/components/forms/form-kit";
import { Badge, Button } from "@/components/ui";
import { AR_AGING_BUCKETS } from "@/lib/finance";
import { formatMoney } from "@/lib/format";
import { formatQuoteDay } from "@/lib/quotations";
import { CollectModal } from "./collect-modal";
import { InvoiceDrawer } from "./invoice-drawer";
import { InvoiceModal } from "./invoice-modal";
import { StateBadge } from "./bill-badges";
import { StatTiles, type StatTile } from "./stat-tiles";
import type { ArAgingBucket, CustomerOption, FinanceEventLine, InvoiceSummary, MoneyAccountSummary, UninvoicedJob } from "@/types";

type View = "outstanding" | "paid" | "void";

export interface ReceivablesPanelProps {
  invoices: InvoiceSummary[];
  accounts: MoneyAccountSummary[];
  customers: CustomerOption[];
  jobs: UninvoicedJob[];
  suggestedNumber: string;
  openRef: string | null;
  history: FinanceEventLine[];
  isAdmin: boolean;
  today: string;
  userName: string;
}

const TH = {
  padding: "8px 10px",
  fontSize: "var(--text-overline-size)",
  letterSpacing: ".08em",
  textTransform: "uppercase" as const,
  color: "var(--text-muted)",
  fontWeight: 500,
  textAlign: "left" as const,
  whiteSpace: "nowrap" as const,
  borderBottom: "1px solid var(--border-subtle)",
};
const TD = { padding: "9px 10px", fontSize: "12.5px", borderBottom: "1px solid var(--gray-50)", verticalAlign: "top" as const };
const MONEY = { ...TD, textAlign: "right" as const, fontVariantNumeric: "tabular-nums" as const, whiteSpace: "nowrap" as const };

/** Oldest first: the money least likely to come in is what needs looking at. */
const BUCKET_ORDER: ArAgingBucket[] = ["90+", "61-90", "31-60", "0-30"];

/**
 * The Accounts Receivable screen: every invoice with money still owed,
 * grouped by age, with who is chasing it and when. A receivable over 90 days
 * without the follow-up the control requires is marked and counted.
 */
export function ReceivablesPanel({
  invoices,
  accounts,
  customers,
  jobs,
  suggestedNumber,
  openRef,
  history,
  isAdmin,
  today,
  userName,
}: ReceivablesPanelProps) {
  const router = useRouter();
  const [view, setView] = useState<View>("outstanding");
  const [adding, setAdding] = useState(false);
  const [fromJob, setFromJob] = useState<UninvoicedJob | null>(null);
  const [choosingJob, setChoosingJob] = useState(false);
  const [editing, setEditing] = useState<InvoiceSummary | null>(null);
  const [collecting, setCollecting] = useState<InvoiceSummary | null>(null);
  const [, startNavigation] = useTransition();

  const active = accounts.filter((account) => account.active);
  const open = openRef ? invoices.find((invoice) => invoice.ref === openRef) ?? null : null;
  const outstanding = invoices.filter((invoice) => invoice.outstandingCents > 0);
  const needFollowUp = outstanding.filter((invoice) => invoice.problems.length > 0);

  const select = (ref: string | null) => {
    startNavigation(() =>
      router.replace(ref ? `/finance?tab=receivables&invoice=${encodeURIComponent(ref)}` : "/finance?tab=receivables", { scroll: false }),
    );
  };

  const sum = (list: InvoiceSummary[]) => list.reduce((total, invoice) => total + invoice.outstandingCents, 0);
  const inBucket = (bucket: ArAgingBucket) => outstanding.filter((invoice) => invoice.bucket === bucket);
  const over90 = inBucket("90+");
  const late = inBucket("61-90");

  const tiles: StatTile[] = [
    { label: `Total receivable · ${outstanding.length} ${outstanding.length === 1 ? "invoice" : "invoices"}`, value: formatMoney(sum(outstanding)), icon: "inbox", tone: "accent" },
    { label: `61-90 days · ${late.length}`, value: formatMoney(sum(late)), icon: "clock" },
    { label: `90+ days · ${over90.length}`, value: formatMoney(sum(over90)), icon: "alert-triangle", tone: over90.length > 0 ? "alert" : "plain" },
    { label: "90+ without required follow-up", value: String(needFollowUp.length), icon: "circle-alert", tone: needFollowUp.length > 0 ? "alert" : "plain" },
  ];

  const shown = useMemo(() => {
    if (view === "paid") return invoices.filter((invoice) => invoice.state === "Paid");
    if (view === "void") return invoices.filter((invoice) => invoice.state === "Void");
    return outstanding;
  }, [invoices, outstanding, view]);

  const groups =
    view === "outstanding"
      ? BUCKET_ORDER.map((bucket) => ({
          key: bucket,
          label: AR_AGING_BUCKETS.find((entry) => entry.key === bucket)?.label ?? bucket,
          invoices: shown.filter((invoice) => invoice.bucket === bucket),
        })).filter((group) => group.invoices.length > 0)
      : [{ key: view, label: "", invoices: shown }];

  const views: { id: View; label: string; count: number }[] = [
    { id: "outstanding", label: "Outstanding", count: outstanding.length },
    { id: "paid", label: "Collected", count: invoices.filter((invoice) => invoice.state === "Paid").length },
    { id: "void", label: "Void", count: invoices.filter((invoice) => invoice.state === "Void").length },
  ];

  return (
    <>
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Which invoices">
            {views.map((entry) => {
              const on = view === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setView(entry.id)}
                  style={{
                    height: 28,
                    padding: "0 11px",
                    border: `1px solid ${on ? "var(--accent-primary)" : "var(--border-default)"}`,
                    borderRadius: 999,
                    cursor: "pointer",
                    fontFamily: "var(--font-body)",
                    fontSize: "12px",
                    fontWeight: on ? 700 : 500,
                    color: on ? "var(--text-accent)" : "var(--text-secondary)",
                    background: on ? "var(--accent-soft)" : "var(--surface-card)",
                  }}
                >
                  {entry.label} {entry.count}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {jobs.length > 0 && (
              <Button variant="secondary" icon="wrench" onClick={() => setChoosingJob(true)}>
                From a job order ({jobs.length})
              </Button>
            )}
            <Button icon="plus" onClick={() => setAdding(true)}>
              New invoice
            </Button>
          </div>
        </div>

        <StatTiles tiles={tiles} />

        {needFollowUp.length > 0 && (
          <Notice tone="error">
            <strong>
              {needFollowUp.length === 1 ? "1 receivable over 90 days is" : `${needFollowUp.length} receivables over 90 days are`} missing the
              follow-up the control requires.
            </strong>{" "}
            Open {needFollowUp.length === 1 ? "it" : "each one"} and record the reason, remarks, who is responsible, the last and next action,
            and the next follow-up date.
          </Notice>
        )}
        {jobs.length > 0 && (
          <Notice tone="warning">
            <strong>
              {jobs.length === 1 ? "1 completed job order has" : `${jobs.length} completed job orders have`} no invoice yet.
            </strong>{" "}
            Finished work is not a sale or a receivable until it is invoiced.{" "}
            <button
              type="button"
              onClick={() => setChoosingJob(true)}
              style={{ border: "none", background: "none", padding: 0, font: "inherit", color: "inherit", textDecoration: "underline", cursor: "pointer" }}
            >
              Invoice them
            </button>
          </Notice>
        )}

        <section
          style={{
            background: "var(--surface-card)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-card)",
            padding: "6px 6px 4px",
            minWidth: 0,
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 1220, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={TH}>Customer / company</th>
                  <th style={TH}>Invoice no.</th>
                  <th style={TH}>Invoice date</th>
                  <th style={TH}>Due date</th>
                  <th style={{ ...TH, textAlign: "right" }}>Original</th>
                  <th style={{ ...TH, textAlign: "right" }}>Collected</th>
                  <th style={{ ...TH, textAlign: "right" }}>Outstanding</th>
                  <th style={{ ...TH, textAlign: "right" }}>Days out</th>
                  <th style={TH}>Aging</th>
                  <th style={TH}>Responsible</th>
                  <th style={TH}>Remarks</th>
                  <th style={TH}>Next follow-up</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <Fragment key={group.key}>
                    {group.label && (
                      <tr>
                        <td colSpan={12} style={{ padding: "12px 10px 6px", background: "var(--gray-25)", borderBottom: "1px solid var(--border-subtle)" }}>
                          <span className="flex items-center gap-2">
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 999,
                                background: group.key === "90+" ? "var(--status-negative)" : group.key === "61-90" ? "var(--status-warning)" : "var(--text-muted)",
                              }}
                            />
                            <strong style={{ fontSize: "12.5px" }}>{group.label}</strong>
                            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                              {group.invoices.length} · {formatMoney(sum(group.invoices))}
                            </span>
                          </span>
                        </td>
                      </tr>
                    )}
                    {group.invoices.map((invoice) => {
                      const followUpDue = invoice.outstandingCents > 0 && invoice.followUp.nextFollowUpDate && invoice.followUp.nextFollowUpDate <= today;
                      return (
                        <tr
                          key={invoice.ref}
                          tabIndex={0}
                          onClick={() => select(invoice.ref)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") select(invoice.ref);
                          }}
                          style={{ cursor: "pointer", background: invoice.ref === openRef ? "var(--surface-active)" : "transparent" }}
                        >
                          <td style={TD}>
                            <span className="flex flex-col leading-tight">
                              <span style={{ fontWeight: 600 }}>{invoice.customerName}</span>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: "10.5px", color: "var(--text-muted)" }}>
                                {invoice.ref}
                                {invoice.jobOrderRef ? ` · ${invoice.jobOrderRef}` : ""}
                              </span>
                            </span>
                          </td>
                          <td style={{ ...TD, whiteSpace: "nowrap" }}>{invoice.number}</td>
                          <td style={{ ...TD, whiteSpace: "nowrap" }}>{formatQuoteDay(invoice.invoiceDate)}</td>
                          <td style={{ ...TD, whiteSpace: "nowrap", color: invoice.outstandingCents > 0 && invoice.daysUntilDue < 0 ? "var(--status-negative)" : "var(--text-primary)" }}>
                            {formatQuoteDay(invoice.dueDate)}
                          </td>
                          <td style={MONEY}>{formatMoney(invoice.amountCents)}</td>
                          <td style={MONEY}>{formatMoney(invoice.collectedCents)}</td>
                          <td style={{ ...MONEY, fontWeight: 700 }}>{formatMoney(invoice.outstandingCents)}</td>
                          <td style={MONEY}>{invoice.outstandingCents > 0 ? invoice.daysOutstanding : "—"}</td>
                          <td style={{ ...TD, whiteSpace: "nowrap" }}>
                            {invoice.bucket ? (
                              <Badge tone={invoice.bucket === "90+" ? "negative" : invoice.bucket === "61-90" ? "warning" : "neutral"}>
                                {AR_AGING_BUCKETS.find((entry) => entry.key === invoice.bucket)?.label}
                              </Badge>
                            ) : (
                              <StateBadge state={invoice.state} />
                            )}
                          </td>
                          <td style={{ ...TD, whiteSpace: "nowrap" }}>{invoice.followUp.responsiblePerson || "—"}</td>
                          <td style={{ ...TD, maxWidth: 240, color: "var(--text-secondary)" }}>
                            {invoice.problems.length > 0 && (
                              <span style={{ display: "block", marginBottom: 3 }}>
                                <Badge tone="negative">Needs follow-up</Badge>
                              </span>
                            )}
                            <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                              {invoice.followUp.remarks || "—"}
                            </span>
                          </td>
                          <td style={{ ...TD, whiteSpace: "nowrap", color: followUpDue ? "var(--status-negative)" : "var(--text-primary)", fontWeight: followUpDue ? 600 : 400 }}>
                            {invoice.followUp.nextFollowUpDate ? formatQuoteDay(invoice.followUp.nextFollowUpDate) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={12} style={{ padding: "30px 10px", textAlign: "center", fontSize: "12.5px", color: "var(--text-muted)" }}>
                      {view === "outstanding"
                        ? invoices.length === 0
                          ? "No invoices yet. Every sale is an invoice: invoice completed job orders, and enter cash sales as invoices collected in full."
                          : "Nothing is owed. Every invoice is collected."
                        : view === "paid"
                          ? "No invoice has been collected in full yet."
                          : "No void invoices."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {open && (
        <InvoiceDrawer
          key={open.ref}
          invoice={open}
          history={history}
          isAdmin={isAdmin}
          today={today}
          canCollect={active.length > 0}
          onCollect={() => setCollecting(open)}
          onEdit={() => setEditing(open)}
          onClose={() => select(null)}
        />
      )}
      {(adding || fromJob || editing) && (
        <InvoiceModal
          invoice={editing}
          job={fromJob}
          customers={customers}
          accounts={active}
          suggestedNumber={suggestedNumber}
          today={today}
          defaultPerson={userName}
          onClose={() => {
            setAdding(false);
            setFromJob(null);
            setEditing(null);
          }}
          onSaved={(ref) => {
            setAdding(false);
            setFromJob(null);
            setEditing(null);
            select(ref);
          }}
        />
      )}
      {collecting && <CollectModal invoice={collecting} accounts={active} today={today} onClose={() => setCollecting(null)} />}
      {choosingJob && (
        <Modal title="Completed job orders with no invoice" icon="wrench" width={620} onClose={() => setChoosingJob(false)}>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
            Each is finished work at the price the customer approved. Invoice it to count it as a sale and track what is owed.
          </span>
          <div style={{ border: "1px solid var(--border-default)", borderRadius: 12, overflow: "hidden" }}>
            {jobs.map((job) => (
              <div key={job.ref} className="flex items-center gap-3" style={{ padding: "9px 12px", borderBottom: "1px solid var(--gray-50)" }}>
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span style={{ fontSize: "12.5px", fontWeight: 600 }}>{job.customerName}</span>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    {job.ref}
                    {job.vehicle ? ` · ${job.vehicle}` : ""} · approved {formatQuoteDay(job.approvedDate)}
                  </span>
                </span>
                <span style={{ fontSize: "12.5px", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{formatMoney(job.approvedTotalCents)}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setChoosingJob(false);
                    setFromJob(job);
                  }}
                >
                  Invoice
                </Button>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
