"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/layout/toast-provider";
import { Badge, Button, Card, Icon } from "@/components/ui";
import {
  disconnectMetaPageAction,
  saveMetaPageAction,
} from "@/app/actions/ad-account";
import { relativeAge } from "@/lib/freshness";
import type { MetaAdsStatus } from "@/types";

export interface MessengerPanelProps {
  businessId: string;
  businessName: string;
  status: MetaAdsStatus;
}

/**
 * Connects the Facebook Page whose Messenger chats belong to this business.
 *
 * The Page id is what a webhook delivery is matched on. The Page token is
 * optional and write-only, exactly like the ads token: it is typed in, checked
 * against Meta, stored encrypted, and never shown again.
 */
export function MessengerPanel({
  businessId,
  businessName,
  status: initial,
}: MessengerPanelProps) {
  const toast = useToast();
  const [status, setStatus] = useState(initial);
  const [pageId, setPageId] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startWork] = useTransition();

  const connect = () => {
    setError(null);
    startWork(async () => {
      const result = await saveMetaPageAction(businessId, pageId, token);
      if (result.status) setStatus(result.status);
      if (result.error) {
        setError(result.error);
        toast({
          tone: "error",
          title: "Page not connected",
          description: result.error,
          key: "messenger",
        });
        return;
      }

      setPageId("");
      setToken("");
      setShowToken(false);
      toast({
        tone: "success",
        title: "Page connected",
        description: `Chats with ${result.status?.pageName || "this Page"} will reach ${businessName} once the webhook is registered in Meta.`,
        key: "messenger",
      });
    });
  };

  const disconnect = () => {
    if (
      !window.confirm(
        `Disconnect the Page from ${businessName}? New chats stop arriving. Chats already stored are kept, and nothing changes in Meta.`,
      )
    ) {
      return;
    }
    setError(null);
    startWork(async () => {
      const result = await disconnectMetaPageAction(businessId);
      if (result.status) setStatus(result.status);
      toast({
        tone: "info",
        title: "Page disconnected",
        description: "The Page id and any stored token have been removed.",
        key: "messenger",
      });
    });
  };

  const waiting = status.pageId && !status.lastEventAt;

  return (
    <Card
      title="Messenger"
      padding="18px"
      action={
        <Badge
          tone={!status.pageId ? "neutral" : status.lastEventAt ? "positive" : "warning"}
          icon={!status.pageId ? "minus" : status.lastEventAt ? "check" : "alert-triangle"}
        >
          {!status.pageId ? "NO PAGE" : status.lastEventAt ? "RECEIVING" : "NOTHING YET"}
        </Badge>
      }
    >
      {status.pageId && (
        <dl style={listStyle}>
          <dt style={termStyle}>Page</dt>
          <dd style={valueStyle}>
            {status.pageName || "(name not read)"} · {status.pageId}
          </dd>
          <dt style={termStyle}>Page token</dt>
          <dd style={valueStyle}>
            {status.pageTokenStored
              ? "Stored, encrypted"
              : "None — customer names will be blank"}
          </dd>
          <dt style={termStyle}>Last chat received</dt>
          <dd style={valueStyle}>{relativeAge(status.lastEventAt)}</dd>
          <dt style={termStyle}>Chats stored</dt>
          <dd style={valueStyle}>{status.conversationCount}</dd>
        </dl>
      )}

      {waiting && (
        <Notice tone="warning">
          Nothing has arrived yet. Meta only delivers chats once the webhook is
          registered against a public address for this server, and while the app
          is in development it forwards messages only from people who have a role
          on the app.
        </Notice>
      )}

      {status.lastSignatureFailureAt && (
        <Notice tone="negative">
          A delivery was refused {relativeAge(status.lastSignatureFailureAt)} because its
          signature did not match. Check that META_APP_SECRET matches this app&apos;s
          secret. Refused deliveries are never stored.
        </Notice>
      )}

      <div className="flex flex-col gap-2.5">
        <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)" }}>
          {status.pageId ? "Replace Page or token" : "Connect a Page"}
        </span>

        <input
          value={pageId}
          onChange={(event) => setPageId(event.target.value)}
          placeholder="Page id (optional if a token is given)"
          autoComplete="off"
          style={fieldStyle}
        />
        <div style={{ position: "relative" }}>
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            type={showToken ? "text" : "password"}
            placeholder="Page access token (optional)"
            autoComplete="new-password"
            style={{ ...fieldStyle, paddingRight: "38px" }}
          />
          <button
            type="button"
            onClick={() => setShowToken((shown) => !shown)}
            aria-label={showToken ? "Hide token" : "Show token"}
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

        <p
          style={{
            margin: 0,
            fontSize: "11.5px",
            lineHeight: "17px",
            color: "var(--text-muted)",
          }}
        >
          Paste the Page access token on its own and AEGIS reads the Page id and
          name back from Meta. In Meta, register the webhook at{" "}
          <code style={{ fontFamily: "var(--font-mono)" }}>
            https://your-address/api/meta/webhook
          </code>{" "}
          and subscribe to messages and messaging_referrals. AEGIS reads chats and
          never sends a message; staff reply in Meta Business Suite.
        </p>

        {error && <Notice tone="negative">{error}</Notice>}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            icon="check"
            disabled={busy || (!pageId.trim() && !token.trim())}
            onClick={connect}
          >
            {busy ? "Checking…" : status.pageId ? "Replace" : "Connect Page"}
          </Button>
          {status.pageId && (
            <Button variant="ghost" disabled={busy} onClick={disconnect}>
              Disconnect Page
            </Button>
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
        background:
          tone === "negative" ? "var(--status-negative-soft)" : "var(--status-warning-soft)",
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
