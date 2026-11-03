"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { sendQuotationAction } from "@/app/actions/quotations";
import { useToast } from "@/components/layout/toast-provider";
import { Button } from "@/components/ui";
import { Field, INPUT, Modal, Notice } from "@/components/forms/form-kit";
import { pricingCleared } from "@/lib/quotations";
import type { Quotation } from "@/types";
import type { QuoteFlow } from "./quote-workflow";

function pdfUrl(ref: string, version: string, download = false) {
  // The version keeps the browser from showing a PDF cached before the last save.
  const params = new URLSearchParams({ v: version });
  if (download) params.set("download", "1");
  return `/api/quotations/${encodeURIComponent(ref)}/pdf?${params}`;
}

const NOT_APPROVED = "An administrator must approve the discount or below-cost pricing first.";

/**
 * The PDF as the customer would get it, with Print and Download beside it,
 * so it is always seen before it leaves the shop. Printing needs no email.
 * Once printed, Mark as given records the handover in the same place.
 */
export function PreviewModal({
  quotation,
  onClose,
  onGive,
}: {
  quotation: Quotation;
  onClose: () => void;
  /** Offered when the quotation can be given now; `printed` picks the handover method. */
  onGive?: (printed: boolean) => void;
}) {
  const toast = useToast();
  const frame = useRef<HTMLIFrameElement>(null);
  const giveButton = useRef<HTMLButtonElement>(null);
  const [printed, setPrinted] = useState(false);
  const unpriced = quotation.totals.unpricedCount;
  // Special pricing waits for an administrator before any copy leaves the shop.
  const blocked = pricingCleared(quotation) ? null : NOT_APPROVED;
  const url = pdfUrl(quotation.ref, quotation.updatedAt);

  const print = () => {
    const view = frame.current?.contentWindow;
    try {
      view?.focus();
      view?.print();
    } catch {
      // A browser that cannot print a framed PDF opens it in a tab to print from there.
      window.open(url, "_blank", "noopener");
    }
    setPrinted(true);
    toast({ tone: "info", title: `Printing ${quotation.ref}`, description: "Choose the printer in the print window.", key: "quote-pdf" });
    window.setTimeout(() => giveButton.current?.focus(), 0);
  };

  const download = () => {
    // The response is an attachment, so the page stays where it is.
    window.location.href = pdfUrl(quotation.ref, `${Date.now()}`, true);
    toast({ tone: "info", title: "Downloading PDF", description: `${quotation.ref}.pdf`, key: "quote-pdf" });
  };

  return (
    <Modal
      title={`${quotation.ref} preview`}
      icon="file-text"
      width={880}
      onClose={onClose}
      footer={
        <>
          {blocked && <span style={{ marginRight: "auto", fontSize: "12px", color: "var(--status-warning)" }}>{blocked}</span>}
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="secondary" icon="arrow-down" disabled={blocked !== null} title={blocked ?? "Download the PDF"} onClick={download}>
            Download
          </Button>
          <Button
            variant={onGive && printed ? "secondary" : "primary"}
            icon="file-text"
            disabled={blocked !== null}
            title={blocked ?? "Print the quotation"}
            autoFocus={blocked === null}
            onClick={print}
          >
            Print
          </Button>
          {onGive && (
            <Button ref={giveButton} variant={printed ? "primary" : "secondary"} icon="check" onClick={() => onGive(printed)}>
              Mark as given
            </Button>
          )}
        </>
      }
    >
      {unpriced > 0 && (
        <Notice tone="warning">
          {unpriced} {unpriced === 1 ? "line has" : "lines have"} no price yet. {unpriced === 1 ? "Its" : "Their"} price and amount
          print blank.
        </Notice>
      )}
      <iframe
        ref={frame}
        title={`${quotation.ref} PDF`}
        src={url}
        style={{
          width: "100%",
          height: "70vh",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-md)",
          background: "var(--surface-inset)",
        }}
      />
    </Modal>
  );
}

export interface QuoteActionsOptions {
  /** Null until the first save. */
  quotation: Quotation | null;
  flow: QuoteFlow;
  dirty: boolean;
  saving: boolean;
  /** Made into a job order: nothing to save, only the job order to open. */
  locked: boolean;
  /** "Save", or "Save as revision 3" once the customer has a copy. */
  saveLabel: string;
  /** Lines without a price as typed, saved or not. */
  unpricedCount: number;
  mailConnected: boolean;
  /** The defaults the compose box opens with. */
  email: { subject: string; body: string } | null;
  /** Saves the editor; resolves with the ref, or null when the save was refused. */
  save: () => Promise<string | null>;
}

export interface QuoteActions {
  /** The one button that is always the next thing to do; null once there is nothing left. */
  primary: { label: string; icon: string; run?: () => void; blocked?: string } | null;
  /** Whether the primary button is Save. */
  needsSave: boolean;
  /** What the line under the primary button says. */
  hint: { text: string; warn: boolean };
  hasQuotation: boolean;
  saving: boolean;
  preview: () => void;
  emailBlocked: string | null;
  email: () => void;
  /** The compose box; render once. */
  dialogs: ReactNode;
}

/**
 * What the quotation's buttons do, shared by the header and the Totals
 * panel. The main button is always the next thing to do and changes in
 * place: Save, then Approve pricing, Preview & give, Record answer, Make job
 * order. After saving, the next stage is under the same cursor. Ctrl+S saves
 * and Ctrl+Enter takes the next step from anywhere on the page.
 */
export function useQuoteActions({
  quotation,
  flow,
  dirty,
  saving,
  locked,
  saveLabel,
  unpricedCount,
  mailConnected,
  email,
  save,
}: QuoteActionsOptions): QuoteActions {
  const toast = useToast();
  const [composing, setComposing] = useState(false);

  const afterSave = async (next: () => void) => {
    if (dirty && !(await save())) return;
    next();
  };

  const needsSave = !locked && (dirty || !quotation);
  const primary: QuoteActions["primary"] = needsSave
    ? { label: saving ? "Saving…" : saveLabel, icon: "check", run: saving ? undefined : () => void save() }
    : flow.next;

  const emailBlocked = !quotation
    ? "Save first"
    : !mailConnected
      ? "No mailbox is connected for this business. An administrator connects one in Business Management."
      : quotation.jobOrderRef
        ? `${quotation.ref} is already job order ${quotation.jobOrderRef}.`
        : quotation.totals.unpricedCount > 0 || (dirty && unpricedCount > 0)
          ? `${unpricedCount} ${unpricedCount === 1 ? "line has" : "lines have"} no price yet.`
          : pricingCleared(quotation)
            ? null
            : NOT_APPROVED;

  const hint =
    primary?.blocked && !needsSave
      ? { text: primary.blocked, warn: true }
      : needsSave
        ? { text: "Ctrl+S saves", warn: false }
        : primary
          ? { text: "Ctrl+Enter does the next step", warn: false }
          : { text: "Nothing more to do on this quotation", warn: false };

  // The listener is added once and reads the latest state through the ref.
  const onKey = useRef<(event: KeyboardEvent) => void>(() => undefined);
  useEffect(() => {
    onKey.current = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (flow.dialogOpen || composing) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        if (needsSave && !saving) void save();
      } else if (key === "enter") {
        event.preventDefault();
        primary?.run?.();
      }
    };
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKey.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  return {
    primary,
    needsSave,
    hint,
    hasQuotation: quotation !== null,
    saving,
    preview: () => void afterSave(flow.openPreview),
    emailBlocked,
    email: () => void afterSave(() => setComposing(true)),
    dialogs:
      composing && quotation && email ? (
        <ComposeModal
          quotation={quotation}
          defaults={email}
          onClose={() => setComposing(false)}
          onSent={(to) => {
            setComposing(false);
            toast({ tone: "success", title: `${quotation.ref} sent`, description: `Emailed to ${to} with the PDF attached.` });
          }}
        />
      ) : null,
  };
}

/** The main button: Save, or whatever the next stage is. */
export function NextStepButton({ actions, fullWidth }: { actions: QuoteActions; fullWidth?: boolean }) {
  const { primary, needsSave } = actions;
  if (!primary) {
    return (
      <Button variant="secondary" icon="x" disabled fullWidth={fullWidth}>
        Declined
      </Button>
    );
  }
  return (
    <Button
      icon={primary.icon}
      disabled={!primary.run}
      fullWidth={fullWidth}
      title={primary.blocked ?? (needsSave ? "Ctrl+S" : "Ctrl+Enter")}
      onClick={() => primary.run?.()}
    >
      {primary.label}
    </Button>
  );
}

/**
 * For a quotation that became a job order, whose form is locked: printing it
 * again and opening the job order stay at the top of the page.
 */
export function QuoteLockedActions({ actions }: { actions: QuoteActions }) {
  return (
    <>
      <Button variant="secondary" icon="eye" onClick={actions.preview}>
        Preview / Print
      </Button>
      <NextStepButton actions={actions} />
    </>
  );
}

/**
 * Every action on the quotation, at the foot of the Totals panel where
 * pricing ends: the main button, which is always the next thing to do,
 * Preview / Print and Email under it, and what is in the way or the shortcut.
 */
export function QuoteTotalsAction({ actions }: { actions: QuoteActions }) {
  return (
    <div className="aegis-no-print flex flex-col gap-2" style={{ paddingTop: 10, borderTop: "1px solid var(--border-subtle)" }}>
      <NextStepButton actions={actions} fullWidth />
      {actions.hasQuotation && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="sm" icon="eye" fullWidth disabled={actions.saving} onClick={actions.preview}>
            Preview / Print
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon="send"
            fullWidth
            disabled={actions.emailBlocked !== null || actions.saving}
            title={actions.emailBlocked ?? "Email the PDF to the customer"}
            onClick={actions.email}
          >
            Email
          </Button>
        </div>
      )}
      <span
        style={{
          fontSize: "11px",
          textAlign: "center",
          color: actions.hint.warn ? "var(--status-warning)" : "var(--text-muted)",
          textWrap: "pretty",
        }}
      >
        {actions.hint.text}
      </span>
    </div>
  );
}

function ComposeModal({
  quotation,
  defaults,
  onClose,
  onSent,
}: {
  quotation: Quotation;
  defaults: { subject: string; body: string };
  onClose: () => void;
  onSent: (to: string) => void;
}) {
  const toast = useToast();
  const [to, setTo] = useState(quotation.billTo.email);
  const [subject, setSubject] = useState(defaults.subject);
  const [body, setBody] = useState(defaults.body);
  const [error, setError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();

  const send = () => {
    setError(null);
    startSending(async () => {
      const result = await sendQuotationAction(quotation.ref, { to, subject, body });
      if (!result.ok) {
        setError(result.error);
        toast({ tone: "error", title: "Not sent", description: result.error, key: "quote-send" });
        return;
      }
      onSent(result.to);
    });
  };

  return (
    <Modal
      title={`Email ${quotation.ref}`}
      icon="send"
      onClose={sending ? () => undefined : onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button icon="send" onClick={send} disabled={sending}>
            {sending ? "Sending…" : "Send"}
          </Button>
        </>
      }
    >
      {quotation.status === "Sent" && (
        <Notice tone="info">
          Already emailed to {quotation.sentTo} on {quotation.sent}. Sending again sends the current version.
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <Field label="To" required>
        <input style={INPUT} type="email" value={to} onChange={(event) => setTo(event.target.value)} />
      </Field>
      <Field label="Subject" required>
        <input style={INPUT} value={subject} maxLength={200} onChange={(event) => setSubject(event.target.value)} />
      </Field>
      <Field label="Message" required>
        <textarea
          rows={9}
          maxLength={4000}
          style={{ ...INPUT, resize: "vertical", lineHeight: 1.5 }}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </Field>
      <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
        Sent from the business mailbox with the quotation attached as a PDF. Cost and margin are never included.
      </span>
    </Modal>
  );
}
