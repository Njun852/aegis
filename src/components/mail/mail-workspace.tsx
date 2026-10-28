"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { setMessageReadAction } from "@/app/actions/mail";
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
import { MailFolderRail } from "./mail-folder-rail";
import { MailHeader } from "./mail-header";
import { MessageDetail } from "./message-detail";
import { MessageList } from "./message-list";
import styles from "./mail-workspace.module.css";

export interface MailWorkspaceProps {
  messages: MailMessage[];
  /** Whether this install has an OpenAI key, so Compose can offer a draft. */
  aiEnabled: boolean;
  /** The connected mailbox address, or null when none is connected. */
  mailbox: string | null;
}

export function MailWorkspace({
  messages,
  aiEnabled,
  mailbox,
}: MailWorkspaceProps) {
  const router = useRouter();
  const toast = useToast();
  const [folder, setFolder] = useState<MailFolderName>("Inbox");
  const [priority, setPriority] = useState<MailPriorityFilter>("All");
  const [flag, setFlag] = useState<MailFlagFilter>("All");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);

  // The inbox syncs itself every two minutes, from the shell (`AutoSync`).
  const { connected } = useSync();

  const folders = useMemo(() => buildFolders(messages), [messages]);

  /**
   * Each filter counts within the others, not across the whole inbox.
   *
   * Priority counts used to be taken over every message, so opening Customer
   * still offered "Urgent 2" when the two urgent messages were in Fleet —
   * picking it emptied the list. A facet's counts now describe what choosing it
   * would actually leave, which is the only reading of the number that is any
   * use. Folder counts stay whole-inbox totals, the way a mailbox reports them.
   */
  const priorities = useMemo(
    () => buildPriorityFilters(filterMessages(messages, folder, "All", flag)),
    [messages, folder, flag],
  );

  const flags = useMemo(() => {
    const scoped = filterMessages(messages, folder, priority, "All");
    return (["All", "Needs Action", "Unread"] as MailFlagFilter[]).map(
      (label) => ({
        label,
        icon: label === "Unread" ? "mail" : label === "All" ? "inbox" : "check",
        count: countByFlag(scoped, label),
      }),
    );
  }, [messages, folder, priority]);

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

  // No fallback to the first message: with one main pane, a default selection
  // would mean the list could never be the thing you are looking at.
  const active = activeId
    ? (messages.find((message) => message.id === activeId) ?? null)
    : null;

  const [, startMarking] = useTransition();

  /**
   * Opening a message marks it read — in the mailbox first, then here.
   *
   * Done from the click rather than from an effect in the detail, so it happens
   * once per deliberate open instead of on every mount. A failure is reported
   * but not worked around: the message simply stays unread, which is both
   * recoverable and true.
   */
  const selectMessage = (id: string) => {
    setActiveId(id);

    const opened = messages.find((message) => message.id === id);
    if (!opened?.unread) return;

    startMarking(async () => {
      const result = await setMessageReadAction(id, true);
      if (result.error) {
        toast({
          tone: "error",
          title: "Could not mark as read",
          description: result.error,
          key: "mail-read-state",
        });
        return;
      }
      router.refresh();
    });
  };

  /**
   * Changing what you are filtering by returns you to the list. Leaving an open
   * message on screen while the folder behind it changes would show a message
   * the current filter may not even include.
   */
  const refilter = <T,>(apply: (value: T) => void) => (value: T) => {
    setActiveId(null);
    apply(value);
  };

  return (
    <div className={styles.workspace}>
      <MailHeader />

      <div className={styles.panes}>
        <MailFolderRail
          folders={folders}
          activeFolder={folder}
          onSelectFolder={refilter(setFolder)}
          flags={flags}
          activeFlag={flag}
          onSelectFlag={refilter(setFlag)}
          onCompose={() => setComposeOpen(true)}
        />
        {active ? (
          <MessageDetail
            key={active.id}
            message={active}
            onBack={() => setActiveId(null)}
            mailbox={mailbox}
          />
        ) : (
          <MessageList
            messages={visible}
            activeId=""
            onSelect={selectMessage}
            filterLabel={
              folder +
              (priority === "All" ? "" : ` · ${priority}`) +
              (flag === "All" ? "" : ` · ${flag}`)
            }
            query={query}
            onQueryChange={setQuery}
            priorities={priorities}
            activePriority={priority}
            onSelectPriority={refilter(setPriority)}
            totalHeld={messages.length}
            mailboxConnected={connected}
          />
        )}
      </div>

      <ComposeModal
        open={composeOpen}
        aiEnabled={aiEnabled}
        mailbox={mailbox}
        onClose={() => setComposeOpen(false)}
      />
    </div>
  );
}
