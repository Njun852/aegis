"use client";

import { useMemo, useState } from "react";
import { useSync } from "@/components/layout/sync-provider";
import { MESSAGES } from "@/lib/data/mail";
import { buildFolders, buildPriorityFilters, filterMessages } from "@/lib/mail";
import type { MailFolderName, MailPriorityFilter } from "@/types";
import { ComposeModal } from "./compose-modal";
import { MailErrorBanner } from "./mail-error-banner";
import { MailFolderRail } from "./mail-folder-rail";
import { MailHeader } from "./mail-header";
import { MessageDetail } from "./message-detail";
import { MessageList } from "./message-list";
import styles from "./mail-workspace.module.css";

export function MailWorkspace() {
  const [folder, setFolder] = useState<MailFolderName>("Inbox");
  const [priority, setPriority] = useState<MailPriorityFilter>("All");
  const [activeId, setActiveId] = useState(MESSAGES[0].id);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [showError, setShowError] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);

  const { syncing, sync } = useSync();

  const folders = useMemo(() => buildFolders(MESSAGES), []);
  const priorities = useMemo(() => buildPriorityFilters(MESSAGES), []);

  const visible = useMemo(() => {
    const byFilter = filterMessages(MESSAGES, folder, priority);
    const term = query.trim().toLowerCase();
    if (!term) return byFilter;
    return byFilter.filter((message) =>
      [message.subject, message.from, message.aiSummary].some((field) =>
        field.toLowerCase().includes(term),
      ),
    );
  }, [folder, priority, query]);

  const active =
    MESSAGES.find((message) => message.id === activeId) ?? MESSAGES[0];

  const selectMessage = (id: string) => {
    setActiveId(id);
    setDraft("");
  };

  return (
    <div className={styles.workspace}>
      <MailHeader syncing={syncing} onSync={sync} />

      {showError && (
        <MailErrorBanner
          onRetry={() => {
            setShowError(false);
            sync();
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
          onCompose={() => setComposeOpen(true)}
        />
        <MessageList
          messages={visible}
          activeId={activeId}
          onSelect={selectMessage}
          filterLabel={folder + (priority === "All" ? "" : ` · ${priority}`)}
          query={query}
          onQueryChange={setQuery}
        />
        <MessageDetail
          key={active.id}
          message={active}
          draft={draft}
          onDraftChange={setDraft}
        />
      </div>

      <ComposeModal open={composeOpen} onClose={() => setComposeOpen(false)} />
    </div>
  );
}
