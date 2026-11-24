"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import {
  approveSpecialPricingAction,
  convertToJobOrderAction,
  markQuotationGivenAction,
  recordPaperJobOrderAction,
} from "@/app/actions/quotations";
import { useToast } from "@/components/layout/toast-provider";
import { Button, Icon } from "@/components/ui";
import { Field, Modal, Notice, SELECT } from "@/components/forms/form-kit";
import { PreviewModal } from "./quote-actions";
import { QUOTE_HANDOVER_METHODS, formatPeso, formatQuoteDay, pricingCleared, specialPricingKey } from "@/lib/quotations";
import type { Quotation } from "@/types";

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
 * Draft, sent, job order: where the quotation stands and the one
 * thing to do next. The strip at the top only shows where it stands; the
 * next step is the single button in the Totals panel (or Ctrl+Enter), so
 * there is one place to act. Each step is a person's action; nothing
 * moves on its own. The details of who did what are in History.
 *
 * There is no separate customer-answer step: making the job order from a
 * quotation that was given is the approval, recorded on the server. Answers
 * recorded on older quotations (partial approvals, declines) still show.
 */
export function useQuoteFlow({ quotation, isAdmin, bookingsEnabled }: QuoteFlowOptions): QuoteFlow {
  const router = useRouter();
  const toast = useToast();
  /** The handover method the Mark as given dialog opens on, or null when it is closed. */
  const [giving, setGiving] = useState<string | null>(null);
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

  const paper = quotation.paperJobOrder;

  const makeJobOrder = () => {
    // An answer recorded on an older quotation keeps its amount; otherwise the
    // whole quotation is approved by making the job order.
    const amount = formatPeso(response?.approvedTotalCents ?? quotation.totals.totalCents);
    const booking =
      quotation.bookingRef && bookingsEnabled ? ` Booking ${quotation.bookingRef} takes ${amount} as its value.` : "";
    const approves = paper
      ? " It is the paper job order, so there is nothing to give or approve; parts linked to stock leave Inventory now."
      : response
        ? ""
        : " This records the customer's approval of the whole quotation.";
    const question = paper ? `Record the job order for ${amount}?` : `Make a job order for ${amount}?`;
    if (!window.confirm(`${question}${approves} ${quotation.ref} is then locked.${booking}`)) return;
    startTransition(async () => {
      const result = paper
        ? await recordPaperJobOrderAction(quotation.ref)
        : await convertToJobOrderAction(quotation.ref);
      if (!result.ok) {
        toast({ tone: "error", title: "No job order made", description: result.error, key: "quote-flow" });
        return;
      }
      toast({
        tone: "success",
        title: result.created ? `${result.jobOrderRef} created` : `Already ${result.jobOrderRef}`,
        description: [result.bookingNote, result.stockNote].filter(Boolean).join(" ") || undefined,
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

  const jobLink = quotation.jobOrderRef ? (
    <Link href={`/quotations/jobs/${encodeURIComponent(quotation.jobOrderRef)}`} style={{ color: "var(--accent-primary)", textDecoration: "none", fontWeight: 600 }}>
      {quotation.jobOrderRef} →
    </Link>
  ) : null;

  // A scanned paper job order: the work already exists, so it is checked and recorded, not given and approved.
  const paperSteps: FlowStep[] = [
    {
      title: "Scanned",
      state: "done",
      detail: `${quotation.photoRef ?? "Paper job order"} · by ${quotation.preparedBy?.name ?? "—"}`,
    },
    {
      title: "Job order",
      state: quotation.jobOrderRef ? "done" : "current",
      detail:
        jobLink ??
        (!cleared ? (
          <span style={{ color: "var(--status-warning)" }}>Needs admin approval</span>
        ) : unpriced > 0 ? (
          <span style={{ color: "var(--status-warning)" }}>Price every line first</span>
        ) : (
          "Check the lines against the scan, then record it"
        )),
      note: approval ? `Pricing approved by ${approval.by.name}` : undefined,
    },
  ];

  const steps: FlowStep[] = paper ? paperSteps : [
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
      title: "Job order",
      state: quotation.jobOrderRef ? "done" : approved || awaiting ? "current" : declined ? "stopped" : "todo",
      detail: jobLink ? (
        jobLink
      ) : approved ? (
        "Approved, ready to make"
      ) : awaiting ? (
        "Make it once the customer agrees"
      ) : declined ? (
        "Declined, not needed"
      ) : (
        "After it is given"
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
  } else if (approved || awaiting) {
    next = { label: "Make job order", icon: "wrench", run: makeJobOrder };
  } else if (paper && cleared && unpriced === 0) {
    next = { label: "Record job order", icon: "wrench", run: makeJobOrder };
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
    </>
  );

  return {
    steps,
    next,
    dialogOpen: previewing || giving !== null,
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
