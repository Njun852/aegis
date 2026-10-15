"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import {
  approveSpecialPricingAction,
  clearQuoteResponseAction,
  convertToJobOrderAction,
  markQuotationGivenAction,
  recordQuoteResponseAction,
} from "@/app/actions/quotations";
import { useToast } from "@/components/layout/toast-provider";
import { Button, Icon } from "@/components/ui";
import { Field, INPUT, Modal, Notice, SELECT } from "@/components/forms/form-kit";
import {
  QUOTE_HANDOVER_METHODS,
  QUOTE_RESPONSE_METHODS,
  amountInput,
  formatPeso,
  formatQuoteDay,
  lineAmountCents,
  manilaDateTimeInput,
  parseAmount,
  pricingCleared,
  specialPricingKey,
} from "@/lib/quotations";
import type { Quotation, QuoteResponseMethod, QuoteResponseOutcome } from "@/types";

export interface QuoteProgressProps {
  quotation: Quotation;
  /** Unsaved edits: nothing here acts until they are saved, since every step works on the stored copy. */
  dirty: boolean;
  isAdmin: boolean;
  bookingsEnabled: boolean;
}

type StepState = "done" | "current" | "todo" | "stopped";

/**
 * Draft, sent, answered, job order: where the quotation stands and the one
 * thing to do next, in a single strip. Each step is a person's click;
 * nothing here moves on its own. The details of who did what are in History.
 */
export function QuoteProgress({ quotation, dirty, isAdmin, bookingsEnabled }: QuoteProgressProps) {
  const router = useRouter();
  const toast = useToast();
  const [giving, setGiving] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [pending, startTransition] = useTransition();

  const sent = quotation.status !== "Draft";
  const awaiting = quotation.status === "Sent" || quotation.status === "Expired";
  const approved = quotation.status === "Approved" || quotation.status === "Partially Approved";
  const declined = quotation.status === "Declined";
  const cleared = pricingCleared(quotation);
  const pricingKey = specialPricingKey(quotation.lines, quotation.discountCents);
  const approval = pricingKey && quotation.pricingApproval?.key === pricingKey ? quotation.pricingApproval : null;
  const response = quotation.response;
  const busy = pending || dirty;
  const saveFirst = dirty ? "Save first" : undefined;

  const act = (work: () => Promise<{ ok: true } | { ok: false; error: string }>, success: { title: string; description?: string }) =>
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        toast({ tone: "error", title: "Not done", description: result.error, key: "quote-flow" });
        return;
      }
      toast({ tone: "success", ...success, key: "quote-flow" });
      router.refresh();
    });

  const approvePricing = () =>
    act(() => approveSpecialPricingAction(quotation.ref, pricingKey), {
      title: "Pricing approved",
      description: `${quotation.ref} can now be sent.`,
    });

  const clearAnswer = () => {
    if (!window.confirm(`Undo the recorded answer on ${quotation.ref}? The history keeps a note.`)) return;
    act(() => clearQuoteResponseAction(quotation.ref), { title: "Answer undone" });
  };

  const makeJobOrder = () => {
    const amount = formatPeso(response?.approvedTotalCents ?? 0);
    const booking =
      quotation.bookingRef && bookingsEnabled ? ` Booking ${quotation.bookingRef} takes ${amount} as its value.` : "";
    if (!window.confirm(`Make a job order for ${amount}? ${quotation.ref} is then locked.${booking}`)) return;
    startTransition(async () => {
      const result = await convertToJobOrderAction(quotation.ref);
      if (!result.ok) {
        toast({ tone: "error", title: "No job order made", description: result.error, key: "quote-flow" });
        return;
      }
      toast({
        tone: "success",
        title: result.created ? `${result.jobOrderRef} created` : `Already ${result.jobOrderRef}`,
        description: result.bookingNote ?? undefined,
        key: "quote-flow",
      });
      router.push(`/quotations/jobs/${encodeURIComponent(result.jobOrderRef)}`);
    });
  };

  // Step 2: sending, and what stands in its way.
  let sendDetail: ReactNode;
  if (sent) {
    sendDetail = quotation.status === "Expired" ? (
      <span style={{ color: "var(--status-negative)" }}>Expired {formatQuoteDay(quotation.validUntil)}</span>
    ) : (
      quotation.sent ?? "Sent"
    );
  } else if (!cleared) {
    sendDetail = (
      <>
        <span style={{ color: "var(--status-warning)" }}>Needs admin approval</span>
        {isAdmin ? (
          <Button size="sm" variant="secondary" icon="shield-check" disabled={busy} title={saveFirst} onClick={approvePricing}>
            Approve pricing
          </Button>
        ) : null}
      </>
    );
  } else if (quotation.totals.unpricedCount > 0) {
    sendDetail = <span style={{ color: "var(--status-warning)" }}>Price every line first</span>;
  } else {
    sendDetail = (
      <>
        <span>Email it, or</span>
        <Button size="sm" variant="secondary" disabled={busy} title={saveFirst} onClick={() => setGiving(true)}>
          Mark as given
        </Button>
      </>
    );
  }

  const steps: { title: string; state: StepState; detail: ReactNode; note?: string }[] = [
    {
      title: quotation.revision > 1 ? `Draft · rev ${quotation.revision}` : "Draft",
      state: "done",
      detail: `By ${quotation.preparedBy?.name ?? "—"}`,
    },
    {
      title: "Sent",
      state: sent ? "done" : "current",
      detail: sendDetail,
      note: approval ? `Pricing approved by ${approval.by.name}` : undefined,
    },
    {
      title: response ? response.outcome : "Customer answer",
      state: response ? (declined ? "stopped" : "done") : awaiting ? "current" : "todo",
      detail: response ? (
        <>
          <span>
            {response.outcome === "Declined" ? response.customerName : formatPeso(response.approvedTotalCents)} ·{" "}
            {response.at}
          </span>
          {!quotation.jobOrderRef && (
            <button type="button" onClick={clearAnswer} disabled={pending} style={LINK_BUTTON}>
              Undo
            </button>
          )}
        </>
      ) : awaiting ? (
        <Button size="sm" icon="check" disabled={busy} title={saveFirst} onClick={() => setAnswering(true)}>
          Record answer
        </Button>
      ) : (
        "After it is sent"
      ),
    },
    {
      title: "Job order",
      state: quotation.jobOrderRef ? "done" : approved ? "current" : declined ? "stopped" : "todo",
      detail: quotation.jobOrderRef ? (
        <Link href={`/quotations/jobs/${encodeURIComponent(quotation.jobOrderRef)}`} style={{ color: "var(--accent-primary)", textDecoration: "none", fontWeight: 600 }}>
          {quotation.jobOrderRef} →
        </Link>
      ) : approved ? (
        <Button size="sm" icon="wrench" disabled={busy} title={saveFirst} onClick={makeJobOrder}>
          Make job order
        </Button>
      ) : declined ? (
        "Not needed"
      ) : (
        "After approval"
      ),
    },
  ];

  return (
    <>
      <ol
        className="grid grid-cols-2 gap-x-4 gap-y-3 wide:grid-cols-4"
        style={{
          listStyle: "none",
          margin: 0,
          padding: "12px 14px",
          background: "var(--surface-card)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        {steps.map((step, index) => (
          <li key={step.title + index} className="flex min-w-0 gap-2.5">
            <StepDot state={step.state} index={index + 1} />
            <span className="flex min-w-0 flex-col" style={{ gap: 3 }}>
              <span style={{ fontSize: "12.5px", fontWeight: 700, color: step.state === "todo" ? "var(--text-muted)" : "var(--text-primary)" }}>
                {step.title}
              </span>
              <span
                className="flex flex-wrap items-center gap-x-2 gap-y-1"
                style={{ fontSize: "11.5px", color: "var(--text-secondary)", minHeight: 22 }}
              >
                {step.detail}
              </span>
              {step.note && <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{step.note}</span>}
            </span>
          </li>
        ))}
      </ol>

      {giving && <GiveModal quotation={quotation} onClose={() => setGiving(false)} />}
      {answering && <AnswerModal quotation={quotation} onClose={() => setAnswering(false)} />}
    </>
  );
}

const LINK_BUTTON = {
  border: "none",
  background: "none",
  padding: 0,
  cursor: "pointer",
  fontSize: "11.5px",
  color: "var(--accent-primary)",
  fontFamily: "var(--font-body)",
} as const;

function StepDot({ state, index }: { state: StepState; index: number }) {
  const colors: Record<StepState, { bg: string; fg: string; border: string }> = {
    done: { bg: "var(--accent-primary)", fg: "#fff", border: "var(--accent-primary)" },
    current: { bg: "var(--surface-card)", fg: "var(--accent-primary)", border: "var(--accent-primary)" },
    todo: { bg: "var(--surface-card)", fg: "var(--text-muted)", border: "var(--border-default)" },
    stopped: { bg: "var(--status-negative-soft)", fg: "var(--status-negative)", border: "var(--status-negative)" },
  };
  const tone = colors[state];
  return (
    <span
      aria-hidden
      style={{
        width: 22,
        height: 22,
        flex: "0 0 auto",
        borderRadius: "50%",
        border: `1.5px solid ${tone.border}`,
        background: tone.bg,
        color: tone.fg,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "11px",
        fontWeight: 700,
      }}
    >
      {state === "done" ? <Icon name="check" size={12} /> : state === "stopped" ? <Icon name="x" size={12} /> : index}
    </span>
  );
}

function GiveModal({ quotation, onClose }: { quotation: Quotation; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [how, setHow] = useState<string>(QUOTE_HANDOVER_METHODS[0]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await markQuotationGivenAction(quotation.ref, how);
      if (!result.ok) {
        setError(result.error);
        toast({ tone: "error", title: "Not recorded", description: result.error, key: "quote-flow" });
        return;
      }
      toast({ tone: "success", title: `${quotation.ref} marked as given`, description: how, key: "quote-flow" });
      onClose();
      router.refresh();
    });
  };

  return (
    <Modal
      title="Mark as given"
      icon="file-text"
      onClose={pending ? () => undefined : onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button icon="check" onClick={submit} disabled={pending}>
            {pending ? "Saving…" : "Mark as given"}
          </Button>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      <Field label="How did it reach the customer?">
        <select style={SELECT} value={how} onChange={(event) => setHow(event.target.value)}>
          {QUOTE_HANDOVER_METHODS.map((method) => (
            <option key={method}>{method}</option>
          ))}
        </select>
      </Field>
    </Modal>
  );
}

const OUTCOMES: { key: QuoteResponseOutcome; label: string }[] = [
  { key: "Approved", label: "Approved all" },
  { key: "Partially Approved", label: "Approved some" },
  { key: "Declined", label: "Declined" },
];

function AnswerModal({ quotation, onClose }: { quotation: Quotation; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const priced = useMemo(() => quotation.lines.filter((line) => line.unitPriceCents !== null), [quotation.lines]);
  const [outcome, setOutcome] = useState<QuoteResponseOutcome>("Approved");
  const [at, setAt] = useState(() => manilaDateTimeInput(new Date()));
  const [customerName, setCustomerName] = useState(quotation.billTo.name || quotation.billTo.company);
  const [method, setMethod] = useState<QuoteResponseMethod>("In person");
  const [note, setNote] = useState("");
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(priced.map((line) => line.id)));
  const [discountText, setDiscountText] = useState(amountInput(quotation.discountCents || null));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const approvedIds = outcome === "Approved" ? priced.map((line) => line.id) : outcome === "Declined" ? [] : [...ticked];
  const subtotal = priced
    .filter((line) => approvedIds.includes(line.id))
    .reduce((sum, line) => sum + lineAmountCents(line), 0);
  const typedDiscount = parseAmount(discountText);
  const discount =
    outcome === "Approved" ? quotation.discountCents : outcome === "Declined" ? 0 : typeof typedDiscount === "number" ? typedDiscount : 0;
  const approvedTotal = Math.max(subtotal - discount, 0);

  const submit = () => {
    if (outcome === "Partially Approved" && typedDiscount === undefined) {
      setError("The discount is not an amount.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await recordQuoteResponseAction(quotation.ref, {
        outcome,
        at,
        customerName,
        method,
        note,
        approvedLineIds: approvedIds,
        approvedDiscountCents: discount,
      });
      if (!result.ok) {
        setError(result.error);
        toast({ tone: "error", title: "Answer not recorded", description: result.error, key: "quote-flow" });
        return;
      }
      toast({
        tone: "success",
        title: `${quotation.ref} ${outcome === "Declined" ? "declined" : outcome === "Approved" ? "approved" : "partly approved"}`,
        description: outcome === "Declined" ? undefined : `${formatPeso(approvedTotal)} approved.`,
        key: "quote-flow",
      });
      onClose();
      router.refresh();
    });
  };

  return (
    <Modal
      title="Customer's answer"
      icon="check"
      width={560}
      onClose={pending ? () => undefined : onClose}
      footer={
        <>
          <span style={{ marginRight: "auto", fontSize: "13px", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {outcome === "Declined" ? "" : formatPeso(approvedTotal)}
          </span>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button icon="check" onClick={submit} disabled={pending}>
            {pending ? "Saving…" : "Save answer"}
          </Button>
        </>
      }
    >
      {quotation.status === "Expired" && (
        <Notice tone="warning">Expired {formatQuoteDay(quotation.validUntil)}. Only record it if the prices still stand.</Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Answer">
        {OUTCOMES.map((option) => (
          <Button
            key={option.key}
            size="sm"
            type="button"
            role="radio"
            aria-checked={outcome === option.key}
            variant={outcome === option.key ? "primary" : "outline"}
            onClick={() => setOutcome(option.key)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {outcome === "Partially Approved" && (
        <div className="flex flex-col gap-1.5">
          {priced.map((line) => (
            <label key={line.id} className="flex items-center gap-2" style={{ fontSize: "12.5px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={ticked.has(line.id)}
                onChange={(event) =>
                  setTicked((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(line.id);
                    else next.delete(line.id);
                    return next;
                  })
                }
              />
              <span style={{ flex: 1, minWidth: 0 }}>{line.description}</span>
              <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)" }}>
                {formatPeso(lineAmountCents(line))}
              </span>
            </label>
          ))}
          {quotation.discountCents > 0 && (
            <Field label="Discount on this work">
              <input
                style={{ ...INPUT, textAlign: "right", maxWidth: 160 }}
                inputMode="decimal"
                value={discountText}
                onChange={(event) => setDiscountText(event.target.value)}
              />
            </Field>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Who answered">
          <input style={INPUT} maxLength={120} value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
        </Field>
        <Field label="How">
          <select style={SELECT} value={method} onChange={(event) => setMethod(event.target.value as QuoteResponseMethod)}>
            {QUOTE_RESPONSE_METHODS.map((entry) => (
              <option key={entry}>{entry}</option>
            ))}
          </select>
        </Field>
        <Field label="When (Manila time)">
          <input style={INPUT} type="datetime-local" value={at} onChange={(event) => setAt(event.target.value)} />
        </Field>
        <Field label="Note">
          <input style={INPUT} maxLength={400} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

