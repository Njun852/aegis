"use client";

import { Badge, Icon, ListRow, SearchInput } from "@/components/ui";
import { getPriorityStyle } from "@/lib/mail";
import type {
  MailMessage,
  MailPriorityFilter,
  MailPriorityOption,
} from "@/types";

export interface MessageListProps {
  messages: MailMessage[];
  activeId: string;
  onSelect: (id: string) => void;
  filterLabel: string;
  query: string;
  onQueryChange: (query: string) => void;
  /** Counted within the folder and flag already applied, never the whole inbox. */
  priorities: MailPriorityOption[];
  activePriority: MailPriorityFilter;
  onSelectPriority: (priority: MailPriorityFilter) => void;
  /** Messages held before filtering, so an empty inbox reads differently. */
  totalHeld: number;
  /** False until a mailbox is connected. */
  mailboxConnected: boolean;
}

export function MessageList({
  messages,
  activeId,
  onSelect,
  filterLabel,
  query,
  onQueryChange,
  priorities,
  activePriority,
  onSelectPriority,
  totalHeld,
  mailboxConnected,
}: MessageListProps) {
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
          padding: "14px",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        <SearchInput
          placeholder="Search mail"
          width="100%"
          value={query}
          onChange={onQueryChange}
        />

        {/*
          AI Priority sits with the list it filters rather than in the folder
          rail. Beside the search box it reads as one control over the same set,
          and its counts are of the folder you are actually in.
        */}
        <div className="flex flex-wrap items-center gap-1.5">
          {priorities.map((option) => {
            const active = option.label === activePriority;
            const empty = option.count === 0 && !active;

            return (
              <button
                key={option.label}
                type="button"
                onClick={() => onSelectPriority(option.label)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "4px 9px",
                  borderRadius: "var(--radius-pill)",
                  border: `1px solid ${active ? "var(--accent-primary)" : "var(--border-default)"}`,
                  background: active ? "var(--accent-soft)" : "var(--surface-card)",
                  color: active ? "var(--text-accent)" : "var(--text-secondary)",
                  fontWeight: active ? 700 : 500,
                  fontFamily: "var(--font-body)",
                  fontSize: "11.5px",
                  lineHeight: "16px",
                  cursor: "pointer",
                  // Dimmed, not hidden: a priority with nothing in this folder
                  // is worth knowing about before it is clicked.
                  opacity: empty ? 0.45 : 1,
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "var(--radius-pill)",
                    background: option.dot,
                    flex: "0 0 auto",
                  }}
                />
                {option.label}
                <span
                  style={{
                    fontVariantNumeric: "tabular-nums",
                    color: active ? "var(--text-accent)" : "var(--text-muted)",
                  }}
                >
                  {option.count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-2.5">
          <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
            <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>
              {messages.length}
            </span>{" "}
            threads · {filterLabel}
          </span>
          <Badge tone="accent" icon="sparkles">
            AI sorted
          </Badge>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {messages.map((message) => {
          const priority = getPriorityStyle(message.priority);
          const active = message.id === activeId;

          return (
            <div
              key={message.id}
              style={{
                background: active ? "#F5F9FF" : "var(--surface-card)",
                borderLeft: `3px solid ${active ? "var(--accent-primary)" : priority.accent}`,
                borderBottom: "1px solid var(--border-subtle)",
                padding: "4px 10px 10px",
                /*
                  Read mail recedes rather than disappearing — the same signal
                  as the bold/plain convention every mail client uses, done with
                  contrast because the row's text comes from a shared primitive.
                */
                opacity: message.unread ? 1 : 0.58,
              }}
            >
              <div className="flex items-center gap-1.5">
                <span
                  aria-label={message.unread ? "Unread" : undefined}
                  title={message.unread ? "Unread" : "Read"}
                  style={{
                    width: 7,
                    height: 7,
                    flex: "0 0 auto",
                    borderRadius: "var(--radius-pill)",
                    // Kept as a transparent placeholder when read, so the
                    // subject lines stay aligned down the whole list.
                    background: message.unread
                      ? "var(--accent-primary)"
                      : "transparent",
                  }}
                />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <ListRow
                    title={message.subject}
                    meta={`${message.from} · ${message.time}`}
                    icon={priority.icon}
                    iconColor={priority.color}
                    onClick={() => onSelect(message.id)}
                  />
                </span>
              </div>
              <div
                onClick={() => onSelect(message.id)}
                className="flex cursor-pointer flex-col gap-[7px] px-1"
              >
                <span className="flex items-start gap-1.5">
                  <span
                    style={{
                      color: "var(--accent-primary)",
                      flex: "0 0 auto",
                      marginTop: 1,
                    }}
                  >
                    <Icon name="sparkles" size={12} />
                  </span>
                  <span
                    style={{
                      minWidth: 0,
                      fontSize: "11.5px",
                      color: "var(--text-secondary)",
                      lineHeight: "16px",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {message.aiSummary}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={priority.tone}>{message.priority}</Badge>
                  <Badge tone="neutral" pill={false}>
                    {message.category}
                  </Badge>
                </span>
              </div>
            </div>
          );
        })}

        {messages.length === 0 && (
          <p
            style={{
              margin: 0,
              padding: "24px 16px",
              fontSize: "12.5px",
              lineHeight: "18px",
              color: "var(--text-muted)",
            }}
          >
            {/*
              An inbox with nothing in it is not the same as a filter that
              matches nothing, and since the sample inbox was removed the first
              case is what a new install actually sees.
            */}
            {totalHeld > 0
              ? "No threads match this filter."
              : mailboxConnected
                ? "No mail retrieved yet. Press Sync now to check the mailbox."
                : "No mailbox is connected. An AEGIS administrator can connect one in Business Management."}
          </p>
        )}
      </div>
    </section>
  );
}
