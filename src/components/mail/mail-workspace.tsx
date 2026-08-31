"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { syncInboxAction } from "@/app/actions/ai";
import { useSync } from "@/components/layout/sync-provider";
import { useToast } from "@/components/layout/toast-provider";
import {
  buildFolders,
  buildPriorityFilters,
  countByFlag,
  filterMessages,
} from "@/lib/mail";
import type {
  MailFlagFilter,
  MailFolderName,
  MailMessage,
  MailPriorityFilter,
} from "@/types";
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
  const toast = useToast();
  const [folder, setFolder] = useState<MailFolderName>("Inbox");
  const [priority, setPriority] = useState<MailPriorityFilter>("All");
  const [flag, setFlag] = useState<MailFlagFilter>("All");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [showError, setShowError] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [analysing, startAnalysing] = useTransition();

  const { syncing, sync } = useSync();

  const folders = useMemo(() => buildFolders(messages), [messages]);
  const priorities = useMemo(() => buildPriorityFilters(messages), [messages]);

  const flags = useMemo(
    () =>
      (["All", "Needs Action", "Unread"] as MailFlagFilter[]).map((label) => ({
        label,
        icon:
          label === "Unread" ? "mail" : label === "All" ? "inbox" : "check",
        count: countByFlag(messages, label),
      })),
    [messages],
  );

  const visible = useMemo(() => {
    const byFilter = filterMessages(messages, folder, priority, flag);
    const term = query.trim().toLowerCase();
    if (!term) return byFilter;
    return byFilter.filter((message) =>
      [message.subject, message.from, message.aiSummary].some((field) =>
        field.toLowerCase().includes(term),
      ),
    );
  }, [messages, folder, priority, flag, query]);

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
    if (!aiEnabled) return;

    startAnalysing(async () => {
      const result = await syncInboxAction();

      // One key for the whole operation, so pressing Sync repeatedly replaces
      // the last result rather than stacking identical notices.
      if (result.note) {
        toast({
          tone: "error",
          title: "Inbox not fully analysed",
          description: result.note,
          key: "mail-sync",
        });
      } else if (result.analysed > 0) {
        toast({
          tone: "info",
          title: `Analysed ${result.analysed} ${result.analysed === 1 ? "message" : "messages"}`,
          description: "Priorities, summaries and suggested replies updated.",
          key: "mail-sync",
        });
        router.refresh();
      } else {
        toast({
          tone: "info",
          title: "Inbox is already up to date",
          description: "Every message has been analysed — nothing was spent.",
          key: "mail-sync",
        });
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

      <div className={styles.panes}>
        <MailFolderRail
          folders={folders}
          activeFolder={folder}
          onSelectFolder={setFolder}
          priorities={priorities}
          activePriority={priority}
          onSelectPriority={setPriority}
          flags={flags}
          activeFlag={flag}
          onSelectFlag={setFlag}
          onCompose={() => setComposeOpen(true)}
        />
        <MessageList
          messages={visible}
          activeId={active?.id ?? ""}
          onSelect={selectMessage}
          filterLabel={
            folder +
            (priority === "All" ? "" : ` · ${priority}`) +
            (flag === "All" ? "" : ` · ${flag}`)
          }
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
