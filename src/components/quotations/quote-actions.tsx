"use client";

import { useState, useTransition } from "react";
import { sendQuotationAction } from "@/app/actions/quotations";
import { useToast } from "@/components/layout/toast-provider";
import { Button } from "@/components/ui";
import { Field, INPUT, Modal, Notice } from "@/components/forms/form-kit";
import type { Quotation } from "@/types";

export interface QuoteActionsProps {
  quotation: Quotation;
  dirty: boolean;
  unpricedCount: number;
  mailConnected: boolean;
  /** The defaults the compose box opens with. */
  email: { subject: string; body: string };
  /** Saves the editor; resolves with the ref, or null when the save was refused. */
  save: () => Promise<string | null>;
}

function pdfUrl(ref: string, version: string, download = false) {
  // The version keeps the browser from showing a PDF cached before the last save.
  const params = new URLSearchParams({ v: version });
  if (download) params.set("download", "1");
  return `/api/quotations/${encodeURIComponent(ref)}/pdf?${params}`;
}

/**
 * Preview, download and email. Each works on the saved quotation, so unsaved
 * edits are saved first: the customer must never receive a PDF that differs
 * from what the screen showed.
 */
export function QuoteActions({ quotation, dirty, unpricedCount, mailConnected, email, save }: QuoteActionsProps) {
  const toast = useToast();
  const [previewing, setPreviewing] = useState(false);
  const [composing, setComposing] = useState(false);

  const afterSave = async (next: () => void) => {
    if (dirty && !(await save())) return;
    next();
  };

  const unpriced =
    unpricedCount > 0
      ? `${unpricedCount} ${unpricedCount === 1 ? "line has" : "lines have"} no price yet.`
      : null;

  return (
    <>
      <Button variant="secondary" icon="eye" onClick={() => void afterSave(() => setPreviewing(true))}>
        Preview
      </Button>
      <Button
        variant="secondary"
        icon="arrow-down"
        disabled={unpriced !== null}
        title={unpriced ?? "Download the PDF"}
        onClick={() =>
          void afterSave(() => {
            // The response is an attachment, so the page stays where it is.
            window.location.href = pdfUrl(quotation.ref, `${Date.now()}`, true);
            toast({ tone: "info", title: "Downloading PDF", description: `${quotation.ref}.pdf`, key: "quote-pdf" });
          })
        }
      >
        PDF
      </Button>
      <Button
        variant="secondary"
        icon="send"
        disabled={unpriced !== null || !mailConnected}
        title={
          !mailConnected
            ? "No mailbox is connected for this business. An administrator connects one in Business Management."
            : (unpriced ?? "Email the PDF to the customer")
        }
        onClick={() => void afterSave(() => setComposing(true))}
      >
        Email
      </Button>

      {previewing && (
        <Modal title={`${quotation.ref} preview`} icon="file-text" width={880} onClose={() => setPreviewing(false)}>
          {unpriced && <Notice tone="warning">{unpriced} Its price and amount are blank in this preview.</Notice>}
          <iframe
            title={`${quotation.ref} PDF`}
            src={pdfUrl(quotation.ref, quotation.updatedAt)}
            style={{
              width: "100%",
              height: "72vh",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md)",
              background: "var(--surface-inset)",
            }}
          />
        </Modal>
      )}

      {composing && (
        <ComposeModal
          quotation={quotation}
          defaults={email}
          onClose={() => setComposing(false)}
          onSent={(to) => {
            setComposing(false);
            toast({ tone: "success", title: `${quotation.ref} sent`, description: `Emailed to ${to} with the PDF attached.` });
          }}
        />
      )}
    </>
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
