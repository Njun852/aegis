"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import type { SyncAdsState } from "@/app/actions/ads";
import { useAutoSync } from "@/hooks/use-auto-sync";
import { ADS_SYNC_EVERY_MS, MAIL_SYNC_EVERY_MS } from "@/lib/auto-sync";
import { useSync } from "./sync-provider";
import { useToast } from "./toast-provider";

/**
 * The syncs that used to wait for a "Sync now" button: the mailbox every two
 * minutes and the Meta ad account every five, for the active business, from
 * whichever screen is open. Mounted once in the shell, so every screen that
 * shows mail or ad figures (the sidebar badge, the top bar, Dashboard, Owner
 * Board, Mail, Ads) stays current without anyone pressing anything.
 *
 * It speaks only when there is something to say. New mail is announced; a
 * failure is announced once, when it starts, rather than every turn it
 * persists, and the screens themselves say what state the connection is in.
 * A quiet turn changes nothing and refreshes nothing.
 */
export function AutoSync() {
  const router = useRouter();
  const toast = useToast();
  const { sync } = useSync();
  const problems = useRef({ mail: null as string | null, ads: null as string | null, truncated: false });

  useAutoSync(async () => {
    const result = await sync();
    if (!result) return;

    // A mailbox failure outranks anything the analysis has to say: if mail
    // could not be retrieved, what was or was not analysed is a detail.
    const problem = result.mailNote ?? result.note;
    if (problem && problem !== problems.current.mail) {
      toast({
        tone: "error",
        title: result.mailNote ? "Mailbox could not be read" : "Inbox not fully analysed",
        description: `${problem} AEGIS will keep trying every 2 minutes.`,
        key: "mail-sync",
      });
    }
    problems.current.mail = problem;

    if (result.retrieved > 0) {
      const count = `${result.retrieved} new ${result.retrieved === 1 ? "email" : "emails"}`;
      toast({
        tone: "info",
        title: count,
        description:
          result.analysed > 0
            ? "Retrieved and sorted by priority, with summaries. Open Mail to read them."
            : "Retrieved from the mailbox. Open Mail to read them.",
        key: "mail-sync",
      });
    }

    if (result.retrieved > 0 || result.analysed > 0 || result.drafted > 0) {
      router.refresh();
    }
  }, MAIL_SYNC_EVERY_MS);

  useAutoSync(async () => {
    let result: SyncAdsState;
    try {
      const response = await fetch("/api/sync/ads", { method: "POST" });
      if (!response.ok) return;
      result = (await response.json()) as SyncAdsState;
    } catch {
      return;
    }

    // No Meta account linked, or read by another tab moments ago.
    if (!result.connected || result.retryInSeconds !== null) return;

    if (result.error) {
      if (result.error !== problems.current.ads) {
        toast({
          tone: "error",
          title: "Meta sync failed",
          description: `${result.error} The figures shown are from the last successful sync. AEGIS will try again in 5 minutes.`,
          key: "ads-sync",
        });
      }
      problems.current.ads = result.error;
      router.refresh();
      return;
    }
    problems.current.ads = null;

    if (result.truncated && !problems.current.truncated) {
      toast({
        tone: "info",
        title: `Synced ${result.rows} rows from Meta`,
        description: "The account is larger than one sync reads, so some rows may be missing.",
        key: "ads-sync",
      });
    }
    problems.current.truncated = result.truncated;
    router.refresh();
  }, ADS_SYNC_EVERY_MS);

  return null;
}
