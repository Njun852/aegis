"use client";

import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState, useTransition } from "react";
import { Modal, Notice } from "@/components/forms/form-kit";
import { Button } from "@/components/ui";
import { AP_STATUS_GROUPS, dueLabel, expenseCategoryLabel } from "@/lib/finance";
import { formatMoney } from "@/lib/format";
import { formatQuoteDay } from "@/lib/quotations";
import { BillDrawer } from "./bill-drawer";
import { BillModal } from "./bill-modal";
import { groupTone, StateBadge } from "./bill-badges";
import { PayBillModal } from "./pay-bill-modal";
import { StatTiles, type StatTile } from "./stat-tiles";
import type { BillSummary, FeeRule, MoneyAccountSummary, PayeeOption, RecordTrail, UnbilledReceipt } from "@/types";

type View = "outstanding" | "paid" | "void";

export interface PayablesPanelProps {
  bills: BillSummary[];
  accounts: MoneyAccountSummary[];
  payees: PayeeOption[];
  receipts: UnbilledReceipt[];
  openRef: string | null;
  /** The open bill's history and attachments, its payments' included. */
  trail: RecordTrail;
  feeRules: FeeRule[];
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

/**
 * The Accounts Payable screen. Every bill with something still owed is shown,
 * whether it is due next quarter or long overdue, grouped by how soon it is
 * due; paid and void bills are a click away.
 */
export function PayablesPanel({ bills, accounts, payees, receipts, openRef, trail, feeRules, isAdmin, today, userName }: PayablesPanelProps) {
  const router = useRouter();
  const [view, setView] = useState<View>("outstanding");
  const [adding, setAdding] = useState(false);
  const [fromReceipt, setFromReceipt] = useState<UnbilledReceipt | null>(null);
  const [choosingReceipt, setChoosingReceipt] = useState(false);
  const [editing, setEditing] = useState<BillSummary | null>(null);
  const [paying, setPaying] = useState<BillSummary | null>(null);
  const [, startNavigation] = useTransition();

  const active = accounts.filter((account) => account.active);
  const open = openRef ? bills.find((bill) => bill.ref === openRef) ?? null : null;
  const outstanding = bills.filter((bill) => bill.outstandingCents > 0);

  const select = (ref: string | null) => {
    startNavigation(() =>
      router.replace(ref ? `/finance?tab=payables&bill=${encodeURIComponent(ref)}` : "/finance?tab=payables", { scroll: false }),
    );
  };

  const sum = (list: BillSummary[]) => list.reduce((total, bill) => total + bill.outstandingCents, 0);
  const inGroups = (...keys: BillSummary["group"][]) => outstanding.filter((bill) => keys.includes(bill.group));
  const overdue = inGroups("overdue", "critical-overdue");
  const dueSoon = inGroups("due-today", "due-7");
  const notDue = inGroups("due-30", "due-later");

  const tiles: StatTile[] = [
    { label: `Total payable · ${outstanding.length} ${outstanding.length === 1 ? "bill" : "bills"}`, value: formatMoney(sum(outstanding)), icon: "file-text", tone: "accent" },
    { label: `Overdue · ${overdue.length}`, value: formatMoney(sum(overdue)), icon: "alert-triangle", tone: overdue.length > 0 ? "alert" : "plain" },
    { label: `Due within 7 days · ${dueSoon.length}`, value: formatMoney(sum(dueSoon)), icon: "clock" },
    { label: `Not yet due · ${notDue.length}`, value: formatMoney(sum(notDue)), icon: "calendar" },
  ];

  const shown = useMemo(() => {
    if (view === "paid") return bills.filter((bill) => bill.state === "Paid");
    if (view === "void") return bills.filter((bill) => bill.state === "Void");
    return outstanding;
  }, [bills, outstanding, view]);

  const groups =
    view === "outstanding"
      ? AP_STATUS_GROUPS.map((group) => ({ ...group, bills: shown.filter((bill) => bill.group === group.key) })).filter((group) => group.bills.length > 0)
      : [{ key: view, label: "", bills: shown }];

  const views: { id: View; label: string; count: number }[] = [
    { id: "outstanding", label: "Outstanding", count: outstanding.length },
    { id: "paid", label: "Paid", count: bills.filter((bill) => bill.state === "Paid").length },
    { id: "void", label: "Void", count: bills.filter((bill) => bill.state === "Void").length },
  ];

  return (
    <>
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Which bills">
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
            {receipts.length > 0 && (
              <Button variant="secondary" icon="truck" onClick={() => setChoosingReceipt(true)}>
                From a receipt ({receipts.length})
              </Button>
            )}
            <Button icon="plus" onClick={() => setAdding(true)}>
              New bill
            </Button>
          </div>
        </div>

        <StatTiles tiles={tiles} />

        {receipts.length > 0 && (
          <Notice tone="warning">
            <strong>
              {receipts.length === 1 ? "1 supplier receipt has" : `${receipts.length} supplier receipts have`} no bill yet.
            </strong>{" "}
            Goods received on credit are not in Accounts Payable until a bill is made.{" "}
            <button
              type="button"
              onClick={() => setChoosingReceipt(true)}
              style={{ border: "none", background: "none", padding: 0, font: "inherit", color: "inherit", textDecoration: "underline", cursor: "pointer" }}
            >
              Make the bills
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
            <table style={{ width: "100%", minWidth: 1180, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={TH}>Supplier / payee</th>
                  <th style={TH}>Invoice / ref</th>
                  <th style={TH}>Invoice date</th>
                  <th style={TH}>Due date</th>
                  <th style={{ ...TH, textAlign: "right" }}>Original</th>
                  <th style={{ ...TH, textAlign: "right" }}>Paid</th>
                  <th style={{ ...TH, textAlign: "right" }}>Outstanding</th>
                  <th style={TH}>Category</th>
                  <th style={TH}>Due in / overdue</th>
                  <th style={TH}>Status</th>
                  <th style={TH}>Responsible</th>
                  <th style={TH}>Remarks</th>
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
                                background:
                                  groupTone(group.key as NonNullable<BillSummary["group"]>) === "negative"
                                    ? "var(--status-negative)"
                                    : groupTone(group.key as NonNullable<BillSummary["group"]>) === "warning"
                                      ? "var(--status-warning)"
                                      : "var(--text-muted)",
                              }}
                            />
                            <strong style={{ fontSize: "12.5px" }}>{group.label}</strong>
                            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                              {group.bills.length} · {formatMoney(sum(group.bills))}
                            </span>
                          </span>
                        </td>
                      </tr>
                    )}
                    {group.bills.map((bill) => (
                      <tr
                        key={bill.ref}
                        tabIndex={0}
                        onClick={() => select(bill.ref)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") select(bill.ref);
                        }}
                        style={{ cursor: "pointer", background: bill.ref === openRef ? "var(--surface-active)" : "transparent" }}
                      >
                        <td style={TD}>
                          <span className="flex flex-col leading-tight">
                            <span style={{ fontWeight: 600 }}>{bill.payee}</span>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "10.5px", color: "var(--text-muted)" }}>{bill.ref}</span>
                          </span>
                        </td>
                        <td style={TD}>{bill.reference || "—"}</td>
                        <td style={{ ...TD, whiteSpace: "nowrap" }}>{formatQuoteDay(bill.billDate)}</td>
                        <td style={{ ...TD, whiteSpace: "nowrap" }}>{formatQuoteDay(bill.dueDate)}</td>
                        <td style={MONEY}>{formatMoney(bill.amountCents)}</td>
                        <td style={MONEY}>{formatMoney(bill.paidCents)}</td>
                        <td style={{ ...MONEY, fontWeight: 700 }}>{formatMoney(bill.outstandingCents)}</td>
                        <td style={{ ...TD, whiteSpace: "nowrap" }}>{expenseCategoryLabel(bill.category)}</td>
                        <td
                          style={{
                            ...TD,
                            whiteSpace: "nowrap",
                            color: bill.outstandingCents > 0 && bill.daysUntilDue < 0 ? "var(--status-negative)" : "var(--text-primary)",
                            fontWeight: bill.outstandingCents > 0 && bill.daysUntilDue < 0 ? 600 : 400,
                          }}
                        >
                          {bill.outstandingCents > 0 ? dueLabel(bill.dueDate, today) : "—"}
                        </td>
                        <td style={TD}>
                          <StateBadge state={bill.state} />
                        </td>
                        <td style={{ ...TD, whiteSpace: "nowrap" }}>{bill.responsiblePerson || "—"}</td>
                        <td style={{ ...TD, maxWidth: 220, color: "var(--text-secondary)" }}>
                          <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                            {bill.remarks || "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={12} style={{ padding: "30px 10px", textAlign: "center", fontSize: "12.5px", color: "var(--text-muted)" }}>
                      {view === "outstanding"
                        ? bills.length === 0
                          ? "No bills yet. Enter each supplier invoice, utility bill, rent and payroll as a bill: that is how costs and payables are recorded."
                          : "Nothing is owed. Every bill is paid."
                        : view === "paid"
                          ? "No bill has been paid in full yet."
                          : "No void bills."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {open && (
        <BillDrawer
          key={open.ref}
          bill={open}
          trail={trail}
          isAdmin={isAdmin}
          today={today}
          canPay={active.length > 0}
          onPay={() => setPaying(open)}
          onEdit={() => setEditing(open)}
          onClose={() => select(null)}
        />
      )}
      {(adding || fromReceipt || editing) && (
        <BillModal
          bill={editing}
          receipt={fromReceipt}
          payees={payees}
          accounts={active}
          feeRules={feeRules}
          today={today}
          defaultPerson={userName}
          onClose={() => {
            setAdding(false);
            setFromReceipt(null);
            setEditing(null);
          }}
          onSaved={(ref) => {
            setAdding(false);
            setFromReceipt(null);
            setEditing(null);
            select(ref);
          }}
        />
      )}
      {paying && <PayBillModal bill={paying} accounts={active} feeRules={feeRules} today={today} onClose={() => setPaying(null)} />}
      {choosingReceipt && (
        <Modal title="Supplier receipts with no bill" icon="truck" width={620} onClose={() => setChoosingReceipt(false)}>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
            Each posted receipt is goods received. Make a bill for each one so what is owed for it shows in Payables.
          </span>
          <div style={{ border: "1px solid var(--border-default)", borderRadius: 12, overflow: "hidden" }}>
            {receipts.map((receipt) => (
              <div key={receipt.ref} className="flex items-center gap-3" style={{ padding: "9px 12px", borderBottom: "1px solid var(--gray-50)" }}>
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span style={{ fontSize: "12.5px", fontWeight: 600 }}>{receipt.supplierName}</span>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    {receipt.ref}
                    {receipt.receiptNo ? ` · No. ${receipt.receiptNo}` : ""} · {formatQuoteDay(receipt.receivedDate)}
                    {receipt.terms ? ` · terms: ${receipt.terms}` : ""}
                  </span>
                </span>
                <span style={{ fontSize: "12.5px", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{formatMoney(receipt.totalCents)}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setChoosingReceipt(false);
                    setFromReceipt(receipt);
                  }}
                >
                  Make bill
                </Button>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
