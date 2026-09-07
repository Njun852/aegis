"use client";

import { Badge, Button } from "@/components/ui";

export interface MailHeaderProps {
  syncing: boolean;
  onSync: () => void;
  /** False until a real mailbox is connected. */
  mailboxConnected: boolean;
  /** The connected address, when there is one. */
  mailbox: string | null;
}

export function MailHeader({
  syncing,
  onSync,
  mailboxConnected,
  mailbox,
}: MailHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "30px",
            lineHeight: "36px",
            fontWeight: 700,
            letterSpacing: "-.02em",
          }}
        >
          AEGIS Mail
        </h2>
        <p
          style={{
            margin: "5px 0 0",
            fontSize: "13px",
            color: "var(--text-secondary)",
          }}
        >
          {mailboxConnected
            ? "Gmail-connected inbox with AI prioritization, summaries and suggested replies."
            : "AI prioritization, summaries and suggested replies. Connect a mailbox in Business Management to start retrieving mail."}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        {/*
          This badge used to read "Gmail connected" unconditionally, over an
          inbox nothing was connected to. It now states what is actually true,
          and matches what the system-status screen reports.
        */}
        <Badge
          tone={mailboxConnected ? "positive" : "warning"}
          icon={mailboxConnected ? "shield-check" : "circle-alert"}
        >
          {mailboxConnected
            ? `Gmail connected · ${mailbox}`
            : "No mailbox connected"}
        </Badge>
        <Button
          variant="primary"
          size="md"
          icon="refresh-cw"
          onClick={onSync}
          disabled={syncing}
        >
          {syncing ? "Syncing…" : "Sync now"}
        </Button>
      </div>
    </div>
  );
}
