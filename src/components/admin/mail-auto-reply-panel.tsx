"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveMailAutoReplyAction } from "@/app/actions/business";
import { useToast } from "@/components/layout/toast-provider";
import { Badge, Button, Card, Switch } from "@/components/ui";
import { INPUT, Notice } from "@/components/forms/form-kit";
import { relativeAge } from "@/lib/freshness";
import { AUTO_REPLY_RULES } from "@/lib/mail/auto-reply";
import type { MailAutoReplyDocument, MailAutoReplyPanelData } from "@/types";

export interface MailAutoReplyPanelProps {
  businessId: string;
  businessName: string;
  data: MailAutoReplyPanelData;
}

const STATUS_TONE: Record<MailAutoReplyDocument["status"], "positive" | "negative" | "neutral"> = {
  sent: "positive",
  failed: "negative",
  sending: "neutral",
};

const STATUS_LABEL: Record<MailAutoReplyDocument["status"], string> = {
  sent: "Sent",
  failed: "Failed",
  sending: "Unconfirmed",
};

/**
 * Whether AEGIS may answer routine mail on its own, and how many times a day.
 *
 * Off until an admin turns it on. The panel states the whole rule rather than a
 * summary of it, because switching it on means mail leaves the business with
 * nobody pressing Send.
 */
export function MailAutoReplyPanel({ businessId, businessName, data }: MailAutoReplyPanelProps) {
  const router = useRouter();
  const toast = useToast();
  const [enabled, setEnabled] = useState(data.enabled);
  const [limit, setLimit] = useState(String(data.dailyLimit));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (nextEnabled = enabled) => {
    if (
      nextEnabled &&
      !data.enabled &&
      !window.confirm(
        `Send automatic replies for ${businessName}? Routine customer mail that arrives from now on may be answered with its Suggested Reply, without anyone pressing Send.`,
      )
    ) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await saveMailAutoReplyAction(businessId, {
        enabled: nextEnabled,
        dailyLimit: Number(limit),
      });
      if (!result.ok) {
        setError(result.error);
        setEnabled(data.enabled);
        toast({ tone: "error", title: "Automatic replies not saved", description: result.error, key: "mail-auto-reply" });
        return;
      }
      setEnabled(nextEnabled);
      toast({
        tone: "success",
        title: nextEnabled
          ? data.enabled
            ? "Automatic replies saved"
            : "Automatic replies on"
          : "Automatic replies off",
        description: nextEnabled
          ? `Up to ${Number(limit)} a day, for mail that arrives from now on.`
          : "Every message now waits for a person.",
        key: "mail-auto-reply",
      });
      router.refresh();
    });
  };

  return (
    <Card
      title="Automatic mail replies"
      padding="18px"
      action={
        <Switch
          checked={enabled}
          label={`Automatic mail replies for ${businessName}`}
          disabled={pending}
          onChange={(next) => save(next)}
        />
      }
    >
      <div className="flex flex-col gap-3.5">
        {!data.mailboxConnected && (
          <Notice tone="info">Connect a mailbox below first. Automatic replies are sent from it.</Notice>
        )}
        {error && <Notice tone="error">{error}</Notice>}

        <div className="flex flex-col gap-1.5">
          <span style={{ fontSize: "12.5px", color: "var(--text-secondary)", lineHeight: "18px" }}>
            When on, AEGIS answers quick, routine emails — an acknowledgement, a &ldquo;thanks, received&rdquo; —
            by sending the Suggested Reply it already wrote, with a line saying it was sent automatically.
            Anything that matters waits for a person. No extra AI is used. It sends only when all of these hold:
          </span>
          <ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc", fontSize: "12px", lineHeight: "18px", color: "var(--text-secondary)" }}>
            {AUTO_REPLY_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
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
            replies a day · {data.sentToday} today
          </label>
          {data.enabled && data.enabledAt && (
            <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
              On since {relativeAge(data.enabledAt)}
            </span>
          )}
          <div className="ml-auto flex gap-2">
            <Button size="sm" icon="check" disabled={pending} onClick={() => save()}>
              Save
            </Button>
          </div>
        </div>

        {data.recent.length > 0 && (
          <div className="flex flex-col" style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 8 }}>
            <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", paddingBottom: 4 }}>
              Recent automatic replies
            </span>
            {data.recent.map((entry, index) => (
              <div key={index} className="flex items-start gap-2.5" style={{ padding: "6px 0", fontSize: "12px" }}>
                <Badge tone={STATUS_TONE[entry.status]}>{STATUS_LABEL[entry.status]}</Badge>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span style={{ textWrap: "pretty", overflowWrap: "anywhere" }}>{entry.subject}</span>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", overflowWrap: "anywhere" }}>
                    {entry.at} · {entry.to}
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
