"use client";

import { Badge, Button } from "@/components/ui";
import { ORGANIZATION } from "@/lib/data/workspace";

export interface MailHeaderProps {
  syncing: boolean;
  onSync: () => void;
}

export function MailHeader({ syncing, onSync }: MailHeaderProps) {
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
          Gmail-connected inbox with AI prioritization, summaries and suggested
          replies.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <Badge tone="positive" icon="shield-check">
          Gmail connected · {ORGANIZATION.mailbox}
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
