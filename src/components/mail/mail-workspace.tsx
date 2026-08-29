"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { syncInboxAction } from "@/app/actions/ai";
import { useSync } from "@/components/layout/sync-provider";
import { Icon } from "@/components/ui";
import { buildFolders, buildPriorityFilters, filterMessages } from "@/lib/mail";
import type { MailFolderName, MailMessage, MailPriorityFilter } from "@/types";
import { ComposeModal } from "./compose-modal";
import { MailErrorBanner } from "./mail-error-banner";
import { MailFolderRail } from "./mail-folder-rail";
import { MailHeader } from "./mail-header";
import { MessageDetail } from "./message-detail";
import { MessageList } from "./message-list";
import styles from "./mail-workspace.module.css";

export interface MailWorkspaceProps {
  messages: MailMessage[];
  /** Whether this install has an OpenAI key, so "Sync now" can offer triage. */
  aiEnabled: boolean;
}

export function MailWorkspace({ messages, aiEnabled }: MailWorkspaceProps) {
  const router = useRouter();
  const [folder, setFolder] = useState<MailFolderName>("Inbox");
  const [priority, setPriority] = useState<MailPriorityFilter>("All");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [showError, setShowError] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [analysing, startAnalysing] = useTransition();

  const { syncing, sync } = useSync();

  const folders = useMemo(() => buildFolders(messages), [messages]);
  const priorities = useMemo(() => buildPriorityFilters(messages), [messages]);

  const visible = useMemo(() => {
    const byFilter = filterMessages(messages, folder, priority);
    const term = query.trim().toLowerCase();
    if (!term) return byFilter;
    return byFilter.filter((message) =>
      [message.subject, message.from, message.aiSummary].some((field) =>
        field.toLowerCase().includes(term),
      ),
    );
  }, [messages, folder, priority, query]);

  const active =
    messages.find((message) => message.id === activeId) ?? messages[0] ?? null;

  const selectMessage = (id: string) => {
    setActiveId(id);
    setDraft("");
  };

  /**
   * "Sync now" runs the retrieval animation and, when AI is configured, triages
   * whatever has not been analysed yet. Triage is a set difference on the
   * server, so pressing this on an already-analysed inbox costs nothing.
   */
  const handleSync = () => {
    sync();
    setNote(null);
    if (!aiEnabled) return;

    startAnalysing(async () => {
      const result = await syncInboxAction();
      if (result.note) {
        setNote(result.note);
      } else if (result.analysed > 0) {
        setNote(
          `Analysed ${result.analysed} ${result.analysed === 1 ? "message" : "messages"}.`,
        );
        router.refresh();
      } else {
        setNote("Every message is already analysed.");
      }
    });
  };

  return (
    <div className={styles.workspace}>
      <MailHeader syncing={syncing || analysing} onSync={handleSync} />

      {showError && (
        <MailErrorBanner
          onRetry={() => {
            setShowError(false);
            handleSync();
          }}
          onDismiss={() => setShowError(false)}
        />
      )}

      {note && (
        <div
          className="flex items-center gap-2"
          style={{
            padding: "9px 13px",
            border: "1px solid var(--blue-200)",
            background: "var(--accent-soft)",
            borderRadius: "var(--radius-md)",
          }}
        >
          <span
            style={{ color: "var(--accent-primary)", display: "inline-flex" }}
          >
            <Icon name="sparkles" size={14} />
          </span>
          <span
            style={{
              flex: 1,
              fontSize: "12px",
              color: "var(--text-accent)",
              textWrap: "pretty",
              overflowWrap: "anywhere",
            }}
          >
            {note}
          </span>
          <button
            type="button"
            onClick={() => setNote(null)}
            aria-label="Dismiss"
            style={{
              border: "none",
              background: "transparent",
              color: "var(--text-muted)",
              cursor: "pointer",
              display: "inline-flex",
            }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      )}

      <div className={styles.panes}>
        <MailFolderRail
          folders={folders}
          activeFolder={folder}
          onSelectFolder={setFolder}
          priorities={priorities}
          activePriority={priority}
          onSelectPriority={setPriority}
          onCompose={() => setComposeOpen(true)}
        />
        <MessageList
          messages={visible}
          activeId={active?.id ?? ""}
          onSelect={selectMessage}
          filterLabel={folder + (priority === "All" ? "" : ` · ${priority}`)}
          query={query}
          onQueryChange={setQuery}
        />
        {active ? (
          <MessageDetail
            key={active.id}
            message={active}
            draft={draft}
            onDraftChange={setDraft}
          />
        ) : (
          <section
            style={{
              background: "var(--surface-card)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-card)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "24px",
              fontSize: "13px",
              color: "var(--text-muted)",
              textAlign: "center",
            }}
          >
            No messages in this mailbox yet.
          </section>
        )}
      </div>

      <ComposeModal
        open={composeOpen}
        aiEnabled={aiEnabled}
        onClose={() => setComposeOpen(false)}
      />
    </div>
  );
}
