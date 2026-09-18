"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/layout/toast-provider";
import { Badge, Button, Card, Icon } from "@/components/ui";
import {
  disconnectMetaAdsAction,
  saveMetaAdsAction,
  testMetaAdsAction,
} from "@/app/actions/ad-account";
import { relativeAge } from "@/lib/freshness";
import type { MetaAdsStatus } from "@/types";

export interface MetaAdsPanelProps {
  businessId: string;
  businessName: string;
  status: MetaAdsStatus;
}

/**
 * Connects a Meta ad account to one business, read-only.
 *
 * The token is write-only from here, exactly like the mailbox app password: it
 * is typed in, checked against Meta, sent once, and never comes back. Nothing
 * this component receives can contain it — the server hands over a
 * `MetaAdsStatus`, which has no field for a secret.
 */
export function MetaAdsPanel({
  businessId,
  businessName,
  status: initial,
}: MetaAdsPanelProps) {
  const toast = useToast();
  const [status, setStatus] = useState(initial);
  const [accountId, setAccountId] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startWork] = useTransition();

  const connect = () => {
    setError(null);
    startWork(async () => {
      const result = await saveMetaAdsAction(businessId, accountId, token);
      if (result.error) {
        setError(result.error);
        toast({
          tone: "error",
          title: "Meta account not connected",
          description: result.error,
          key: "meta-ads",
        });
        return;
      }

      if (result.status) setStatus(result.status);
      // Cleared immediately: there is no reason for the token to stay in the
      // page after it has been stored.
      setToken("");
      setAccountId("");
      setShowToken(false);
      toast({
        tone: "success",
        title: "Meta ad account connected",
        description: `${result.status?.accountName ?? "The account"} is linked to ${businessName}. Press Sync now on the Ads screen to read it.`,
        key: "meta-ads",
      });
    });
  };

  const test = () => {
    setError(null);
    startWork(async () => {
      const result = await testMetaAdsAction(businessId);
      if (result.status) setStatus(result.status);
      toast({
        tone: result.error ? "error" : "success",
        title: result.error ? "Meta test failed" : "Meta account reachable",
        description:
          result.error ??
          `Read ${result.status?.accountName ?? "the account"} · ${result.status?.currency ?? ""} · ${result.status?.timezone ?? ""}.`,
        key: "meta-ads",
      });
    });
  };

  const disconnect = () => {
    if (
      !window.confirm(
        `Disconnect the Meta ad account from ${businessName}? The stored token and the synced copy of the account are removed, and the Ads screen goes back to sample data. Nothing changes in Meta.`,
      )
    ) {
      return;
    }

    setError(null);
    startWork(async () => {
      const result = await disconnectMetaAdsAction(businessId);
      if (result.status) setStatus(result.status);
      toast({
        tone: "info",
        title: "Meta ad account disconnected",
        description: "The token and the synced rows have been removed.",
        key: "meta-ads",
      });
    });
  };

  return (
    <Card
      title="Meta Ads"
      padding="18px"
      action={
        <Badge
          tone={status.lastError ? "negative" : status.connected ? "positive" : "neutral"}
          icon={status.lastError ? "alert-triangle" : status.connected ? "check" : "minus"}
        >
          {status.lastError ? "ERROR" : status.connected ? "CONNECTED" : "NOT CONNECTED"}
        </Badge>
      }
    >
      {status.connected && (
        <dl style={listStyle}>
          <dt style={termStyle}>Account</dt>
          <dd style={valueStyle}>
            {status.accountName} · {status.adAccountId}
          </dd>
          <dt style={termStyle}>Currency · timezone</dt>
          <dd style={valueStyle}>
            {status.currency} · {status.timezone || "—"}
          </dd>
          <dt style={termStyle}>Connected</dt>
          <dd style={valueStyle}>{relativeAge(status.updatedAt)}</dd>
          <dt style={termStyle}>Last sync</dt>
          <dd style={valueStyle}>
            {relativeAge(status.lastSyncAt)}
            {status.lastSyncAt ? ` · ${status.rowCount} rows` : ""}
          </dd>
        </dl>
      )}

      {status.connected && status.canWrite && (
        <Notice tone="warning">
          This token can also change ads (it holds ads_management). AEGIS never
          writes to Meta either way, but a token with only ads_read limits what a
          leak could do. Generate one with ads_read only and replace it here.
        </Notice>
      )}

      {status.lastError && (
        <Notice tone="negative">
          {status.lastError} Last failed {relativeAge(status.lastErrorAt)}.
        </Notice>
      )}

      <div className="flex flex-col gap-2.5">
        <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)" }}>
          {status.connected ? "Replace account or token" : "Connect an ad account"}
        </span>

        <input
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
          placeholder="Ad account id, e.g. act_1234567890"
          autoComplete="off"
          style={fieldStyle}
        />
        <div style={{ position: "relative" }}>
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            type={showToken ? "text" : "password"}
            placeholder="System user access token"
            autoComplete="new-password"
            style={{ ...fieldStyle, paddingRight: "38px" }}
          />
          <button
            type="button"
            onClick={() => setShowToken((shown) => !shown)}
            aria-label={showToken ? "Hide token" : "Show token"}
            title={showToken ? "Hide token" : "Show token"}
            style={{
              position: "absolute",
              right: "6px",
              top: "50%",
              transform: "translateY(-50%)",
              display: "inline-flex",
              padding: "5px",
              border: "none",
              background: "transparent",
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            <Icon name={showToken ? "eye-off" : "eye"} size={15} />
          </button>
        </div>

        <p style={{ margin: 0, fontSize: "11.5px", lineHeight: "17px", color: "var(--text-muted)" }}>
          In Business settings, create a system user, assign it this ad account
          with view performance only, and generate a token for your AEGIS app
          with the ads_read permission. AEGIS checks the token against Meta
          before saving, stores it encrypted, and only ever reads the account.
        </p>

        {error && <Notice tone="negative">{error}</Notice>}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            icon="check"
            disabled={busy || !accountId.trim() || !token.trim()}
            onClick={connect}
          >
            {busy ? "Checking…" : status.connected ? "Replace" : "Connect"}
          </Button>
          {status.connected && (
            <>
              <Button variant="secondary" icon="refresh-cw" disabled={busy} onClick={test}>
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

function Notice({
  tone,
  children,
}: {
  tone: "negative" | "warning";
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === "negative" ? "alert" : "status"}
      className="flex items-start gap-2"
      style={{
        padding: "9px 11px",
        borderRadius: "var(--radius-md)",
        background: tone === "negative" ? "var(--status-negative-soft)" : "var(--status-warning-soft)",
        fontSize: "12.5px",
        lineHeight: "18px",
        color: "var(--text-secondary)",
        overflowWrap: "anywhere",
      }}
    >
      <span
        style={{
          color: tone === "negative" ? "var(--status-negative)" : "var(--status-warning)",
          flexShrink: 0,
          display: "inline-flex",
          paddingTop: "2px",
        }}
      >
        <Icon name="alert-triangle" size={14} />
      </span>
      <span>{children}</span>
    </div>
  );
}

const listStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, auto) minmax(0, 1fr)",
  columnGap: "var(--space-4)",
  rowGap: "6px",
  fontSize: "12.5px",
  margin: 0,
} as const;

const termStyle = { color: "var(--text-muted)" } as const;
const valueStyle = { margin: 0, overflowWrap: "anywhere" } as const;

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
