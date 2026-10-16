"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { askAegisAction, runAskProposalAction } from "@/app/actions/ask";
import { useToast } from "@/components/layout/toast-provider";
import { Icon } from "@/components/ui";
import { MAX_QUESTION_CHARS, splitRefs, type AskProposal, type AskTool, type AskTurn } from "@/lib/ask";

export interface AskAegisProps {
  businessName: string;
  /** Offered on an empty chat, chosen on the server from the business's modules. */
  suggestions: string[];
}

interface Message extends AskTurn {
  error?: boolean;
  proposals?: AskProposal[];
  /** What was read to answer, shown as it happened. */
  tools?: AskTool[];
}

type StepState = "waiting" | "active" | "done" | "failed";
interface Step {
  label: string;
  state: StepState;
}
type RunState = "awaiting" | "running" | "done" | "failed" | "cancelled";
interface Run {
  state: RunState;
  steps: Step[];
  message?: string;
}

const TOOL_LABEL: Record<AskTool, string> = {
  bookings: "bookings",
  quotations: "quotations",
  job_orders: "job orders",
  ads: "ads",
  money: "revenue",
  inventory: "inventory",
  customers: "customers",
  service_due: "service due",
  mail: "mail",
  app_help: "the guide",
};

/** While a question is out: what each stage is, in turn. A hint of progress, not a record of it. */
const THINKING = ["Working out what to read", "Reading AEGIS records", "Writing the answer"];

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The floating Ask AEGIS bubble, bottom right on every signed-in screen. It
 * answers from the business's records and, when asked to do something,
 * prepares it as a card the person confirms; only opening a screen happens by
 * itself. A confirmed action goes to the record, runs, and refreshes the page,
 * each step shown as it happens, with a glow round the screen while it works.
 *
 * It sits below drawers and modals (their buttons are in the same corner) and
 * below toasts. The chat lives in the shell, so it survives moving between
 * screens; it is not stored anywhere else.
 */
export function AskAegis({ businessName, suggestions }: AskAegisProps) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [runs, setRuns] = useState<Record<string, Run>>({});
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(0);
  const [pending, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const working = Object.values(runs).some((run) => run.state === "running");

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending, runs]);

  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => setThinking((stage) => Math.min(stage + 1, THINKING.length - 1)), 1400);
    return () => clearInterval(timer);
  }, [pending]);

  const updateRun = (id: string, change: (run: Run) => Run) =>
    setRuns((current) => (current[id] ? { ...current, [id]: change(current[id]) } : current));
  const setStep = (id: string, index: number, state: StepState) =>
    updateRun(id, (run) => ({ ...run, steps: run.steps.map((step, at) => (at === index ? { ...step, state } : step)) }));

  /** Opening a screen needs no confirmation: it changes nothing. */
  const openProposal = async (proposal: AskProposal) => {
    if (!proposal.href) return;
    setRuns((current) => ({
      ...current,
      [proposal.id]: { state: "running", steps: [{ label: `Opening ${proposal.title.replace(/^Open /, "")}`, state: "active" }] },
    }));
    router.push(proposal.href);
    await pause(450);
    setStep(proposal.id, 0, "done");
    updateRun(proposal.id, (run) => ({ ...run, state: "done" }));
  };

  /** Goes to the record, runs the confirmed action through the screen's own server action, then shows the result. */
  const confirm = async (proposal: AskProposal) => {
    const going = proposal.href && proposal.href.split("?")[0] !== pathname;
    setRuns((current) => ({
      ...current,
      [proposal.id]: {
        state: "running",
        steps: [
          ...(going ? [{ label: `Going to ${proposal.params.ref || "the screen"}`, state: "waiting" as const }] : []),
          { label: proposal.title, state: "waiting" },
          { label: "Showing the result", state: "waiting" },
        ],
      },
    }));
    let index = 0;
    if (going && proposal.href) {
      setStep(proposal.id, index, "active");
      router.push(proposal.href);
      await pause(650);
      setStep(proposal.id, index, "done");
      index += 1;
    }

    setStep(proposal.id, index, "active");
    let result: Awaited<ReturnType<typeof runAskProposalAction>>;
    try {
      result = await runAskProposalAction(proposal);
    } catch {
      result = { ok: false, error: "That did not go through. Check the connection and try again." };
    }
    if (!result.ok) {
      setStep(proposal.id, index, "failed");
      updateRun(proposal.id, (run) => ({ ...run, state: "failed", message: result.ok ? undefined : result.error }));
      toast({ tone: "error", title: "Not done", description: result.error, key: "ask-aegis" });
      return;
    }
    setStep(proposal.id, index, "done");
    index += 1;

    setStep(proposal.id, index, "active");
    if (result.href && result.href !== proposal.href) router.push(result.href);
    router.refresh();
    await pause(450);
    setStep(proposal.id, index, "done");
    updateRun(proposal.id, (run) => ({ ...run, state: "done", message: result.ok ? result.message : undefined }));
    toast({ tone: "success", title: "Done", description: result.message, key: "ask-aegis" });
  };

  const cancel = (proposal: AskProposal) =>
    setRuns((current) => ({ ...current, [proposal.id]: { state: "cancelled", steps: [], message: "Cancelled. Nothing was changed." } }));

  const ask = (question: string) => {
    const text = question.trim();
    if (!text || pending || working) return;
    // Only real exchanges go back as history; failed attempts do not.
    const history = messages.filter((message) => !message.error).map(({ role, text: said }) => ({ role, text: said }));
    setMessages((current) => [...current, { role: "user", text }]);
    setDraft("");
    setThinking(0);
    startTransition(async () => {
      try {
        const result = await askAegisAction(text, history);
        if (!result.ok) {
          setMessages((current) => [...current, { role: "assistant", text: result.error, error: true }]);
          return;
        }
        setMessages((current) => [
          ...current,
          { role: "assistant", text: result.answer, proposals: result.proposals, tools: result.tools },
        ]);
        setRuns((current) => {
          const next = { ...current };
          for (const proposal of result.proposals) next[proposal.id] = { state: "awaiting", steps: [] };
          return next;
        });
        for (const proposal of result.proposals) {
          if (proposal.kind === "open" && !proposal.blocked) await openProposal(proposal);
        }
      } catch {
        setMessages((current) => [
          ...current,
          { role: "assistant", text: "That did not go through. Check the connection and try again.", error: true },
        ]);
      }
    });
  };

  return (
    <div className="aegis-no-print">
      {working && (
        <div
          aria-hidden
          className="aegis-work-glow"
          style={{ position: "fixed", inset: 0, zIndex: 55, pointerEvents: "none", borderRadius: 0 }}
        />
      )}

      {open && (
        <section
          role="dialog"
          aria-label="Ask AEGIS"
          style={{
            position: "fixed",
            right: 16,
            bottom: 84,
            zIndex: 60,
            width: "min(400px, calc(100vw - 32px))",
            height: "min(600px, calc(100vh - 120px))",
            display: "flex",
            flexDirection: "column",
            background: "var(--surface-card)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-popover)",
            overflow: "hidden",
          }}
        >
          <header className="flex items-center gap-2.5" style={{ padding: "12px 14px", borderBottom: "1px solid var(--border-subtle)" }}>
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "var(--accent-soft)",
                color: "var(--accent-primary)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="sparkles" size={14} className={pending || working ? "aegis-spin" : undefined} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col" style={{ lineHeight: 1.2 }}>
              <span style={{ fontSize: "13.5px", fontWeight: 700 }}>Ask AEGIS</span>
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                {working ? "Working on it…" : `Answers from ${businessName}'s records`}
              </span>
            </span>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setMessages([]);
                  setRuns({});
                }}
                disabled={pending || working}
                style={HEADER_BUTTON}
                title="Start a new chat"
              >
                New chat
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} aria-label="Close Ask AEGIS" style={{ ...HEADER_BUTTON, padding: 4 }}>
              <Icon name="x" size={16} />
            </button>
          </header>

          <div ref={listRef} className="flex flex-1 flex-col gap-2.5" style={{ overflowY: "auto", padding: "14px" }}>
            {messages.length === 0 && (
              <div className="flex flex-col gap-2">
                <span style={{ fontSize: "12.5px", color: "var(--text-secondary)", textWrap: "pretty" }}>
                  Ask about bookings, quotations, ads, money, stock or a customer, or ask it to do something. Anything that
                  changes a record waits for you to confirm.
                </span>
                {suggestions.map((suggestion) => (
                  <button key={suggestion} type="button" onClick={() => ask(suggestion)} style={SUGGESTION}>
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            {messages.map((message, index) => (
              <div key={index} className="aegis-fade-up flex flex-col gap-2" style={{ alignItems: message.role === "user" ? "flex-end" : "flex-start" }}>
                {message.tools && message.tools.length > 0 && (
                  <span className="flex flex-wrap items-center gap-1" style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>
                    <Icon name="check" size={11} />
                    Read
                    {message.tools.map((tool, at) => (
                      <span
                        key={tool + at}
                        className="aegis-fade-up"
                        style={{ animationDelay: `${at * 120}ms`, padding: "1px 7px", borderRadius: 999, background: "var(--surface-inset)" }}
                      >
                        {TOOL_LABEL[tool]}
                      </span>
                    ))}
                  </span>
                )}
                <div
                  style={{
                    maxWidth: "88%",
                    padding: "8px 11px",
                    borderRadius: 12,
                    fontSize: "12.5px",
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                    background:
                      message.role === "user" ? "var(--accent-primary)" : message.error ? "var(--status-warning-soft)" : "var(--surface-inset)",
                    color: message.role === "user" ? "#fff" : "var(--text-primary)",
                  }}
                >
                  {message.role === "assistant" && !message.error
                    ? splitRefs(message.text).map((part, at) =>
                        part.href ? (
                          <Link key={at} href={part.href} style={{ color: "var(--accent-primary)", fontWeight: 600 }}>
                            {part.text}
                          </Link>
                        ) : (
                          <span key={at}>{part.text}</span>
                        ),
                      )
                    : message.text}
                </div>
                {message.proposals?.map((proposal) => (
                  <ProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    run={runs[proposal.id]}
                    disabled={working || pending}
                    onConfirm={() => void confirm(proposal)}
                    onCancel={() => cancel(proposal)}
                  />
                ))}
              </div>
            ))}

            {pending && (
              <div aria-live="polite" className="aegis-fade-up flex items-center gap-2" style={{ alignSelf: "flex-start", padding: "8px 11px", borderRadius: 12, background: "var(--surface-inset)", fontSize: "12px", color: "var(--text-secondary)" }}>
                <Spinner />
                {THINKING[thinking]}
                <span>
                  <span className="aegis-dot">.</span>
                  <span className="aegis-dot" style={{ animationDelay: "0.2s" }}>.</span>
                  <span className="aegis-dot" style={{ animationDelay: "0.4s" }}>.</span>
                </span>
              </div>
            )}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              ask(draft);
            }}
            className="flex items-end gap-2"
            style={{ padding: "10px 12px", borderTop: "1px solid var(--border-subtle)" }}
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              maxLength={MAX_QUESTION_CHARS}
              placeholder="Ask, or tell AEGIS what to do…"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Enter asks; Shift+Enter starts a new line.
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  ask(draft);
                }
              }}
              style={{
                flex: 1,
                resize: "none",
                maxHeight: 96,
                padding: "8px 10px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-default)",
                background: "var(--surface-card)",
                color: "var(--text-primary)",
                fontFamily: "var(--font-body)",
                fontSize: "12.5px",
                lineHeight: 1.4,
                outline: "none",
              }}
            />
            <button
              type="submit"
              aria-label="Ask"
              disabled={pending || working || !draft.trim()}
              style={{
                width: 34,
                height: 34,
                flex: "0 0 auto",
                borderRadius: "50%",
                border: "none",
                background: pending || working || !draft.trim() ? "var(--border-default)" : "var(--accent-primary)",
                color: "#fff",
                cursor: pending || working || !draft.trim() ? "default" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="send" size={15} />
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={open ? "Close Ask AEGIS" : "Ask AEGIS"}
        aria-expanded={open}
        title="Ask AEGIS"
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          zIndex: 60,
          width: 56,
          height: 56,
          borderRadius: "50%",
          border: "none",
          background: "var(--accent-primary)",
          color: "#fff",
          boxShadow: "var(--glow-orb)",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={open ? "x" : "sparkles"} size={22} className={!open && (pending || working) ? "aegis-spin" : undefined} />
      </button>
    </div>
  );
}

/**
 * One proposed action. Written by the server from the record as it is now,
 * so the card says what Confirm will actually do. Blocked proposals say why
 * and offer no Confirm.
 */
function ProposalCard({
  proposal,
  run,
  disabled,
  onConfirm,
  onCancel,
}: {
  proposal: AskProposal;
  run: Run | undefined;
  disabled: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const state = run?.state ?? "awaiting";
  const isOpen = proposal.kind === "open";
  return (
    <div
      className="aegis-fade-up flex flex-col gap-2"
      style={{
        width: "100%",
        padding: "10px 12px",
        borderRadius: 12,
        border: `1px solid ${proposal.blocked ? "var(--border-default)" : state === "done" ? "var(--status-positive)" : "var(--blue-200)"}`,
        background: "var(--surface-card)",
      }}
    >
      <span className="flex items-center gap-2" style={{ fontSize: "12.5px", fontWeight: 700 }}>
        <Icon name={isOpen ? "arrow-right" : proposal.blocked ? "circle-alert" : "shield-check"} size={14} />
        {proposal.title}
      </span>
      {!isOpen && proposal.details.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: "11.5px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
          {proposal.details.map((detail, at) => (
            <li key={at}>{detail}</li>
          ))}
        </ul>
      )}

      {proposal.blocked ? (
        <span style={{ fontSize: "11.5px", color: "var(--status-warning)" }}>{proposal.blocked}</span>
      ) : (
        <>
          {run && run.steps.length > 0 && (
            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 5 }}>
              {run.steps.map((step, at) => (
                <li key={at} className="aegis-fade-up flex items-center gap-2" style={{ fontSize: "11.5px", color: step.state === "waiting" ? "var(--text-muted)" : "var(--text-primary)" }}>
                  <StepIcon state={step.state} />
                  {step.label}
                </li>
              ))}
            </ol>
          )}
          {run?.message && (
            <span style={{ fontSize: "11.5px", color: state === "failed" ? "var(--status-negative)" : state === "done" ? "var(--status-positive)" : "var(--text-muted)" }}>
              {run.message}
            </span>
          )}
          {state === "awaiting" && !isOpen && (
            <div className="flex items-center gap-2">
              <button type="button" onClick={onConfirm} disabled={disabled} style={{ ...ACTION_BUTTON, background: "var(--accent-primary)", color: "#fff", border: "none" }}>
                Confirm
              </button>
              <button type="button" onClick={onCancel} disabled={disabled} style={ACTION_BUTTON}>
                Cancel
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "active") return <Spinner />;
  const color = state === "done" ? "var(--status-positive)" : state === "failed" ? "var(--status-negative)" : "var(--border-default)";
  return (
    <span
      style={{
        width: 14,
        height: 14,
        flex: "0 0 auto",
        borderRadius: "50%",
        background: state === "waiting" ? "transparent" : color,
        border: `1.5px solid ${color}`,
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {state === "done" && <Icon name="check" size={9} />}
      {state === "failed" && <Icon name="x" size={9} />}
    </span>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="aegis-spin"
      style={{
        width: 14,
        height: 14,
        flex: "0 0 auto",
        borderRadius: "50%",
        border: "2px solid var(--accent-soft)",
        borderTopColor: "var(--accent-primary)",
        display: "inline-block",
      }}
    />
  );
}

const HEADER_BUTTON = {
  border: "none",
  background: "none",
  cursor: "pointer",
  padding: "4px 6px",
  borderRadius: 6,
  fontFamily: "var(--font-body)",
  fontSize: "11.5px",
  color: "var(--text-secondary)",
  display: "inline-flex",
  alignItems: "center",
} as const;

const SUGGESTION = {
  textAlign: "left",
  padding: "8px 11px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-default)",
  background: "var(--surface-card)",
  cursor: "pointer",
  fontFamily: "var(--font-body)",
  fontSize: "12.5px",
  color: "var(--text-primary)",
} as const;

const ACTION_BUTTON = {
  height: 28,
  padding: "0 12px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-default)",
  background: "var(--surface-card)",
  cursor: "pointer",
  fontFamily: "var(--font-body)",
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--text-primary)",
} as const;
