"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { syncInboxAction } from "@/app/actions/ai";
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
  /** Whether this install has an OpenAI key, so "Sync now" can offer triage. */
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
  const [analysing, startAnalysing] = useTransition();

  const { syncing, sync, connected } = useSync();

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

  /**
   * "Sync now" runs the retrieval animation and, when AI is configured, triages
   * whatever has not been analysed yet. Triage is a set difference on the
   * server, so pressing this on an already-analysed inbox costs nothing.
   */
  const handleSync = () => {
    // Re-reads real freshness. With no mailbox connected there is nothing to
    // retrieve, and saying so is the point — the old version played a
    // retrieval animation over an inbox nothing was feeding.
    void sync().then((connected) => {
      if (!connected) {
        toast({
          tone: "info",
          title: "No mailbox connected",
          description:
            "Mail is showing the seeded sample inbox. Connect a company mailbox to retrieve new messages.",
          key: "mail-connection",
        });
      }
    });

    if (!aiEnabled) return;

    startAnalysing(async () => {
      const result = await syncInboxAction();

      // A mailbox failure outranks anything the analysis has to say: if mail
      // could not be retrieved, what was or was not analysed is a detail.
      if (result.mailNote) {
        toast({
          tone: "error",
          title: "Mailbox could not be read",
          description: result.mailNote,
          key: "mail-sync",
        });
        return;
      }

      // One key for the whole operation, so pressing Sync repeatedly replaces
      // the last result rather than stacking identical notices.
      if (result.note) {
        toast({
          tone: "error",
          title: "Inbox not fully analysed",
          description: result.note,
          key: "mail-sync",
        });
      } else if (
        result.retrieved > 0 ||
        result.analysed > 0 ||
        result.drafted > 0
      ) {
        const parts: string[] = [];
        if (result.retrieved > 0) {
          parts.push(
            `retrieved ${result.retrieved} new ${result.retrieved === 1 ? "message" : "messages"}`,
          );
        }
        if (result.analysed > 0) {
          parts.push(
            `analysed ${result.analysed} ${result.analysed === 1 ? "message" : "messages"}`,
          );
        }
        if (result.drafted > 0) {
          parts.push(
            `wrote ${result.drafted} suggested ${result.drafted === 1 ? "reply" : "replies"}`,
          );
        }

        toast({
          tone: "info",
          title: `Inbox updated — ${parts.join(", ")}`,
          description:
            result.draftsPending > 0
              ? `${result.draftsPending} still to draft; press Sync again to continue.`
              : "Priorities, summaries, deadlines and suggested replies are current.",
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
      <MailHeader
        syncing={syncing || analysing}
        onSync={handleSync}
        mailboxConnected={connected}
        mailbox={mailbox}
      />

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
