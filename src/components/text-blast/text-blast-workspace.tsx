"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  runSweepAction,
  saveTextBlastSettingsAction,
  sendReminderAction,
  setSmsOptOutAction,
} from "@/app/actions/text-blast";
import { Badge, Button, Icon, SearchInput, Switch } from "@/components/ui";
import type { BadgeTone } from "@/components/ui";
import { useToast } from "@/components/layout/toast-provider";
import { relativeAge } from "@/lib/freshness";
import {
  MAX_LEAD_DAYS,
  MAX_TEMPLATE_LENGTH,
  PLACEHOLDERS,
  countSegments,
  daysBetween,
  describeReminder,
  formatKey,
  renderTemplate,
  unknownPlaceholders,
} from "@/lib/text-blast";
import type { ReminderRow, SmsMessage, SmsStatus, TextBlastSettings } from "@/types";

const GRID =
  "grid gap-3 items-center grid-cols-[minmax(140px,1.2fr)_minmax(0,1.2fr)_minmax(150px,1fr)] wide:grid-cols-[minmax(160px,1.2fr)_minmax(0,1.2fr)_120px_minmax(170px,1.1fr)_190px]";
const OUTBOX_GRID =
  "grid gap-3 items-start grid-cols-[110px_minmax(0,1fr)_150px] wide:grid-cols-[80px_130px_minmax(0,1fr)_190px_120px]";

const STATUS_BADGE: Record<SmsStatus, { tone: BadgeTone; icon: string; label: string }> = {
  queued: { tone: "warning", icon: "clock", label: "Not sent yet" },
  sent: { tone: "positive", icon: "check", label: "Sent" },
  failed: { tone: "negative", icon: "circle-alert", label: "Failed to send" },
  expired: { tone: "neutral", icon: "minus", label: "Never sent" },
};

type Tab = "Upcoming" | "Outbox";

export interface TextBlastWorkspaceProps {
  businessName: string;
  settings: TextBlastSettings & { hasLink: boolean; hasFleet: boolean };
  rows: ReminderRow[];
  messages: SmsMessage[];
  sentLast30: number;
  /** Null while no SMS provider is connected. */
  providerName: string | null;
  /** "Now" as the server saw it, so ages read the same before and after hydration. */
  todayIso: string;
}

/**
 * Text Blast: who is due a service reminder, what has been written, and the
 * settings the automatic sweep runs on. With no SMS provider connected the
 * screen says so throughout; a queued text is never shown as sent.
 */
export function TextBlastWorkspace({
  businessName,
  settings,
  rows,
  messages,
  sentLast30,
  providerName,
  todayIso,
}: TextBlastWorkspaceProps) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>("Upcoming");
  const [search, setSearch] = useState("");
  const [template, setTemplate] = useState(settings.template);
  const [leadDays, setLeadDays] = useState(String(settings.leadDays));

  const now = useMemo(() => new Date(todayIso).getTime(), [todayIso]);
  const todayKey = useMemo(() => new Date(now + 8 * 3_600_000).toISOString().slice(0, 10), [now]);

  /** Runs an action, refreshes on success, and reports either way. */
  const run = (
    work: () => Promise<{ ok: true; note?: string } | { ok: false; error: string }>,
    done: string,
    key: string,
  ) => {
    startTransition(async () => {
      try {
        const result = await work();
        if (!result.ok) {
          toast({ tone: "error", title: "Not done", description: result.error, key });
          return;
        }
        router.refresh();
        toast({ tone: "success", title: done, description: result.note, key });
      } catch {
        toast({ tone: "error", title: "Not done", description: "That did not save. Please try again.", key });
      }
    });
  };

  const save = (enabled: boolean, done: string) =>
    run(
      () => saveTextBlastSettingsAction({ enabled, template, leadDays: Number(leadDays) }),
      done,
      "text-blast-settings",
    );

  const toggleAutomatic = () => {
    if (settings.enabled) {
      save(false, "Automatic reminders switched off");
      return;
    }
    const sendable = rows.filter((row) => row.outcome.kind === "send").length;
    if (
      !window.confirm(
        `Switch on automatic reminders for ${businessName}? AEGIS will write a text for each car as it falls due, between 9:00 AM and 6:00 PM, without asking first. ${sendable} ${sendable === 1 ? "car is" : "cars are"} due now.${
          providerName ? "" : " No SMS provider is connected, so texts will be queued and not sent."
        }`,
      )
    ) {
      return;
    }
    save(true, "Automatic reminders switched on");
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const order = { send: 0, done: 1, wait: 2, skip: 3 } as const;
    return rows
      .filter(
        (row) =>
          !term ||
          row.plate.toLowerCase().includes(term) ||
          row.vehicle.toLowerCase().includes(term) ||
          row.ownerName.toLowerCase().includes(term) ||
          row.ownerPhone.includes(term),
      )
      .sort(
        (a, b) =>
          order[a.outcome.kind] - order[b.outcome.kind] ||
          (a.outcome.dueKey ?? "9").localeCompare(b.outcome.dueKey ?? "9") ||
          a.plate.localeCompare(b.plate),
      );
  }, [rows, search]);

  const dueSoon = rows.filter(
    (row) =>
      (row.outcome.kind === "wait" || row.outcome.kind === "send") &&
      daysBetween(todayKey, row.outcome.dueKey) <= 30,
  ).length;
  const queued = messages.filter((message) => message.status === "queued").length;
  const skipped = rows.filter((row) => row.outcome.kind === "skip").length;

  const stats = [
    { label: "Due in the next 30 days", value: dueSoon, icon: "calendar", bg: "var(--accent-soft)", fg: "var(--accent-primary)" },
    { label: "Written, not sent yet", value: queued, icon: "clock", bg: "var(--status-warning-soft)", fg: "var(--status-warning)" },
    { label: "Sent in the last 30 days", value: sentLast30, icon: "send", bg: "var(--status-positive-soft)", fg: "var(--status-positive)" },
    { label: "Won't be texted", value: skipped, icon: "minus", bg: "var(--surface-inset)", fg: "var(--text-secondary)" },
  ];

  // The preview is drawn from a real car where there is one, so the count
  // below is the length an actual text would be.
  const sample = rows.find((row) => row.outcome.dueKey) ?? rows[0];
  const previewText = renderTemplate(template, {
    name: sample?.ownerName || "Juan",
    vehicle: sample?.vehicle || "Toyota Vios 2019",
    plate: sample?.plate || "ABC 1234",
    due: sample?.outcome.dueKey ? formatKey(sample.outcome.dueKey) : "Oct 2, 2026",
    business: businessName,
    link: settings.hasLink ? "(your booking link)" : "",
  });
  const size = countSegments(previewText);
  const unknown = unknownPlaceholders(template);
  const dirty = template !== settings.template || leadDays !== String(settings.leadDays);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "22px", lineHeight: "28px", fontWeight: 700, letterSpacing: "-.02em" }}>
            Text Blast
          </h2>
          <p style={{ margin: "3px 0 0", fontSize: "12.5px", color: "var(--text-secondary)", textWrap: "pretty" }}>
            {businessName} · a text to each customer when their car is due for service · last run{" "}
            {relativeAge(settings.lastRunAt, now)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge tone={settings.enabled ? "positive" : "neutral"} icon={settings.enabled ? "check" : "minus"}>
            {settings.enabled ? "AUTOMATIC: ON" : "AUTOMATIC: OFF"}
          </Badge>
          <Badge tone={providerName ? "positive" : "warning"} icon={providerName ? "check" : "alert-triangle"}>
            {providerName ? `PROVIDER: ${providerName.toUpperCase()}` : "NO SMS PROVIDER"}
          </Badge>
          <Button
            variant="outline"
            icon="refresh-cw"
            disabled={pending || !settings.enabled}
            title={settings.enabled ? undefined : "Switch automatic reminders on first."}
            onClick={() => run(runSweepAction, "Sweep finished", "text-blast-run")}
          >
            {pending ? "Working…" : "Run now"}
          </Button>
        </div>
      </div>

      {!providerName && (
        <Notice>
          No SMS provider is connected yet. Reminders are written and shown as <strong>Not sent yet</strong>;
          nothing reaches a phone, and nothing is ever shown as sent. A text still waiting after 14 days is
          dropped.
        </Notice>
      )}
      {!settings.hasFleet && (
        <Notice>
          Reminders are worked out from Fleet&apos;s service history, and {businessName} does not have Fleet. Grant
          it in Business Management before switching reminders on.
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 wide:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            style={{
              background: "var(--surface-card)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-card)",
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              gap: "11px",
              minWidth: 0,
            }}
          >
            <span style={{ width: 32, height: 32, flex: "0 0 auto", borderRadius: "9px", background: stat.bg, color: stat.fg, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name={stat.icon} size={15} />
            </span>
            <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.2, minWidth: 0 }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: "19px", fontWeight: 700, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>
                {stat.value}
              </span>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {stat.label}
              </span>
            </span>
          </div>
        ))}
      </div>

      <div className="grid items-start gap-3.5 wide:grid-cols-[minmax(0,1fr)_340px]">
        <section style={CARD}>
          <div className="flex flex-wrap items-center gap-2">
            {(["Upcoming", "Outbox"] as const).map((option) => {
              const active = tab === option;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTab(option)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    height: 30,
                    padding: "0 12px",
                    borderRadius: "var(--radius-pill)",
                    border: `1px solid ${active ? "var(--blue-200)" : "var(--border-default)"}`,
                    cursor: "pointer",
                    fontFamily: "var(--font-body)",
                    fontSize: "12px",
                    fontWeight: active ? 700 : 500,
                    color: active ? "var(--blue-600)" : "var(--text-primary)",
                    background: active ? "var(--accent-soft)" : "var(--surface-card)",
                  }}
                >
                  {option}
                  <span style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                    {option === "Upcoming" ? rows.length : messages.length}
                  </span>
                </button>
              );
            })}
            {tab === "Upcoming" && (
              <span className="ml-auto">
                <SearchInput placeholder="Search plate, owner..." value={search} onChange={setSearch} width={220} />
              </span>
            )}
          </div>

          {tab === "Upcoming" && (
            <>
              <div className={GRID} style={HEAD}>
                <Label>Vehicle</Label>
                <Label>Owner</Label>
                <Label className="hidden wide:block">Due</Label>
                <Label>Reminder status</Label>
                <Label className="hidden wide:block">Reminders</Label>
              </div>
              {filtered.map((row) => (
                <UpcomingRow
                  key={row.vehicleRef}
                  row={row}
                  automatic={settings.enabled}
                  providerConnected={providerName !== null}
                  pending={pending}
                  onReminders={(on) =>
                    run(
                      () => setSmsOptOutAction(row.customerRef, !on),
                      on
                        ? `Reminders on for ${row.ownerName || "this customer"}`
                        : `Reminders off for ${row.ownerName || "this customer"}`,
                      `opt-${row.customerRef}`,
                    )
                  }
                  onSend={() =>
                    run(() => sendReminderAction(row.vehicleRef), `Reminder written for ${row.plate}`, `send-${row.vehicleRef}`)
                  }
                />
              ))}
              {filtered.length === 0 && (
                <Empty>
                  {rows.length === 0
                    ? "No vehicles on file yet. Add customers' cars in Fleet and they appear here as they fall due."
                    : "No vehicles match this search."}
                </Empty>
              )}
            </>
          )}

          {tab === "Outbox" && (
            <>
              <div className={OUTBOX_GRID} style={HEAD}>
                <Label className="hidden wide:block">Ref</Label>
                <Label>To</Label>
                <Label>Message</Label>
                <Label>Status</Label>
                <Label className="hidden wide:block">Written</Label>
              </div>
              {messages.map((message) => {
                const badge = STATUS_BADGE[message.status];
                return (
                  <div key={message.ref} className={OUTBOX_GRID} style={ROW}>
                    <span className="hidden wide:block" style={MONO}>{message.ref}</span>
                    <span style={{ ...CELL, fontVariantNumeric: "tabular-nums" }}>{message.to}</span>
                    <span style={{ ...CELL, whiteSpace: "normal", overflowWrap: "anywhere", color: "var(--text-secondary)" }}>
                      {message.body}
                      <span style={{ display: "block", fontSize: "10.5px", color: "var(--text-muted)", marginTop: 2 }}>
                        {message.kind === "manual" ? "Sent by hand" : "Automatic"} · {message.segments}{" "}
                        {message.segments === 1 ? "text" : "texts"} · due {formatKey(message.dueKey)}
                      </span>
                    </span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                      <span>
                        <Badge tone={badge.tone} icon={badge.icon}>{badge.label}</Badge>
                      </span>
                      <span style={{ fontSize: "10.5px", color: "var(--text-muted)", overflowWrap: "anywhere" }}>
                        {message.statusNote}
                        {message.sent ? ` · ${message.sent}` : ""}
                      </span>
                    </span>
                    <span className="hidden wide:block" style={{ ...CELL, color: "var(--text-muted)" }}>{message.created}</span>
                  </div>
                );
              })}
              {messages.length === 0 && <Empty>No texts have been written yet.</Empty>}
            </>
          )}
        </section>

        <section style={{ ...CARD, gap: 14 }}>
          <div>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-h3-size)", fontWeight: 700 }}>Automatic reminders</h3>
            <p style={{ margin: "3px 0 0", fontSize: "11.5px", lineHeight: "17px", color: "var(--text-muted)", textWrap: "pretty" }}>
              One text per car per due date, written between 9:00 AM and 6:00 PM, never to a customer whose
              Reminders switch is off. Cars more than 30 days overdue are left for you to remind by hand.
            </p>
          </div>

          <Button
            variant={settings.enabled ? "outline" : "primary"}
            icon={settings.enabled ? "x" : "check"}
            disabled={pending || (!settings.enabled && !settings.hasFleet) || unknown.length > 0}
            onClick={toggleAutomatic}
          >
            {settings.enabled ? "Switch off automatic reminders" : "Switch on automatic reminders"}
          </Button>

          <label style={FIELD}>
            <span style={FIELD_LABEL}>Message</span>
            <textarea
              rows={5}
              value={template}
              maxLength={MAX_TEMPLATE_LENGTH}
              onChange={(event) => setTemplate(event.target.value)}
              style={{ ...INPUT, resize: "vertical", lineHeight: "19px" }}
            />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {PLACEHOLDERS.map((name) => (
              <button
                key={name}
                type="button"
                title={`Insert {${name}}`}
                onClick={() => setTemplate((current) => `${current}${current.endsWith(" ") || current === "" ? "" : " "}{${name}}`)}
                style={{
                  padding: "2px 8px",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-pill)",
                  background: "var(--surface-card)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                {`{${name}}`}
              </button>
            ))}
          </div>

          {unknown.length > 0 && (
            <span role="alert" style={{ fontSize: "11.5px", color: "var(--status-negative)" }}>
              Text Blast does not know {unknown.map((name) => `{${name}}`).join(", ")}. Check the spelling.
            </span>
          )}
          {template.includes("{link}") && !settings.hasLink && (
            <span style={{ fontSize: "11.5px", color: "var(--status-warning)", textWrap: "pretty" }}>
              {"{link}"} will be left out: the online booking page is closed, or the app&apos;s public address
              (APP_PUBLIC_URL) is not set.
            </span>
          )}

          <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--surface-inset)", display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={FIELD_LABEL}>Preview{sample ? ` · ${sample.plate}` : ""}</span>
            <span style={{ fontSize: "12.5px", lineHeight: "19px", overflowWrap: "anywhere" }}>{previewText || "—"}</span>
            <span style={{ fontSize: "11px", color: size.segments > 1 ? "var(--status-warning)" : "var(--text-muted)" }}>
              {size.characters} characters · {size.segments} {size.segments === 1 ? "text" : "texts"} per customer
              {size.unicode ? " · contains a special character, which shortens each text to 70" : ""}
            </span>
          </div>

          <label style={FIELD}>
            <span style={FIELD_LABEL}>Send how many days before the due date</span>
            <input
              inputMode="numeric"
              value={leadDays}
              onChange={(event) => setLeadDays(event.target.value.replace(/\D/g, "").slice(0, 2))}
              style={{ ...INPUT, width: 90 }}
            />
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>0 sends on the day it falls due. Up to {MAX_LEAD_DAYS}.</span>
          </label>

          <Button
            variant="secondary"
            icon="check"
            disabled={pending || !dirty || unknown.length > 0 || !template.trim()}
            onClick={() => save(settings.enabled, "Message saved")}
          >
            Save message
          </Button>

          {settings.lastRunNote && (
            <p style={{ margin: 0, fontSize: "11.5px", lineHeight: "17px", color: "var(--text-muted)", overflowWrap: "anywhere" }}>
              Last run: {settings.lastRunNote}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function UpcomingRow({
  row,
  automatic,
  providerConnected,
  pending,
  onReminders,
  onSend,
}: {
  row: ReminderRow;
  automatic: boolean;
  providerConnected: boolean;
  pending: boolean;
  /** Turns this customer's reminders on or off. */
  onReminders: (on: boolean) => void;
  onSend: () => void;
}) {
  const status = describeReminder(row.outcome, { automatic, providerConnected });

  return (
    <div className={GRID} style={ROW} title={row.preview}>
      <span className="flex min-w-0 flex-col leading-tight">
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "12.5px", fontWeight: 700 }}>{row.plate}</span>
        <span style={MUTED}>{row.vehicle}</span>
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span style={CELL}>{row.ownerName || "Owner not on file"}</span>
        <span style={MUTED}>{row.ownerPhone || "No phone"}</span>
      </span>
      <span className="hidden wide:block" style={CELL}>{row.dueDay ?? "—"}</span>
      <span className="flex min-w-0 flex-col gap-1">
        <span>
          <Badge tone={status.tone} icon={status.icon}>{status.label}</Badge>
        </span>
        <span style={{ fontSize: "11px", lineHeight: "15px", color: "var(--text-muted)", textWrap: "pretty" }}>
          {status.detail}
        </span>
        {status.canSendByHand && (
          <span>
            <Button size="sm" variant="outline" icon="send" disabled={pending} onClick={onSend}>
              Send reminder
            </Button>
          </span>
        )}
      </span>
      {/* A switch, so the row shows whether this customer is texted, rather
          than a button naming what a click would change. On is the default;
          off is the customer's opt-out. */}
      <span className="hidden items-center gap-2 wide:flex">
        <Switch
          checked={!row.optedOut}
          disabled={pending || !row.ownerName}
          label={`Text reminders for ${row.ownerName || "this customer"}`}
          title={
            row.optedOut
              ? "Off: this customer is not texted. Switch on to text them again."
              : "On: this customer gets a text when their car is due. Switch off if they ask not to be texted."
          }
          onChange={onReminders}
        />
        <span className="flex min-w-0 flex-col leading-tight">
          <span style={{ fontSize: "12px", fontWeight: 600, color: row.optedOut ? "var(--text-muted)" : "var(--text-primary)" }}>
            {row.optedOut ? "Off" : "On"}
          </span>
          <span style={MUTED}>{row.optedOut ? "Customer opted out" : "Will be texted"}</span>
        </span>
      </span>
    </div>
  );
}

const CARD: CSSProperties = {
  background: "var(--surface-card)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-card)",
  padding: "12px 12px 10px",
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  minWidth: 0,
};
const HEAD: CSSProperties = { padding: "0 10px 8px", borderBottom: "1px solid var(--border-subtle)" };
const ROW: CSSProperties = { padding: "10px", borderBottom: "1px solid var(--gray-50)" };
const CELL: CSSProperties = { fontSize: "12.5px", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const MUTED: CSSProperties = { fontSize: "11px", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const MONO: CSSProperties = { fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-muted)" };
const FIELD: CSSProperties = { display: "flex", flexDirection: "column", gap: 5 };
const FIELD_LABEL: CSSProperties = { fontSize: "11px", fontWeight: 600, color: "var(--text-muted)" };
const INPUT: CSSProperties = {
  font: "inherit",
  fontSize: "12.5px",
  color: "var(--text-primary)",
  background: "var(--surface-card)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-md)",
  padding: "8px 11px",
  outline: "none",
};

function Label({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={className}
      style={{ fontSize: "var(--text-overline-size)", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text-muted)" }}
    >
      {children}
    </span>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div style={{ padding: "30px 10px", textAlign: "center", fontSize: "12.5px", color: "var(--text-muted)" }}>{children}</div>;
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2"
      style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--status-warning-soft)", fontSize: "12.5px", lineHeight: "18px", color: "var(--text-secondary)" }}
    >
      <span style={{ color: "var(--status-warning)", flexShrink: 0, display: "inline-flex", paddingTop: 2 }}>
        <Icon name="alert-triangle" size={14} />
      </span>
      <span>{children}</span>
    </div>
  );
}
