"use client";

import { useState } from "react";
import { Avatar, Icon } from "@/components/ui";
import { addDaysToKey } from "@/lib/finance-periods";
import type { FinanceEventLine } from "@/types";

type Tone = "accent" | "positive" | "warning" | "negative" | "info" | "neutral";

const TONES: Record<Tone, { bg: string; fg: string }> = {
  accent: { bg: "var(--accent-soft)", fg: "var(--accent-primary)" },
  positive: { bg: "var(--status-positive-soft)", fg: "var(--status-positive)" },
  warning: { bg: "var(--status-warning-soft)", fg: "var(--status-warning)" },
  negative: { bg: "var(--status-negative-soft)", fg: "var(--status-negative)" },
  info: { bg: "var(--status-info-soft)", fg: "var(--status-info)" },
  neutral: { bg: "var(--surface-inset)", fg: "var(--text-secondary)" },
};

/** Events listed before "Show all". */
const FIRST = 6;

/** What an event is, in words and at a glance. Money events also show their amount. */
function describe(line: FinanceEventLine): { title: string; icon: string; tone: Tone; money: boolean } {
  const [kind, verb = ""] = line.action.split(".");
  const noun = kind === "invoice" ? "Invoice" : kind === "bill" ? "Bill" : "Record";
  switch (line.action) {
    case "bill.paid":
      return { title: "Payment made", icon: "wallet", tone: "positive", money: true };
    case "invoice.collected":
      return { title: "Payment collected", icon: "wallet", tone: "positive", money: true };
    case "payment.voided":
      return { title: "Payment voided", icon: "x", tone: "negative", money: true };
    case "invoice.collection-voided":
      return { title: "Collection voided", icon: "x", tone: "negative", money: true };
    case "attachment.added":
      return { title: "Document attached", icon: "paperclip", tone: "info", money: false };
    case "invoice.followup":
      return { title: "Follow-up updated", icon: "phone", tone: "info", money: false };
    case "intake.posted":
      return { title: "Posted from the Review Queue", icon: "sparkles", tone: "accent", money: false };
  }
  if (verb === "created") return { title: `${noun} created`, icon: "plus", tone: "accent", money: false };
  if (verb === "corrected") return { title: `${noun} corrected`, icon: "pen-line", tone: "warning", money: false };
  if (verb === "voided") return { title: `${noun} voided`, icon: "x", tone: "negative", money: false };
  const words = line.action.replace(/[.-]/g, " ");
  return { title: words.charAt(0).toUpperCase() + words.slice(1), icon: "circle", tone: "neutral", money: false };
}

const dayKey = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
const stampOf = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });

function dayLabel(key: string, today: string) {
  if (key === today) return "Today";
  if (key === addDaysToKey(today, -1)) return "Yesterday";
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "2-digit", year: "numeric" });
}

/**
 * A record's history as a timeline, newest first and grouped by day. Each
 * event shows what happened, who did it and when; a correction shows its
 * reason and each field's old and new value.
 */
export function HistoryTimeline({ history, recordRef }: { history: FinanceEventLine[]; recordRef: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? history : history.slice(0, FIRST);
  const today = dayKey(new Date());

  const days: { key: string; lines: FinanceEventLine[] }[] = [];
  for (const line of shown) {
    const key = dayKey(new Date(line.at));
    const last = days.at(-1);
    if (last?.key === key) last.lines.push(line);
    else days.push({ key, lines: [line] });
  }

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <Icon name="clock" size={15} color="var(--text-muted)" />
        <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "13.5px", fontWeight: 700 }}>History</h3>
        <span
          style={{ padding: "1px 8px", borderRadius: 999, background: "var(--surface-inset)", fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)" }}
        >
          {history.length}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {days.map((day) => (
          <div key={day.key} className="flex flex-col gap-1.5">
            <span style={{ fontSize: "10.5px", fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--text-muted)" }}>
              {dayLabel(day.key, today)}
            </span>
            <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {day.lines.map((line, index) => (
                <Event key={`${line.at}-${index}`} line={line} recordRef={recordRef} last={index === day.lines.length - 1} />
              ))}
            </ol>
          </div>
        ))}
      </div>

      {history.length > FIRST && (
        <button
          type="button"
          onClick={() => setAll(!all)}
          className="flex items-center gap-1.5 self-start"
          style={{ border: "none", background: "none", padding: 0, cursor: "pointer", font: "inherit", fontSize: "12px", fontWeight: 600, color: "var(--text-accent)" }}
        >
          <Icon name="chevron-down" size={13} style={{ transform: all ? "rotate(180deg)" : "none" }} />
          {all ? "Show fewer" : `Show all ${history.length} events`}
        </button>
      )}
    </section>
  );
}

function Event({ line, recordRef, last }: { line: FinanceEventLine; recordRef: string; last: boolean }) {
  const { title, icon, tone, money } = describe(line);
  const colors = TONES[tone];
  const amount = money ? line.detail.match(/₱\s?[\d,]+(?:\.\d{2})?/)?.[0] : undefined;
  const corrected = line.changes.length > 0;

  return (
    <li className="flex gap-3">
      {/* The rail: an icon per event, joined by a line to the next one that day. */}
      <span className="flex flex-col items-center" style={{ flex: "0 0 auto" }}>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 999,
            background: colors.bg,
            color: colors.fg,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 0 3px var(--surface-card)",
          }}
        >
          <Icon name={icon} size={14} />
        </span>
        {!last && <span style={{ flex: 1, width: 2, minHeight: 10, background: "var(--border-subtle)", margin: "2px 0" }} />}
      </span>

      <div
        className="flex min-w-0 flex-1 flex-col gap-1.5"
        style={{
          marginBottom: last ? 0 : 10,
          padding: "9px 12px",
          border: "1px solid var(--border-default)",
          borderRadius: 12,
          background: "var(--surface-card)",
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <strong style={{ fontSize: "12.5px" }}>{title}</strong>
            {line.ref !== recordRef && (
              <span
                style={{
                  padding: "0 6px",
                  borderRadius: 6,
                  background: "var(--surface-inset)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "10.5px",
                  color: "var(--text-secondary)",
                }}
              >
                {line.ref}
              </span>
            )}
          </span>
          {amount && (
            <strong
              style={{
                fontSize: "12.5px",
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
                color: tone === "negative" ? "var(--status-negative)" : "var(--status-positive)",
                textDecoration: tone === "negative" ? "line-through" : "none",
              }}
            >
              {amount}
            </strong>
          )}
        </div>

        <span className="flex items-center gap-1.5" style={{ fontSize: "11px", color: "var(--text-muted)" }} title={stampOf(line.at)}>
          <Avatar name={line.actor} size={18} />
          <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>{line.actor}</span>· {timeOf(line.at)}
        </span>

        {corrected ? (
          <div className="flex flex-col gap-1.5">
            {line.reason && (
              <span
                style={{
                  padding: "6px 10px",
                  borderLeft: "3px solid var(--status-warning)",
                  borderRadius: "0 8px 8px 0",
                  background: "var(--status-warning-soft)",
                  fontSize: "12px",
                  color: "var(--text-primary)",
                  overflowWrap: "anywhere",
                }}
              >
                <span style={{ fontWeight: 600 }}>Reason: </span>
                {line.reason}
              </span>
            )}
            {line.changes.map((change) => (
              <div key={change.field} className="flex flex-wrap items-center gap-1.5" style={{ fontSize: "11.5px" }}>
                <span style={{ minWidth: 84, color: "var(--text-muted)" }}>{change.field}</span>
                <Chip tone="negative" strike>
                  {change.from || "(empty)"}
                </Chip>
                <Icon name="arrow-right" size={12} color="var(--text-muted)" />
                <Chip tone="positive">{change.to || "(empty)"}</Chip>
              </div>
            ))}
          </div>
        ) : (
          line.detail && <span style={{ fontSize: "12px", color: "var(--text-secondary)", overflowWrap: "anywhere", lineHeight: 1.45 }}>{line.detail}</span>
        )}
      </div>
    </li>
  );
}

function Chip({ tone, strike, children }: { tone: Tone; strike?: boolean; children: string }) {
  const colors = TONES[tone];
  return (
    <span
      style={{
        padding: "1px 7px",
        borderRadius: 6,
        background: colors.bg,
        color: colors.fg,
        fontWeight: 600,
        textDecoration: strike ? "line-through" : "none",
        overflowWrap: "anywhere",
      }}
    >
      {children}
    </span>
  );
}
