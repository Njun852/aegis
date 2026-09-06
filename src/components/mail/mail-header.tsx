"use client";

import { Badge, Button } from "@/components/ui";
import { ORGANIZATION } from "@/lib/data/workspace";

export interface MailHeaderProps {
  syncing: boolean;
  onSync: () => void;
  /** False until a real mailbox is connected. */
  mailboxConnected: boolean;
  /** The connected address, when there is one. */
  mailbox: string | null;
  /** How long ago the newest held message arrived. */
  dataAge: string;
}

export function MailHeader({
  syncing,
  onSync,
  mailboxConnected,
  mailbox,
  dataAge,
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
            : "AI prioritization, summaries and suggested replies, running on the seeded sample inbox until a mailbox is connected."}
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
            ? `Gmail connected · ${mailbox ?? ORGANIZATION.mailbox}`
            : `No mailbox connected · sample inbox, updated ${dataAge}`}
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
