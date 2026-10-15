"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveOwnerAlertsAction, sendTestAlertAction } from "@/app/actions/business";
import { useToast } from "@/components/layout/toast-provider";
import { Badge, Button, Card, Switch } from "@/components/ui";
import { INPUT, Notice } from "@/components/forms/form-kit";
import { MAX_RECIPIENTS, OWNER_ALERT_GROUPS } from "@/lib/owner-alerts";
import type { OwnerAlertGroup, OwnerAlertPanelData, OwnerAlertRecipient, OwnerAlertStatus } from "@/types";

export interface OwnerAlertsPanelProps {
  businessId: string;
  businessName: string;
  data: OwnerAlertPanelData;
}

const STATUS_TONE: Record<OwnerAlertStatus, "positive" | "negative" | "neutral" | "warning"> = {
  sent: "positive",
  failed: "negative",
  "not-sent": "neutral",
  skipped: "warning",
};

const STATUS_LABEL: Record<OwnerAlertStatus, string> = {
  sent: "Sent",
  failed: "Failed",
  "not-sent": "Not sent",
  skipped: "Skipped",
};

/**
 * Who in the business gets a text when something needs them, and for what.
 * Until an SMS provider is connected every alert is recorded as not sent,
 * and the panel says so rather than implying anything was delivered.
 */
export function OwnerAlertsPanel({ businessId, businessName, data }: OwnerAlertsPanelProps) {
  const router = useRouter();
  const toast = useToast();
  const [enabled, setEnabled] = useState(data.config.enabled);
  const [recipients, setRecipients] = useState<OwnerAlertRecipient[]>(
    data.config.recipients.length ? data.config.recipients : [{ name: "", mobile: "" }],
  );
  const [groups, setGroups] = useState<Set<OwnerAlertGroup>>(new Set(data.config.groups));
  const [limit, setLimit] = useState(String(data.config.dailyLimit));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const setRecipient = (index: number, patch: Partial<OwnerAlertRecipient>) =>
    setRecipients((current) => current.map((entry, at) => (at === index ? { ...entry, ...patch } : entry)));

  const save = (nextEnabled = enabled) => {
    setError(null);
    startTransition(async () => {
      const result = await saveOwnerAlertsAction(businessId, {
        enabled: nextEnabled,
        recipients,
        groups: [...groups],
        dailyLimit: Number(limit),
      });
      if (!result.ok) {
        setError(result.error);
        setEnabled(data.config.enabled);
        toast({ tone: "error", title: "Alerts not saved", description: result.error, key: "owner-alerts" });
        return;
      }
      setEnabled(nextEnabled);
      toast({
        tone: "success",
        title: nextEnabled ? "Owner alerts on" : "Owner alerts saved",
        description: data.provider ? undefined : "Recorded only until an SMS provider is connected.",
        key: "owner-alerts",
      });
      router.refresh();
    });
  };

  const test = () =>
    startTransition(async () => {
      const result = await sendTestAlertAction(businessId);
      if (!result.ok) {
        toast({ tone: "error", title: "No test sent", description: result.error, key: "owner-alerts" });
        return;
      }
      toast({
        tone: result.provider ? "success" : "info",
        title: result.provider ? "Test text sent" : "Test recorded, not sent",
        description: result.provider
          ? `To ${result.written} ${result.written === 1 ? "number" : "numbers"}.`
          : "No SMS provider is connected yet, so nothing reached a phone.",
        key: "owner-alerts",
      });
      router.refresh();
    });

  return (
    <Card
      title="Owner text alerts"
      padding="18px"
      action={<Switch checked={enabled} label={`Owner text alerts for ${businessName}`} disabled={pending} onChange={(next) => save(next)} />}
    >
      <div className="flex flex-col gap-3.5">
        {!data.provider && (
          <Notice tone="info">No SMS provider is connected yet. Alerts are recorded below but no text is sent.</Notice>
        )}
        {error && <Notice tone="error">{error}</Notice>}

        <div className="flex flex-col gap-2">
          <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)" }}>Text these numbers</span>
          {recipients.map((entry, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                style={{ ...INPUT, flex: 1, minWidth: 0 }}
                placeholder="Name"
                maxLength={60}
                value={entry.name}
                onChange={(event) => setRecipient(index, { name: event.target.value })}
              />
              <input
                style={{ ...INPUT, flex: 1, minWidth: 0 }}
                placeholder="0917 123 4567"
                type="tel"
                maxLength={20}
                value={entry.mobile}
                onChange={(event) => setRecipient(index, { mobile: event.target.value })}
              />
              {recipients.length > 1 && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon="x"
                  aria-label={`Remove ${entry.name || "this number"}`}
                  onClick={() => setRecipients((current) => current.filter((_, at) => at !== index))}
                />
              )}
            </div>
          ))}
          {recipients.length < MAX_RECIPIENTS && (
            <button
              type="button"
              onClick={() => setRecipients((current) => [...current, { name: "", mobile: "" }])}
              style={{ alignSelf: "flex-start", border: "none", background: "none", padding: 0, cursor: "pointer", fontSize: "12px", color: "var(--accent-primary)" }}
            >
              + Add a number
            </button>
          )}
        </div>

        <div className="grid gap-2 wide:grid-cols-2">
          {OWNER_ALERT_GROUPS.map((group) => (
            <label key={group.key} className="flex items-start gap-2" style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                style={{ marginTop: 3 }}
                checked={groups.has(group.key)}
                onChange={(event) =>
                  setGroups((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(group.key);
                    else next.delete(group.key);
                    return next;
                  })
                }
              />
              <span className="flex flex-col">
                <span style={{ fontSize: "12.5px", fontWeight: 600 }}>{group.label}</span>
                <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>{group.detail}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex items-center gap-2" style={{ fontSize: "12.5px", color: "var(--text-secondary)" }}>
            At most
            <input
              style={{ ...INPUT, width: 70, textAlign: "right" }}
              inputMode="numeric"
              value={limit}
              onChange={(event) => setLimit(event.target.value)}
            />
            texts a day · {data.sentToday} today
          </label>
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" size="sm" disabled={pending || data.config.recipients.length === 0} onClick={test}>
              Send test
            </Button>
            <Button size="sm" icon="check" disabled={pending} onClick={() => save()}>
              Save
            </Button>
          </div>
        </div>

        {data.recent.length > 0 && (
          <div className="flex flex-col" style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 8 }}>
            <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", paddingBottom: 4 }}>Recent alerts</span>
            {data.recent.map((entry, index) => (
              <div key={index} className="flex items-start gap-2.5" style={{ padding: "6px 0", fontSize: "12px" }}>
                <Badge tone={STATUS_TONE[entry.status]}>{STATUS_LABEL[entry.status]}</Badge>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span style={{ textWrap: "pretty" }}>{entry.body}</span>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    {entry.at} · {entry.recipientName}
                    {entry.reason && entry.status !== "sent" ? ` · ${entry.reason}` : ""}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
