"use client";

import { useState, useTransition } from "react";
import type { CSSProperties } from "react";
import { draftEmailAction } from "@/app/actions/ai";
import { sendEmailAction } from "@/app/actions/mail";
import { useToast } from "@/components/layout/toast-provider";
import { Badge, Button, Icon, IconButton } from "@/components/ui";
import { useTypewriter } from "@/hooks/use-typewriter";
import { readRecipients } from "@/lib/mail-recipients";

const FIELD_INPUT: CSSProperties = {
  flex: 1,
  minWidth: 0,
  border: 0,
  outline: "none",
  font: "inherit",
  fontSize: "13.5px",
  color: "var(--text-primary)",
  background: "transparent",
};

const FIELD_ROW: CSSProperties = { padding: "11px 18px", borderBottom: "1px solid var(--border-subtle)" };
const FIELD_LABEL: CSSProperties = { flex: "0 0 52px", fontSize: "12px", color: "var(--text-muted)" };

export interface ComposeModalProps {
  open: boolean;
  /** Whether this install has an OpenAI key, so drafting can be offered. */
  aiEnabled: boolean;
  /** The connected mailbox address, or null when none is connected. */
  mailbox: string | null;
  onClose: () => void;
}

export function ComposeModal({
  open,
  aiEnabled,
  mailbox,
  onClose,
}: ComposeModalProps) {
  const toast = useToast();
  const [ccOpen, setCcOpen] = useState(false);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [intent, setIntent] = useState("");
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const [drafting, startDrafting] = useTransition();
  /** A generated body being typed into the textarea. Null once someone edits. */
  const [incoming, setIncoming] = useState<string | null>(null);

  const { shown } = useTypewriter(incoming);

  /**
   * While a draft is arriving the textarea shows the reveal; the moment anyone
   * types, the revealed text becomes ordinary `body` state and the animation is
   * abandoned. Deriving it this way means no effect has to copy one piece of
   * state into another.
   */
  const shownBody = incoming === null ? body : shown;

  if (!open) return null;

  const discard = () => {
    setTo("");
    setCc("");
    setBcc("");
    setError(null);
    setSubject("");
    setBody("");
    setIntent("");
    setDraftNote(null);
    setIncoming(null);
    setCcOpen(false);
    onClose();
  };

  /**
   * One call per press, and the result is cached against the recipient and
   * intent — so pressing Draft again on an unchanged brief is free.
   */
  const handleDraft = () => {
    setDraftNote(null);
    startDrafting(async () => {
      const result = await draftEmailAction(to, intent);
      if (result.subject && result.body) {
        setSubject(result.subject);
        // The body lands through the typewriter below rather than all at once,
        // so it reads as being written into the message.
        setIncoming(result.body);
        setDraftNote("Draft written — edit it before sending.");
      } else {
        setDraftNote(result.note);
      }
    });
  };

  /**
   * Sends for real, from the connected mailbox. The addresses are checked here
   * first and again on the server; the person confirms who it goes to, since
   * the button leaves the building.
   */
  const handleSend = () => {
    const read = readRecipients({ to, cc, bcc });
    if (!read.ok) {
      setError(read.error);
      if (!ccOpen && /^(Cc|Bcc):/.test(read.error)) setCcOpen(true);
      return;
    }
    const text = shownBody.trim();
    if (!subject.trim() && !text) {
      setError("Write a subject or a message first.");
      return;
    }
    // The addresses are good now, so an earlier complaint about them goes.
    setError(null);
    const { recipients } = read;
    const who = [
      `To: ${recipients.to.join(", ")}`,
      recipients.cc.length ? `Cc: ${recipients.cc.join(", ")}` : "",
      recipients.bcc.length ? `Bcc: ${recipients.bcc.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    if (!window.confirm(`Send this email${subject.trim() ? "" : " with no subject"}?\n\n${who}`)) return;

    setError(null);
    startSending(async () => {
      try {
        const result = await sendEmailAction({ to, cc, bcc, subject, body: text });
        if (!result.sent) {
          setError(result.error);
          toast({ tone: "error", title: "Email not sent", description: result.error ?? "It could not be sent.", key: "compose-send" });
          return;
        }
        toast({
          tone: "success",
          title: "Email sent",
          description: `Delivered to Gmail for ${result.recipients} ${result.recipients === 1 ? "recipient" : "recipients"}. The copy is in Gmail's Sent folder.`,
          key: "compose-send",
        });
        discard();
      } catch {
        const message = "The send did not complete. Check Gmail's Sent folder before trying again.";
        setError(message);
        toast({ tone: "error", title: "Email not sent", description: message, key: "compose-send" });
      }
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-8">
      <div
        onClick={onClose}
        className="absolute inset-0"
        style={{ background: "rgba(23,28,37,.28)" }}
      />
      <div
        className="relative flex max-h-full w-full max-w-[720px] flex-col overflow-hidden"
        style={{
          background: "var(--surface-card)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-popover)",
        }}
      >
        <div
          className="flex flex-none items-center gap-3"
          style={{ padding: "16px 18px", borderBottom: "1px solid var(--border-subtle)" }}
        >
          <span
            style={{
              width: 30,
              height: 30,
              flex: "0 0 auto",
              borderRadius: "var(--radius-sm)",
              background: "var(--accent-soft)",
              color: "var(--accent-primary)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="pen-line" size={16} />
          </span>
          <span className="flex min-w-0 flex-col leading-[1.25]">
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "15px",
                fontWeight: 700,
                letterSpacing: "-.015em",
              }}
            >
              New Message
            </span>
            <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
              {mailbox
                ? `Sending as ${mailbox}`
                : "No mailbox connected — this cannot be sent"}
            </span>
          </span>
          <span className="ml-auto flex items-center gap-2">
            <Badge tone="positive" icon="shield-check">
              Gmail
            </Badge>
            <IconButton icon="minus" size={32} label="Minimize" onClick={onClose} />
            <IconButton icon="x" size={32} label="Close" onClick={onClose} />
          </span>
        </div>

        <div className="flex flex-none flex-col">
          <div className="flex items-center gap-3" style={FIELD_ROW}>
            <label htmlFor="compose-to" style={FIELD_LABEL}>
              To
            </label>
            <input
              id="compose-to"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="name@company.com, another@company.com"
              style={FIELD_INPUT}
            />
            <button
              type="button"
              onClick={() => setCcOpen((v) => !v)}
              aria-expanded={ccOpen}
              style={{
                flex: "0 0 auto",
                border: 0,
                background: "none",
                padding: 0,
                font: "inherit",
                fontSize: "12px",
                fontWeight: 600,
                color: "var(--accent-primary)",
                cursor: "pointer",
              }}
            >
              {ccOpen ? "Hide Cc / Bcc" : "Cc / Bcc"}
            </button>
          </div>

          {ccOpen && (
            <>
              <div className="flex items-center gap-3" style={FIELD_ROW}>
                <label htmlFor="compose-cc" style={FIELD_LABEL}>
                  Cc
                </label>
                <input
                  id="compose-cc"
                  value={cc}
                  onChange={(event) => setCc(event.target.value)}
                  placeholder="Copied in; everyone sees them"
                  style={FIELD_INPUT}
                />
              </div>
              <div className="flex items-center gap-3" style={FIELD_ROW}>
                <label htmlFor="compose-bcc" style={FIELD_LABEL}>
                  Bcc
                </label>
                <input
                  id="compose-bcc"
                  value={bcc}
                  onChange={(event) => setBcc(event.target.value)}
                  placeholder="Copied in; hidden from the others"
                  style={FIELD_INPUT}
                />
              </div>
            </>
          )}

          <label
            className="flex items-center gap-3"
            style={{ padding: "11px 18px", borderBottom: "1px solid var(--border-subtle)" }}
          >
            <span style={{ flex: "0 0 52px", fontSize: "12px", color: "var(--text-muted)" }}>
              Subject
            </span>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Add a subject"
              style={{
                flex: 1,
                minWidth: 0,
                border: 0,
                outline: "none",
                font: "inherit",
                fontSize: "13.5px",
                fontWeight: 600,
                color: "var(--text-primary)",
                background: "transparent",
              }}
            />
          </label>
        </div>

        <div
          className="flex flex-col gap-3.5"
          style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 18px" }}
        >
          <textarea
            value={shownBody}
            onChange={(event) => {
              // Typing takes ownership: keep what has been revealed so far and
              // stop the animation from overwriting it.
              setIncoming(null);
              setBody(event.target.value);
            }}
            placeholder="Write your message…"
            style={{
              width: "100%",
              minHeight: 190,
              resize: "vertical",
              border: "1px solid transparent",
              borderRadius: "var(--radius-md)",
              outline: "none",
              font: "inherit",
              fontSize: "13.5px",
              lineHeight: "21px",
              color: "var(--text-primary)",
              background: "transparent",
            }}
          />
          <div
            className="flex flex-col gap-[9px]"
            style={{
              padding: "13px 15px",
              border: "1px solid var(--blue-200)",
              background: "var(--surface-active)",
              borderRadius: "var(--radius-lg)",
            }}
          >
            <div className="flex items-center gap-2">
              <span style={{ color: "var(--accent-primary)", display: "inline-flex" }}>
                <Icon name="sparkles" size={14} />
              </span>
              <span
                style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-accent)" }}
              >
                AI Assist
              </span>
              <span style={{ marginLeft: "auto", fontSize: "11px", color: "var(--text-secondary)" }}>
                {aiEnabled
                  ? "Say what it should do and AI writes it"
                  : "Drafts from your inbox context"}
              </span>
            </div>

            {aiEnabled ? (
              <>
                <div className="flex items-center gap-2">
                  <input
                    value={intent}
                    onChange={(event) => setIntent(event.target.value)}
                    placeholder="Accept the 24-month terms, ask them to send paperwork"
                    aria-label="What should this email do?"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      height: 34,
                      padding: "0 11px",
                      font: "inherit",
                      fontSize: "12.5px",
                      color: "var(--text-primary)",
                      background: "var(--surface-card)",
                      border: "1px solid var(--blue-200)",
                      borderRadius: "var(--radius-sm)",
                      outline: "none",
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    icon="sparkles"
                    disabled={drafting || !intent.trim()}
                    onClick={handleDraft}
                  >
                    {drafting ? "Drafting…" : "Draft"}
                  </Button>
                </div>
                {draftNote && (
                  <span
                    style={{
                      fontSize: "11px",
                      color: "var(--text-secondary)",
                      textWrap: "pretty",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {draftNote}
                  </span>
                )}
              </>
            ) : (
              /*
                No key configured. This used to offer canned drafts written
                against the sample inbox — one of which committed the business
                to a 3% rate adjustment, which is exactly what the drafting
                guardrails forbid. Better to say nothing is available.
              */
              <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                AI drafting is not switched on for this workspace.
              </span>
            )}
          </div>
        </div>

        <div
          className="flex flex-none items-center gap-2.5"
          style={{
            padding: "14px 18px",
            borderTop: "1px solid var(--border-subtle)",
            background: "var(--gray-25)",
          }}
        >
          <Button
            variant="primary"
            size="md"
            icon="send"
            onClick={handleSend}
            disabled={sending || !mailbox || !to.trim()}
          >
            {sending ? "Sending…" : "Send"}
          </Button>
          <span
            role={error ? "alert" : undefined}
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: "11.5px",
              color: error ? "var(--status-negative)" : "var(--text-muted)",
              overflowWrap: "anywhere",
            }}
          >
            {error ??
              (mailbox
                ? "Separate several addresses with commas. Nothing is saved until it is sent."
                : "Connect a mailbox in Business Management to send.")}
          </span>
          <IconButton icon="trash-2" size={34} label="Discard" onClick={discard} disabled={sending} />
        </div>
      </div>
    </div>
  );
}
