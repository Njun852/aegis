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
              }}
            >
              <ListRow
                title={message.subject}
                meta={`${message.from} · ${message.time}`}
                icon={priority.icon}
                iconColor={priority.color}
                onClick={() => onSelect(message.id)}
              />
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
              color: "var(--text-muted)",
            }}
          >
            No threads match this filter.
          </p>
        )}
      </div>
    </section>
  );
}
