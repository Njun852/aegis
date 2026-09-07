"use client";

import { useRef, useState, useTransition } from "react";
import { useTypewriter } from "@/hooks/use-typewriter";
import { draftReplyAction } from "@/app/actions/ai";
import { sendReplyAction } from "@/app/actions/mail";
import { useSync } from "@/components/layout/sync-provider";
import { useToast } from "@/components/layout/toast-provider";
import {
  Avatar,
  Badge,
  Button,
  Icon,
  IconButton,
} from "@/components/ui";
import { CURRENT_USER, ORGANIZATION } from "@/lib/data/workspace";
import { getPriorityStyle } from "@/lib/mail";
import { replyPolicy } from "@/lib/mail-reply-policy";
import type { MailMessage, SentReply } from "@/types";

export interface MessageDetailProps {
  message: MailMessage;
  /** Returns to the message list, which shares this pane. */
  onBack: () => void;
  /** The connected mailbox address, or null when none is connected. */
  mailbox: string | null;
}

export function MessageDetail({
  message,
  onBack,
  mailbox,
}: MessageDetailProps) {
  const priority = getPriorityStyle(message.priority);
  const policy = replyPolicy(message.category);
  const toast = useToast();
  const { connected: mailboxConnected } = useSync();
  const [drafting, startDrafting] = useTransition();
  const [, startSending] = useTransition();
  // The stored field is the source of truth; this only carries a draft written
  // in this session until the route revalidates and the prop catches up.
  /**
   * The composer's text. Owned here rather than by the workspace because the
   * detail is keyed by message id: opening another message remounts this, so
   * each message starts from its own stored Suggested Reply with no effect to
   * copy the prop into state.
   */
  const [draft, setDraft] = useState(message.suggestedReply ?? "");
  /** Whether this message has a stored Suggested Reply yet. */
  const [storedDraft, setStoredDraft] = useState(message.suggestedReply);
  /** What the user typed to steer a draft, and which steer is in flight. */
  const [prompt, setPrompt] = useState("");
  const [activeSteer, setActiveSteer] = useState<string | null>(null);
  /** Text currently being revealed into the composer, a character at a time. */
  const [reveal, setReveal] = useState<string | null>(null);
  /**
   * The reply panel is closed until it is wanted.
   *
   * Open, it is around 390px — more than half the pane on a laptop, which left
   * the message itself 191px and unreadable. Reading comes first; replying is
   * something you choose to start, and the collapsed bar still shows the
   * Suggested Reply so the field is never hidden.
   */
  const [replyOpen, setReplyOpen] = useState(false);

  const { shown, done } = useTypewriter(reveal, { durationMs: 1400 });
  /** True while a finished draft is still filling the box. */
  const writing = reveal !== null && !done;
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  // Seeded from the stored record, so replies survive a reload rather than
  // living only as long as the component that sent them.
  const [sentReplies, setSentReplies] = useState<SentReply[]>(
    message.sentReplies,
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleDraftChange = (value: string) => {
    if (sent) setSent(false);
    setDraft(value);
  };

  /** Puts a finished draft in the box and lets it type itself in. */
  const revealIntoComposer = (body: string) => {
    if (sent) setSent(false);
    setReplyOpen(true);
    setDraft(body);
    setReveal(body);
  };

  /**
   * Writes a full draft reply into the box, on request only.
   *
   * Never automatic: drafting every message as it arrives would spend tokens on
   * mail nobody intends to answer. The result is cached server-side, so asking
   * again for the same message costs nothing.
   */
  /**
   * Writes a reply.
   *
   * With no `steer` this is the message's standard Suggested Reply, and the
   * server stores it. With one — a suggestion chip, or whatever the user typed
   * — it drafts that particular reply straight into the composer, leaving the
   * stored field alone: a steered draft is one person's take on this message,
   * not the message's answer.
   */
  const handleDraftReply = (steer?: string) => {
    setActiveSteer(steer ?? "");
    startDrafting(async () => {
      const result = await draftReplyAction(message.id, steer);

      if (result.body) {
        // Both kinds go to the same place now — there is only one box. A
        // neutral draft is additionally the message's stored Suggested Reply.
        revealIntoComposer(result.body);
        if (steer) setPrompt("");
        else setStoredDraft(result.body);

        toast({
          tone: "success",
          title: steer ? "Reply drafted" : "Suggested reply written",
          description:
            "Read it before sending — anything in square brackets still needs a real value.",
          key: "reply-draft",
        });
        return;
      }

      toast({
        tone: "error",
        title: "No draft written",
        description: result.note ?? "The draft could not be produced.",
        key: "reply-draft",
      });
    });
  };

  /**
   * Sends the reply for real, over SMTP, from the connected mailbox.
   *
   * This used to be a timer that appended the text to the thread and called it
   * sent. It now waits for the mail server to accept the message, and only then
   * shows it — a reply that failed must never appear to have gone out.
   *
   * The confirmation is deliberate: the button leaves the building now.
   */
  const handleSend = () => {
    if (!draft.trim() || sending || writing) return;

    const body = draft;
    const target = message.email || message.from;
    if (!window.confirm(`Send this reply to ${target}?`)) return;

    setSending(true);
    startSending(async () => {
      const result = await sendReplyAction(message.id, body);
      setSending(false);

      if (!result.sent) {
        toast({
          tone: "error",
          title: "Reply not sent",
          description: result.error ?? "The message could not be sent.",
          key: "reply-send",
        });
        return;
      }

      setSent(true);
      setSentReplies((replies) => [
        ...replies,
        { body, sentAt: new Date().toISOString() },
      ]);
      setDraft("");
      setReveal(null);
      toast({
        tone: "success",
        title: "Reply sent",
        description: `Delivered to ${target}.`,
        key: "reply-send",
      });

      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      });
    });
  };

  return (
    <section
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-card)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        minHeight: 0,
      }}
    >
      <div
        style={{
          flex: "0 0 auto",
          padding: "14px 20px",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          flexDirection: "column",
          gap: "9px",
        }}
      >
        <div className="flex items-start gap-2.5">
          <span style={{ flex: "0 0 auto", marginTop: 1 }}>
            <IconButton
              icon="arrow-left"
              size={30}
              label="Back to the message list"
              onClick={onBack}
            />
          </span>
          <h3
            style={{
              flex: "1 1 auto",
              minWidth: 0,
              fontFamily: "var(--font-display)",
              fontSize: "18px",
              lineHeight: "24px",
              fontWeight: 700,
              letterSpacing: "-.015em",
              textWrap: "pretty",
              overflowWrap: "anywhere",
            }}
          >
            {message.subject}
          </h3>
          <span style={{ flex: "0 0 auto", marginTop: 2 }}>
            <Badge tone={priority.tone}>{message.priority}</Badge>
          </span>
        </div>
        <div className="flex items-center gap-[11px]">
          <Avatar name={message.from} size={32} />
          <span className="flex min-w-0 flex-col leading-[1.3]">
            <span style={{ fontSize: "13px", fontWeight: 600 }}>
              {message.from}
            </span>
            <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
              {message.email} · {message.date}
            </span>
          </span>
          <span className="ml-auto flex gap-2">
            {/* No "Open in Gmail" while no mailbox is connected — it would be
                a link to nothing, and it was taking header space to be it. */}
            {mailboxConnected && (
              <IconButton icon="external-link" size={32} label="Open in Gmail" />
            )}
            <IconButton icon="archive" size={32} label="Archive" />
          </span>
        </div>
      </div>

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "18px 20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        {/*
          One AI block instead of four stacked ones.

          This used to be a warning banner, a summary card, a badge row and an
          action-item row, each with its own border — so the email itself began
          four blocks down. Everything the checklist requires is still here
          (category, deadline, summary, action required, and the approval flag);
          it is one panel rather than four.
        */}
        <div
          style={{
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-md)",
            background: "var(--surface-inset)",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: "9px",
          }}
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span style={{ color: "var(--accent-primary)", display: "inline-flex" }}>
              <Icon name="sparkles" size={14} />
            </span>
            <span
              style={{
                fontSize: "11.5px",
                fontWeight: 700,
                color: "var(--text-accent)",
              }}
            >
              AI Summary
            </span>
            <span className="ml-auto flex flex-wrap items-center gap-1.5">
              <Badge tone="neutral" pill={false}>
                {message.category}
              </Badge>
              <Badge
                tone={message.deadline ? "warning" : "neutral"}
                pill={false}
                icon="clock"
              >
                {message.deadline ?? "No deadline"}
              </Badge>
            </span>
          </div>

          <p
            style={{
              margin: 0,
              fontSize: "13px",
              lineHeight: "19px",
              color: "var(--text-primary)",
              textWrap: "pretty",
              overflowWrap: "anywhere",
            }}
          >
            {message.aiSummary}
          </p>

          {/* Checklist item 15: a message that would commit the business is
              escalated rather than answered, and says so above the reply. */}
          {message.needsApproval && (
            <div
              role="alert"
              className="flex items-start gap-2"
              style={{
                fontSize: "12px",
                lineHeight: "17px",
                color: "var(--text-secondary)",
                overflowWrap: "anywhere",
              }}
            >
              <span
                style={{
                  color: "var(--status-warning)",
                  flex: "0 0 auto",
                  marginTop: 1,
                }}
              >
                <Icon name="alert-triangle" size={14} />
              </span>
              <span>
                <b style={{ color: "var(--text-primary)" }}>
                  Management approval required
                </b>{" "}
                — {message.approvalReason}. No suggested reply will accept on
                the company&rsquo;s behalf.
              </span>
            </div>
          )}

          {message.actionItems.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {message.actionItems.map((item) => (
                <Badge key={item} tone="info" pill={false} icon="check">
                  {item}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {message.body.map((paragraph) => (
            <p
              key={paragraph}
              style={{
                margin: 0,
                fontSize: "13.5px",
                lineHeight: "21px",
                color: "var(--text-primary)",
                textWrap: "pretty",
                overflowWrap: "anywhere",
              }}
            >
              {paragraph}
            </p>
          ))}
        </div>

        {sentReplies.map((reply) => (
          <div
            key={reply.sentAt}
            style={{
              background: "var(--accent-soft)",
              border: "1px solid var(--blue-200)",
              borderRadius: "var(--radius-lg)",
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <div className="flex items-center gap-2.5">
              <Avatar name={CURRENT_USER.name} size={28} />
              <span className="flex min-w-0 flex-col leading-[1.3]">
                <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-primary)" }}>
                  {CURRENT_USER.name}
                </span>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  {ORGANIZATION.mailbox} · just now
                </span>
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--accent-primary)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <Icon name="check" size={12} />
                Sent
              </span>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: "13.5px",
                lineHeight: "21px",
                color: "var(--text-primary)",
                textWrap: "pretty",
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
              }}
            >
              {reply.body}
            </p>
          </div>
        ))}
      </div>

      <div
        style={{
          flex: "0 0 auto",
          borderTop: "1px solid var(--border-subtle)",
          padding: "14px 20px 16px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          background: "var(--gray-25)",
        }}
      >
        <button
          type="button"
          onClick={() => setReplyOpen((open) => !open)}
          aria-expanded={replyOpen}
          className="flex items-center gap-[7px]"
          style={{
            background: "none",
            border: 0,
            padding: 0,
            width: "100%",
            cursor: "pointer",
            font: "inherit",
            textAlign: "left",
          }}
        >
          <span style={{ color: "var(--accent-primary)" }}>
            <Icon name="sparkles" size={14} />
          </span>
          <span
            style={{
              fontSize: "11.5px",
              fontWeight: 700,
              color: "var(--text-accent)",
            }}
          >
            Suggested Reply
          </span>
          {(drafting || writing) && (
            <span
              style={{
                fontSize: "11px",
                color: "var(--text-muted)",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "var(--radius-pill)",
                  background: "var(--accent-primary)",
                  animation: "aegis-pulse-dot 1.4s ease-in-out infinite",
                }}
              />
              {drafting ? "AEGIS is writing…" : "writing…"}
            </span>
          )}
          <span
            style={{
              marginLeft: "auto",
              color: "var(--text-muted)",
              display: "inline-flex",
              transform: replyOpen ? "rotate(180deg)" : undefined,
              transition: "transform 140ms ease",
            }}
          >
            <Icon name="chevron-down" size={15} />
          </span>
        </button>

        {/* Collapsed, the field is still shown — just on one line. */}
        {!replyOpen && (
          <button
            type="button"
            onClick={() => setReplyOpen(true)}
            style={{
              background: "none",
              border: 0,
              padding: 0,
              width: "100%",
              cursor: "pointer",
              font: "inherit",
              textAlign: "left",
              fontSize: "12.5px",
              lineHeight: "18px",
              color: "var(--text-secondary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {policy.kind === "none"
              ? policy.reason
              : draft.trim()
                ? draft.trim().replace(/\s+/g, " ")
                : "Not drafted yet — open to write one."}
          </button>
        )}

        {/*
          The recommendations stay on screen whether or not the composer is
          open: they are the fastest route to a reply, and burying them behind
          a toggle made them useless. Each one steers a real draft — under the
          same guardrails — and opens the composer as it writes.
        */}
        {policy.kind === "draft" && message.replies.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.replies.map((reply) => (
              <Button
                key={reply}
                variant="outline"
                size="sm"
                onClick={() => handleDraftReply(reply)}
                disabled={drafting}
              >
                {drafting && activeSteer === reply ? "Writing…" : reply}
              </Button>
            ))}
          </div>
        )}

        {replyOpen && (
          <>
        {policy.kind === "none" && (
          <p
            style={{
              margin: 0,
              fontSize: "12.5px",
              lineHeight: "18px",
              color: "var(--text-secondary)",
              overflowWrap: "anywhere",
            }}
          >
            {policy.reason}
          </p>
        )}

        {policy.kind === "draft" && (
          <div className="flex flex-col gap-2">
            {!storedDraft && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon="sparkles"
                  onClick={() => handleDraftReply()}
                  disabled={drafting}
                >
                  {drafting && activeSteer === "" ? "Writing…" : "Write suggested reply"}
                </Button>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  The last sync reached its per-run limit.
                </span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && prompt.trim() && !drafting) {
                    event.preventDefault();
                    handleDraftReply(prompt.trim());
                  }
                }}
                placeholder="or say what the reply should do…"
                style={{
                  flex: 1,
                  minWidth: 0,
                  font: "inherit",
                  fontSize: "12.5px",
                  color: "var(--text-primary)",
                  background: "var(--surface-card)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-md)",
                  padding: "8px 11px",
                  outline: "none",
                }}
              />
              <Button
                variant="secondary"
                size="sm"
                icon="sparkles"
                onClick={() => handleDraftReply(prompt.trim())}
                disabled={drafting || !prompt.trim()}
              >
                {drafting && activeSteer === prompt.trim() ? "Writing…" : "Write"}
              </Button>
            </div>
          </div>
        )}
        {/*
          One box. While a draft is filling it the textarea shows the reveal and
          is read-only — typing into text that is still arriving would fight the
          animation and lose the edit.
        */}
        <textarea
          value={writing ? shown : draft}
          onChange={(event) => handleDraftChange(event.target.value)}
          readOnly={writing}
          placeholder="Write a reply, or use a suggestion above…"
          style={{
            width: "100%",
            // Tall enough for a full draft — four short paragraphs — so the
            // reply can be read without scrolling a 74px slot.
            minHeight: 168,
            maxHeight: 320,
            resize: "vertical",
            font: "inherit",
            fontSize: "13px",
            lineHeight: "20px",
            color: "var(--text-primary)",
            background: "var(--surface-card)",
            border: `1px solid ${writing ? "var(--accent-primary)" : "var(--border-default)"}`,
            borderRadius: "var(--radius-md)",
            padding: "11px 13px",
            outline: "none",
            transition: "border-color 140ms ease",
          }}
        />
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            size="md"
            icon={sent ? "check" : "send"}
            disabled={sending || writing || !draft.trim()}
            onClick={handleSend}
          >
            {sending ? "Sending…" : sent ? "Sent" : "Send reply"}
          </Button>
          <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
            {mailboxConnected
              ? sent
                ? `Sent from ${mailbox ?? ORGANIZATION.mailbox}`
                : `Sends from ${mailbox ?? ORGANIZATION.mailbox}`
              : sent
                ? "Added to this thread only — no mailbox is connected, so nothing was sent"
                : "No mailbox is connected, so this will not leave AEGIS"}
          </span>
        </div>
          </>
        )}
      </div>
    </section>
  );
}
