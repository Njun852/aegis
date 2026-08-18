"use client";

import {
  Avatar,
  Badge,
  Button,
  Icon,
  IconButton,
  InsightPanel,
} from "@/components/ui";
import { ORGANIZATION } from "@/lib/data/workspace";
import { getPriorityStyle } from "@/lib/mail";
import type { MailMessage } from "@/types";

export interface MessageDetailProps {
  message: MailMessage;
  draft: string;
  onDraftChange: (draft: string) => void;
}

export function MessageDetail({
  message,
  draft,
  onDraftChange,
}: MessageDetailProps) {
  const priority = getPriorityStyle(message.priority);

  return (
    <section
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-card)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        minHeight: 0,
      }}
    >
      <div
        style={{
          flex: "0 0 auto",
          padding: "18px 20px",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <h3
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "18px",
              lineHeight: "24px",
              fontWeight: 700,
              letterSpacing: "-.015em",
              textWrap: "pretty",
            }}
          >
            {message.subject}
          </h3>
          <span style={{ flex: "0 0 auto" }}>
            <Badge tone={priority.tone}>{message.priority}</Badge>
          </span>
        </div>
        <div className="flex items-center gap-[11px]">
          <Avatar name={message.from} size={36} />
          <span className="flex min-w-0 flex-col leading-[1.3]">
            <span style={{ fontSize: "13px", fontWeight: 600 }}>
              {message.from}
            </span>
            <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
              {message.email} · {message.date}
            </span>
          </span>
          <span className="ml-auto flex gap-2">
            <IconButton
              icon="external-link"
              size={34}
              label="Open in Gmail"
            />
            <IconButton icon="archive" size={34} label="Archive" />
          </span>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "18px 20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <InsightPanel title="AI Summary" body={message.aiSummary} />
        <div className="flex flex-wrap gap-2">
          {message.actionItems.map((item) => (
            <Badge key={item} tone="info" pill={false} icon="check">
              {item}
            </Badge>
          ))}
        </div>
        <div className="flex flex-col gap-3">
          {message.body.map((paragraph) => (
            <p
              key={paragraph}
              style={{
                margin: 0,
                fontSize: "13.5px",
                lineHeight: "21px",
                color: "var(--text-primary)",
                textWrap: "pretty",
              }}
            >
              {paragraph}
            </p>
          ))}
        </div>
      </div>

      <div
        style={{
          flex: "0 0 auto",
          borderTop: "1px solid var(--border-subtle)",
          padding: "14px 20px 16px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          background: "var(--gray-25)",
        }}
      >
        <div className="flex items-center gap-[7px]">
          <span style={{ color: "var(--accent-primary)" }}>
            <Icon name="sparkles" size={14} />
          </span>
          <span
            style={{
              fontSize: "11.5px",
              fontWeight: 700,
              color: "var(--text-accent)",
            }}
          >
            Suggested Replies
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {message.replies.map((reply) => (
            <Button
              key={reply}
              variant="outline"
              size="sm"
              onClick={() => onDraftChange(reply)}
            >
              {reply}
            </Button>
          ))}
        </div>
        <textarea
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder="Write a reply, or pick a suggestion above…"
          style={{
            width: "100%",
            minHeight: 74,
            resize: "vertical",
            font: "inherit",
            fontSize: "13px",
            lineHeight: "20px",
            color: "var(--text-primary)",
            background: "var(--surface-card)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-md)",
            padding: "11px 13px",
            outline: "none",
          }}
        />
        <div className="flex items-center gap-3">
          <Button variant="primary" size="md" icon="send">
            Send reply
          </Button>
          <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
            Sends via Gmail as {ORGANIZATION.mailbox}
          </span>
        </div>
      </div>
    </section>
  );
}
