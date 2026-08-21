"use client";

import { Button, Icon, IconButton } from "@/components/ui";

export interface MailErrorBannerProps {
  onRetry: () => void;
  onDismiss: () => void;
}

export function MailErrorBanner({ onRetry, onDismiss }: MailErrorBannerProps) {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        padding: "14px 16px",
        border: "1px solid #F5C6C1",
        background: "#FEF3F2",
        borderRadius: "var(--radius-md)",
      }}
    >
      <span style={{ color: "#D92D20", flex: "0 0 auto", marginTop: 1 }}>
        <Icon name="circle-alert" size={16} />
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: "3px",
        }}
      >
        <span style={{ fontSize: "13px", fontWeight: 700, color: "#912018" }}>
          Retrieval error · 2 threads not fetched
        </span>
        <span
          style={{
            fontSize: "12px",
            color: "var(--text-secondary)",
            textWrap: "pretty",
            overflowWrap: "anywhere",
          }}
        >
          Gmail API returned{" "}
          <span style={{ fontFamily: "var(--font-mono)" }}>
            429 rateLimitExceeded
          </span>{" "}
          for label{" "}
          <span style={{ fontFamily: "var(--font-mono)" }}>Suppliers</span>.
          Auto-retry scheduled in 4 min.
        </span>
      </span>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry now
      </Button>
      <IconButton icon="x" size={32} label="Dismiss" onClick={onDismiss} />
    </div>
  );
}
