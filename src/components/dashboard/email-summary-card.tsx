"use client";

import { useRouter } from "next/navigation";
import { Card, ListRow } from "@/components/ui";
import { AWAITING_REPLY_COUNT } from "@/lib/data/dashboard";
import { MESSAGES } from "@/lib/data/mail";
import { countByPriority, countUnread, getPriorityStyle, recentMessages } from "@/lib/mail";
import type { MailStat } from "@/types";

export function EmailSummaryCard() {
  const router = useRouter();

  const stats: MailStat[] = [
    { label: "Unread", value: countUnread(), color: "var(--text-primary)" },
    // Deepened semantic hues: the token reds sit too light on a white tile.
    { label: "Urgent", value: countByPriority("Urgent"), color: "#B42318" },
    { label: "Awaiting reply", value: AWAITING_REPLY_COUNT, color: "#B25E09" },
  ];

  return (
    <Card
      title="Email Summary"
      action="View All"
      onAction={() => router.push("/mail")}
      padding="16px"
    >
      <div className="mb-2 flex flex-wrap gap-2">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="min-w-[82px] flex-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-2.5 py-2"
          >
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "17px",
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                color: stat.color,
              }}
            >
              {stat.value}
            </div>
            <div style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-col overflow-hidden">
        {recentMessages(3, MESSAGES).map((message) => {
          const priority = getPriorityStyle(message.priority);
          return (
            <ListRow
              key={message.id}
              title={message.subject}
              meta={`${message.from} · ${message.time}`}
              icon={priority.icon}
              iconColor={priority.color}
              tag={message.priority}
              onClick={() => router.push("/mail")}
            />
          );
        })}
      </div>
    </Card>
  );
}
