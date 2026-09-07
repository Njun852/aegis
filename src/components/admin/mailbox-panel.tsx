"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/layout/toast-provider";
import { Badge, Button, Card, Icon } from "@/components/ui";
import {
  disconnectMailboxAction,
  saveMailboxAction,
  testMailboxAction,
} from "@/app/actions/mailbox";
import { relativeAge } from "@/lib/freshness";
import type { MailboxStatus } from "@/types";

export interface MailboxPanelProps {
  businessId: string;
  businessName: string;
  status: MailboxStatus;
}

/**
 * Connects a company mailbox to one business.
 *
 * The app password is write-only from here: it is typed in, sent once, and
 * never comes back. Nothing this component receives can contain it — the
 * server hands over a `MailboxStatus`, which has no field for a secret — so a
 * password cannot be leaked into the page source even by accident.
 */
export function MailboxPanel({
  businessId,
  businessName,
  status: initial,
}: MailboxPanelProps) {
  const toast = useToast();
  const [status, setStatus] = useState(initial);
  const [address, setAddress] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, startWork] = useTransition();

  const connect = () => {
    setError(null);
    startWork(async () => {
      const result = await saveMailboxAction(businessId, address, appPassword);
      if (result.error) {
        setError(result.error);
        return;
      }

      if (result.status) setStatus(result.status);
      // Cleared immediately: there is no reason for the secret to stay in the
      // page after it has been stored.
      setAppPassword("");
      setAddress("");
      toast({
        tone: "success",
        title: "Mailbox connected",
        description: `${businessName} will retrieve mail on the next sync.`,
        key: "mailbox",
      });
    });
  };

  const test = () => {
    setError(null);
    startWork(async () => {
      const result = await testMailboxAction(businessId);
      if (result.status) setStatus(result.status);

      toast({
        tone: result.error ? "error" : "success",
        title: result.error ? "Mailbox test failed" : "Mailbox reachable",
        description:
          result.error ?? "Signed in and opened the inbox successfully.",
        key: "mailbox",
      });
    });
  };

  const disconnect = () => {
    if (
      !window.confirm(
        `Disconnect the mailbox from ${businessName}? Mail already retrieved is kept; nothing new will arrive until it is reconnected.`,
      )
    ) {
      return;
    }

    setError(null);
    startWork(async () => {
      const result = await disconnectMailboxAction(businessId);
      if (result.status) setStatus(result.status);
      toast({
        tone: "info",
        title: "Mailbox disconnected",
        description: "The stored app password has been removed.",
        key: "mailbox",
      });
    });
  };

  return (
    <Card
      title="Mailbox"
      padding="18px"
      action={
        <Badge
          tone={status.lastError ? "negative" : status.connected ? "positive" : "neutral"}
          icon={status.lastError ? "alert-triangle" : status.connected ? "check" : "minus"}
        >
          {status.lastError
            ? "ERROR"
            : status.connected
              ? "CONNECTED"
              : "NOT CONNECTED"}
        </Badge>
      }
    >
      {status.connected && (
        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, auto) minmax(0, 1fr)",
            columnGap: "var(--space-4)",
            rowGap: "6px",
            fontSize: "12.5px",
            margin: 0,
          }}
        >
          <dt style={{ color: "var(--text-muted)" }}>Address</dt>
          <dd style={{ margin: 0, overflowWrap: "anywhere" }}>
            {status.address}
          </dd>
          <dt style={{ color: "var(--text-muted)" }}>Connected</dt>
          <dd style={{ margin: 0 }}>{relativeAge(status.updatedAt)}</dd>
          <dt style={{ color: "var(--text-muted)" }}>Last retrieval</dt>
          <dd style={{ margin: 0 }}>{relativeAge(status.lastSyncAt)}</dd>
        </dl>
      )}

      {status.lastError && (
        <div
          role="alert"
          className="flex items-start gap-2"
          style={{
            fontSize: "12.5px",
            lineHeight: "18px",
            color: "var(--text-secondary)",
            overflowWrap: "anywhere",
          }}
        >
          <span style={{ color: "var(--status-negative)", flexShrink: 0 }}>
            <Icon name="alert-triangle" size={14} />
          </span>
          <span>
            {status.lastError} Last failed {relativeAge(status.lastErrorAt)}.
          </span>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        <span
          style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)" }}
        >
          {status.connected ? "Replace credentials" : "Connect a mailbox"}
        </span>

        <input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="mailbox@company.com"
          autoComplete="off"
          style={fieldStyle}
        />
        <input
          value={appPassword}
          onChange={(event) => setAppPassword(event.target.value)}
          type="password"
          placeholder="16-character app password"
          autoComplete="new-password"
          style={fieldStyle}
        />

        <p
          style={{
            margin: 0,
            fontSize: "11.5px",
            lineHeight: "17px",
            color: "var(--text-muted)",
          }}
        >
          Switch on 2-Step Verification for the account, then generate an app
          password at myaccount.google.com/apppasswords. It is stored encrypted
          and can be revoked from that page at any time — revoking it is also how
          the disconnection test is performed.
        </p>

        {error && (
          <div
            role="alert"
            style={{
              padding: "9px 11px",
              borderRadius: "var(--radius-md)",
              background: "var(--status-negative-soft)",
              color: "var(--status-negative)",
              fontSize: "12.5px",
              overflowWrap: "anywhere",
            }}
          >
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            icon="check"
            disabled={busy || !address.trim() || !appPassword.trim()}
            onClick={connect}
          >
            {busy ? "Working…" : status.connected ? "Replace" : "Connect"}
          </Button>
          {status.connected && (
            <>
              <Button
                variant="secondary"
                icon="refresh-cw"
                disabled={busy}
                onClick={test}
              >
                Test connection
              </Button>
              <Button variant="ghost" disabled={busy} onClick={disconnect}>
                Disconnect
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

const fieldStyle = {
  width: "100%",
  font: "inherit",
  fontSize: "13px",
  color: "var(--text-primary)",
  background: "var(--surface-card)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-md)",
  padding: "9px 11px",
  outline: "none",
} as const;
