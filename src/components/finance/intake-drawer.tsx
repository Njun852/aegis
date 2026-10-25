"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { discardIntakeAction, postIntakeAction, readIntakeAction } from "@/app/actions/finance";
import { Field, INPUT, Notice, SELECT } from "@/components/forms/form-kit";
import { useToast } from "@/components/layout/toast-provider";
import { Button, IconButton } from "@/components/ui";
import { EXPENSE_CATEGORIES } from "@/lib/finance";
import { INTAKE_DOC_TYPES, feeKindForMethod, intakePostProblem } from "@/lib/finance-intake";
import { formatMoney } from "@/lib/format";
import { amountInput, parseAmount } from "@/lib/quotations";
import { DuplicateNotice } from "./duplicate-notice";
import { useFee } from "./fee-fields";
import { StatusBadge } from "./intake-badge";
import { formatStamp } from "./record-trail";
import type { DuplicateMatch, ExpenseCategory, FeeRule, IntakeItem, IntakeRatedField, MoneyAccountSummary } from "@/types";

const HEADING = { margin: 0, fontFamily: "var(--font-display)", fontSize: "13.5px", fontWeight: 700 };

/** The account a payment method most likely went through, to start the form on. */
function accountFor(method: string, accounts: MoneyAccountSummary[]): string {
  const type = method === "cash" ? "cash" : method === "ewallet" ? "ewallet" : method === "unknown" || method === "unpaid" ? null : "bank";
  return (type ? accounts.find((account) => account.type === type) : null)?.ref ?? accounts[0]?.ref ?? "";
}

/**
 * One upload under review: the document beside what the AI read from it.
 * Every field is editable and a doubtful one is marked; Confirm and post makes
 * the bill or invoice, with the file attached, and nothing happens without it.
 */
export function IntakeDrawer({
  item,
  accounts,
  feeRules,
  today,
  onClose,
}: {
  item: IntakeItem;
  accounts: MoneyAccountSummary[];
  feeRules: FeeRule[];
  isAdmin: boolean;
  today: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const read = item.extraction;
  const open = item.status === "unread" || item.status === "review";
  const [direction, setDirection] = useState<"in" | "out">(read?.direction ?? "out");
  const [party, setParty] = useState(read?.party ?? "");
  const [reference, setReference] = useState(read?.reference ?? "");
  const [date, setDate] = useState(read?.date ?? today);
  const [dueDate, setDueDate] = useState(read?.dueDate ?? read?.date ?? today);
  const [amount, setAmount] = useState(read?.amountCents != null ? amountInput(read.amountCents) : "");
  const [category, setCategory] = useState<ExpenseCategory>(read?.category ?? "other");
  const [paid, setPaid] = useState(read?.paid ?? false);
  const [accountRef, setAccountRef] = useState(accountFor(read?.paymentMethod ?? "unknown", accounts));
  const [description, setDescription] = useState(read?.description ?? "");
  const [duplicates, setDuplicates] = useState<DuplicateMatch[] | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const amountCents = parseAmount(amount) || 0;
  const fee = useFee(
    feeRules,
    amountCents,
    direction,
    read?.feeCents ? { kind: feeKindForMethod(read.paymentMethod), cents: read.feeCents } : null,
  );
  const fileUrl = item.posted?.attachmentRef
    ? `/api/finance/attachments/${encodeURIComponent(item.posted.attachmentRef)}`
    : `/api/finance/intake/${encodeURIComponent(item.ref)}`;

  /** A field the AI was not sure of is outlined, so the reviewer looks at it first. */
  const doubt = (field: IntakeRatedField) => (read && read.confidence[field] !== "high" ? read.confidence[field] : null);
  const box = (field: IntakeRatedField) => ({ ...INPUT, ...(doubt(field) ? { borderColor: "var(--status-warning)", background: "var(--status-warning-soft)" } : {}) });
  const hint = (field: IntakeRatedField) => (doubt(field) ? `Check this: the AI read it with ${doubt(field)} confidence.` : undefined);

  const post = (confirmedDuplicates: string[] = []) => {
    const input = {
      direction,
      party,
      reference,
      date,
      dueDate,
      amountCents,
      category: direction === "out" ? category : null,
      paid,
      accountRef: paid ? accountRef : null,
      fee: paid ? fee.fee : null,
      description,
      confirmedDuplicates,
    };
    const problem = intakePostProblem(input, today) ?? (paid ? fee.problem : null);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await postIntakeAction(item.ref, input);
      if (!result.ok) {
        setDuplicates(result.duplicates ?? null);
        setError(result.duplicates ? null : result.error);
        toast({ tone: "error", title: "Not posted", description: result.error, key: "finance-intake-post" });
        return;
      }
      toast({
        tone: "success",
        title: `Posted as ${result.kind} ${result.ref}`,
        description: `${formatMoney(amountCents)} ${direction === "out" ? "to" : "from"} ${party.trim()}${paid ? ", settled the same day" : ""}. The document is attached to it.`,
        key: "finance-intake-post",
        durationMs: 9000,
      });
      router.push(
        result.kind === "bill"
          ? `/finance?tab=payables&bill=${encodeURIComponent(result.ref)}`
          : `/finance?tab=receivables&invoice=${encodeURIComponent(result.ref)}`,
      );
    });
  };

  const readAgain = () =>
    startTransition(async () => {
      toast({ tone: "info", title: `Reading ${item.ref}…`, description: "This can take up to half a minute.", key: "finance-intake-read", durationMs: 60_000 });
      const result = await readIntakeAction(item.ref);
      if (!result.ok) {
        toast({ tone: "error", title: "Not read", description: result.error, key: "finance-intake-read" });
        return;
      }
      toast(
        result.status === "review"
          ? { tone: "success", title: `${item.ref} read`, description: result.note || "Check every field before posting.", key: "finance-intake-read" }
          : { tone: "error", title: `${item.ref} still unread`, description: result.note, key: "finance-intake-read" },
      );
      router.refresh();
    });

  const discard = () =>
    startTransition(async () => {
      const result = await discardIntakeAction(item.ref, reason);
      if (!result.ok) {
        toast({ tone: "error", title: "Not discarded", description: result.error, key: "finance-intake-discard" });
        return;
      }
      toast({ tone: "success", title: `${item.ref} discarded`, description: "Kept for 90 days with the reason, then removed. Nothing was posted.", key: "finance-intake-discard" });
      onClose();
      router.refresh();
    });

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(23,28,37,.18)" }} />
      <aside
        aria-label={`Upload ${item.ref}`}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 1040,
          maxWidth: "96vw",
          zIndex: 71,
          background: "var(--surface-card)",
          borderLeft: "1px solid var(--border-default)",
          boxShadow: "var(--shadow-popover)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="flex items-start gap-3" style={{ padding: "16px 16px 14px", borderBottom: "1px solid var(--border-subtle)" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "16px", fontWeight: 700, overflowWrap: "anywhere" }}>{item.name}</div>
            <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 3 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "10.5px", color: "var(--text-muted)" }}>{item.ref}</span>
              <StatusBadge item={item} />
              <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                Uploaded by {item.uploadedBy} · {formatStamp(item.uploadedAt)}
              </span>
            </div>
          </div>
          <IconButton icon="x" size={32} label="Close" onClick={onClose} />
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 wide:grid-cols-2" style={{ overflow: "hidden" }}>
          <div style={{ background: "var(--gray-25)", borderRight: "1px solid var(--border-subtle)", overflow: "auto", minHeight: 240 }}>
            {item.contentType === "application/pdf" ? (
              <iframe title={item.name} src={fileUrl} style={{ width: "100%", height: "100%", minHeight: 480, border: "none" }} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- a private file from an authenticated route, not a static asset
              <img src={fileUrl} alt={item.name} style={{ width: "100%", display: "block" }} />
            )}
          </div>

          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto" style={{ padding: 16 }}>
            {read?.summary && (
              <span style={{ fontSize: "12.5px", color: "var(--text-secondary)" }}>
                <strong>AI read:</strong> {read.summary} ({INTAKE_DOC_TYPES.find((entry) => entry.key === read.docType)?.label})
              </span>
            )}
            {open && item.reviewReasons.length > 0 && (
              <Notice tone="warning">
                <span className="flex flex-col gap-1">
                  <strong>Needs review</strong>
                  {item.reviewReasons.map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </span>
              </Notice>
            )}
            {open && read && item.reviewReasons.length === 0 && (
              <Notice tone="info">Read cleanly. Still check every field against the document before posting.</Notice>
            )}
            {item.status === "posted" && item.posted && (
              <Notice tone="info">
                Posted by {item.postedBy} as{" "}
                <Link
                  href={
                    item.posted.kind === "bill"
                      ? `/finance?tab=payables&bill=${encodeURIComponent(item.posted.ref)}`
                      : `/finance?tab=receivables&invoice=${encodeURIComponent(item.posted.ref)}`
                  }
                  style={{ color: "var(--text-accent)", fontWeight: 600 }}
                >
                  {item.posted.ref}
                </Link>
                {item.postedAt ? `, ${formatStamp(item.postedAt)}` : ""}. The document is attached to it.
              </Notice>
            )}
            {item.status === "discarded" && (
              <Notice tone="info">
                Discarded by {item.discardedBy}: {item.discardReason}. Nothing was posted.
              </Notice>
            )}
            {error && <Notice tone="error">{error}</Notice>}
            {duplicates && (
              <DuplicateNotice
                matches={duplicates}
                href={(ref) => (ref.startsWith("BL-") ? `/finance?tab=payables&bill=${encodeURIComponent(ref)}` : `/finance?tab=receivables&invoice=${encodeURIComponent(ref)}`)}
                pending={pending}
                onSaveAnyway={() => post(duplicates.map((match) => match.ref))}
              />
            )}

            {open && (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button variant={direction === "out" ? "primary" : "secondary"} size="sm" onClick={() => setDirection("out")}>
                    Bill: the business pays
                  </Button>
                  <Button variant={direction === "in" ? "primary" : "secondary"} size="sm" onClick={() => setDirection("in")}>
                    Invoice: the business is paid
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-3 wide:grid-cols-2">
                  <Field label={direction === "out" ? "Supplier / payee" : "Customer"} required hint={hint("party")}>
                    <input style={box("party")} value={party} maxLength={120} onChange={(event) => setParty(event.target.value)} />
                  </Field>
                  <Field label="Invoice / receipt no." required={direction === "in"} hint={hint("reference")}>
                    <input style={box("reference")} value={reference} maxLength={80} onChange={(event) => setReference(event.target.value)} />
                  </Field>
                  <Field label="Date" required hint={hint("date") ?? "The month of this date is the month it counts in."}>
                    <input style={box("date")} type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)} />
                  </Field>
                  <Field label="Amount" required hint={hint("amount") ?? "The total, VAT included."}>
                    <input style={box("amount")} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
                  </Field>
                  {!paid && (
                    <Field label="Due date" required hint={hint("dueDate")}>
                      <input style={box("dueDate")} type="date" value={dueDate} min={date} onChange={(event) => setDueDate(event.target.value)} />
                    </Field>
                  )}
                  {direction === "out" && (
                    <Field label="Category" required hint={hint("category")}>
                      <select style={{ ...SELECT, ...(doubt("category") ? { borderColor: "var(--status-warning)" } : {}) }} value={category} onChange={(event) => setCategory(event.target.value as ExpenseCategory)}>
                        {EXPENSE_CATEGORIES.map((entry) => (
                          <option key={entry.key} value={entry.key}>
                            {entry.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                </div>
                <Field label="Description">
                  <input style={INPUT} value={description} maxLength={400} onChange={(event) => setDescription(event.target.value)} />
                </Field>
                {read && (read.businessName || read.branch) && (
                  <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                    On the document: {[read.businessName && `business "${read.businessName}"`, read.branch && `branch "${read.branch}"`].filter(Boolean).join(", ")}.
                    {read.branch ? " The branch is kept in the record's remarks." : ""}
                  </span>
                )}

                <div className="flex flex-col gap-3" style={{ padding: "10px 12px", border: "1px solid var(--border-default)", borderRadius: 12 }}>
                  <label className="flex items-center gap-2" style={{ fontSize: "12.5px", fontWeight: 600 }}>
                    <input type="checkbox" checked={paid} disabled={accounts.length === 0} onChange={(event) => setPaid(event.target.checked)} />
                    Already paid {read && read.paymentMethod !== "unknown" && read.paymentMethod !== "unpaid" ? `(${read.paymentMethod}, as read)` : ""}
                    {accounts.length === 0 && <span style={{ fontWeight: 400, color: "var(--text-muted)" }}> (add an account first)</span>}
                  </label>
                  {paid && (
                    <Field label={direction === "out" ? "Paid from" : "Paid into"} required>
                      <select style={SELECT} value={accountRef} onChange={(event) => setAccountRef(event.target.value)}>
                        {accounts.map((account) => (
                          <option key={account.ref} value={account.ref}>
                            {account.name} · {formatMoney(account.balanceCents)}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  {paid && fee.fields}
                  {!paid && (
                    <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                      Posted as {direction === "out" ? "payable" : "receivable"} until it is paid.
                    </span>
                  )}
                </div>

                {discarding && (
                  <div className="flex flex-wrap items-center gap-2">
                    <input style={{ ...INPUT, flex: 1, minWidth: 200 }} value={reason} maxLength={300} placeholder="Why is this being discarded?" onChange={(event) => setReason(event.target.value)} />
                    <Button size="sm" variant="secondary" onClick={discard} disabled={pending}>
                      Discard it
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDiscarding(false)} disabled={pending}>
                      Keep
                    </Button>
                  </div>
                )}
              </>
            )}

            {read && read.warnings.length > 0 && !open && (
              <section className="flex flex-col gap-1">
                <h3 style={HEADING}>AI warnings</h3>
                {read.warnings.map((warning) => (
                  <span key={warning} style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                    {warning}
                  </span>
                ))}
              </section>
            )}
          </div>
        </div>

        {open && (
          <div className="flex flex-wrap items-center gap-2" style={{ padding: "13px 16px", borderTop: "1px solid var(--border-subtle)", background: "var(--gray-25)" }}>
            <Button icon="check" onClick={() => post()} disabled={pending}>
              {pending ? "Working…" : "Confirm and post"}
            </Button>
            {!read && (
              <Button variant="secondary" icon="sparkles" onClick={readAgain} disabled={pending}>
                Read with AI
              </Button>
            )}
            {!discarding && (
              <Button variant="ghost" onClick={() => setDiscarding(true)} disabled={pending}>
                Discard
              </Button>
            )}
            <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>The AI never posts. Your confirmation does.</span>
          </div>
        )}
      </aside>
    </>
  );
}
