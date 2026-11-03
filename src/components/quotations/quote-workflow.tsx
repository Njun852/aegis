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
import { PreviewModal } from "./quote-actions";
import {
  QUOTE_HANDOVER_METHODS,
  QUOTE_RESPONSE_METHODS,
  amountInput,
  discountFromPercent,
  formatPercent,
  formatPeso,
  formatQuoteDay,
  lineAmountCents,
  manilaDateTimeInput,
  parseAmount,
  pricingCleared,
  specialPricingKey,
} from "@/lib/quotations";
import type { Quotation, QuoteResponseMethod, QuoteResponseOutcome } from "@/types";

export interface QuoteFlowOptions {
  /** Null for a quotation not saved yet, which has no steps. */
  quotation: Quotation | null;
  isAdmin: boolean;
  bookingsEnabled: boolean;
}

type StepState = "done" | "current" | "todo" | "stopped";

export interface FlowStep {
  title: string;
  state: StepState;
  detail: ReactNode;
  note?: string;
}

/** The one thing to do next, for the button that stays in the same place. */
export interface NextStep {
  label: string;
  icon: string;
  /** Absent when the step cannot be taken yet; `blocked` says why. */
  run?: () => void;
  blocked?: string;
}

export interface QuoteFlow {
  steps: FlowStep[];
  next: NextStep | null;
  /** A step's dialog is open, so keyboard shortcuts leave the page alone. */
  dialogOpen: boolean;
  openPreview: () => void;
  /** The step dialogs and the preview; render once. */
  dialogs: ReactNode;
}

/**
 * Draft, sent, answered, job order: where the quotation stands and the one
 * thing to do next. The strip at the top only shows where it stands; the
 * next step is the single button in the Totals panel (or Ctrl+Enter), so
 * there is one place to act. Each step is a person's action; nothing
 * moves on its own. The details of who did what are in History.
 */
export function useQuoteFlow({ quotation, isAdmin, bookingsEnabled }: QuoteFlowOptions): QuoteFlow {
  const router = useRouter();
  const toast = useToast();
  /** The handover method the Mark as given dialog opens on, or null when it is closed. */
  const [giving, setGiving] = useState<string | null>(null);
  const [answering, setAnswering] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!quotation) return { steps: [], next: null, dialogOpen: false, openPreview: () => undefined, dialogs: null };

  const sent = quotation.status !== "Draft";
  const awaiting = quotation.status === "Sent" || quotation.status === "Expired";
  const approved = quotation.status === "Approved" || quotation.status === "Partially Approved";
  const declined = quotation.status === "Declined";
  const cleared = pricingCleared(quotation);
  const pricingKey = specialPricingKey(quotation.lines, quotation.discountCents);
  const approval = pricingKey && quotation.pricingApproval?.key === pricingKey ? quotation.pricingApproval : null;
  const response = quotation.response;
  const unpriced = quotation.totals.unpricedCount;

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
      description: `${quotation.ref} can now be printed or sent.`,
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

  const give = (method: string = QUOTE_HANDOVER_METHODS[0]) => setGiving(method);
  const readyToGive = !sent && cleared && unpriced === 0;

  // Step 2: sending, and what stands in its way.
  let sendDetail: ReactNode;
  if (sent) {
    sendDetail = quotation.status === "Expired" ? (
      <span style={{ color: "var(--status-negative)" }}>Expired {formatQuoteDay(quotation.validUntil)}</span>
    ) : (
      quotation.sent ?? "Sent"
    );
  } else if (!cleared) {
    sendDetail = <span style={{ color: "var(--status-warning)" }}>Needs admin approval</span>;
  } else if (unpriced > 0) {
    sendDetail = <span style={{ color: "var(--status-warning)" }}>Price every line first</span>;
  } else {
    sendDetail = "Ready to print, email or give";
  }

  const steps: FlowStep[] = [
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
        "Waiting for the customer"
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
        "Ready to make"
      ) : declined ? (
        "Not needed"
      ) : (
        "After approval"
      ),
    },
  ];

  // The same decisions as the strip, as the single button at the bottom.
  let next: NextStep | null;
  if (quotation.jobOrderRef) {
    const jobRef = quotation.jobOrderRef;
    next = { label: `Open ${jobRef}`, icon: "arrow-right", run: () => router.push(`/quotations/jobs/${encodeURIComponent(jobRef)}`) };
  } else if (declined) {
    next = null;
  } else if (approved) {
    next = { label: "Make job order", icon: "wrench", run: makeJobOrder };
  } else if (awaiting) {
    next = { label: "Record answer", icon: "check", run: () => setAnswering(true) };
  } else if (!cleared) {
    next = isAdmin
      ? { label: "Approve pricing", icon: "shield-check", run: approvePricing }
      : {
          label: "Needs admin approval",
          icon: "shield-check",
          blocked: "An administrator must approve the discount or below-cost pricing before it is given.",
        };
  } else if (unpriced > 0) {
    next = {
      label: "Price every line first",
      icon: "alert-triangle",
      blocked: `${unpriced} ${unpriced === 1 ? "line has" : "lines have"} no price yet. Preview and print still work.`,
    };
  } else {
    next = { label: "Preview & give", icon: "eye", run: () => setPreviewing(true) };
  }
  if (next?.run && pending) next = { ...next, run: undefined, blocked: "Working…" };

  const dialogs = (
    <>
      {previewing && (
        <PreviewModal
          quotation={quotation}
          onClose={() => setPreviewing(false)}
          onGive={
            readyToGive
              ? (printed) => {
                  setPreviewing(false);
                  give(printed ? "Printed and handed over" : QUOTE_HANDOVER_METHODS[0]);
                }
              : undefined
          }
        />
      )}
      {giving !== null && <GiveModal quotation={quotation} defaultMethod={giving} onClose={() => setGiving(null)} />}
      {answering && <AnswerModal quotation={quotation} onClose={() => setAnswering(false)} />}
    </>
  );

  return {
    steps,
    next,
    dialogOpen: previewing || giving !== null || answering,
    openPreview: () => setPreviewing(true),
    dialogs,
  };
}

/** The strip at the top: every step, where the quotation is, and who did what. */
export function QuoteProgress({ steps }: { steps: FlowStep[] }) {
  return (
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

function GiveModal({ quotation, defaultMethod, onClose }: { quotation: Quotation; defaultMethod: string; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [how, setHow] = useState<string>(defaultMethod);
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
          {/* Focused on open, so Enter confirms without reaching for the mouse. */}
          <Button icon="check" onClick={submit} disabled={pending} autoFocus>
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
  // A percentage discount applies to whatever part of the work is approved.
  const percent = quotation.discountPercent;
  const discount =
    outcome === "Approved"
      ? quotation.discountCents
      : outcome === "Declined"
        ? 0
        : percent
          ? Math.min(discountFromPercent(subtotal, percent), quotation.discountCents)
          : typeof typedDiscount === "number"
            ? typedDiscount
            : 0;
  const approvedTotal = Math.max(subtotal - discount, 0);

  const submit = () => {
    if (outcome === "Partially Approved" && !percent && typedDiscount === undefined) {
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
          {quotation.discountCents > 0 && percent && (
            <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              Discount {formatPercent(percent)} of the approved work: {formatPeso(discount)}
            </span>
          )}
          {quotation.discountCents > 0 && !percent && (
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

