"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { generateDailyReportAction, generateInsightAction } from "@/app/actions/ai";
import { InsightPanel } from "@/components/ui";
import { useTypewriter } from "@/hooks/use-typewriter";
import { dailyReportFootnote, type DailyReportView } from "@/lib/daily-report";
import { REPORT_RANGE_SLUGS } from "@/lib/report";
import type { DateRange } from "@/types";
import { useDashboardRange } from "./dashboard-range-provider";

export interface AiInsightsCardProps {
  /**
   * Insights already generated for the current figures, read from the cache
   * during render. A hit here populates the card with no request at all.
   */
  cached: Partial<Record<DateRange, string>>;
  /** The latest daily report written today, if anyone has opened it today. */
  cachedDaily: DailyReportView | null;
  /** Whether the install has a key. False means the card never calls out. */
  aiEnabled: boolean;
}

type View = "period" | "daily";

/**
 * The dashboard's AI commentary: on the period being looked at, or the daily
 * report on today so far.
 *
 * Spend behaviour, which is the whole design of this component:
 *
 * - no key — the sample copy renders and nothing is ever requested;
 * - cache hit — the stored text renders, again with no request;
 * - cache miss — exactly one request, for one range, and only for a range
 *   someone actually looked at. The answer is keyed on the figures, so it is
 *   reused until the numbers themselves move.
 * - the daily report — the latest one shows at once when its tab is opened,
 *   and the server is asked once per visit whether it is due a refresh: at
 *   most once an hour, and only when today's figures have moved.
 *
 * While a request is in flight the panel shows a skeleton rather than the
 * sample copy, so nobody reads a sentence that is about to be replaced. A
 * freshly generated insight is then revealed progressively; a cached one
 * appears whole, because it was not written in front of anyone.
 */
export function AiInsightsCard({ cached, cachedDaily, aiEnabled }: AiInsightsCardProps) {
  const router = useRouter();
  const { range } = useDashboardRange();
  // The daily report opens first; the period commentary is one click away,
  // and is only requested once someone opens it.
  const [view, setView] = useState<View>("daily");
  const [generated, setGenerated] =
    useState<Partial<Record<DateRange, string>>>(cached);
  const [failed, setFailed] = useState<Partial<Record<DateRange, true>>>({});
  const [daily, setDaily] = useState<DailyReportView | null>(cachedDaily);
  const [dailyNote, setDailyNote] = useState<string | null>(null);
  const [dailyChecked, setDailyChecked] = useState(false);

  // One request per range for this mount, kept across effect runs: switching
  // back and forth cannot fire a second one, and React's second run of the
  // effect in development listens to the same request instead of dropping it.
  const requests = useRef(new Map<DateRange, ReturnType<typeof generateInsightAction>>());
  const dailyRequest = useRef<ReturnType<typeof generateDailyReportAction> | null>(null);

  useEffect(() => {
    if (view !== "period" || !aiEnabled || generated[range] || failed[range]) return;

    let live = true;
    let request = requests.current.get(range);
    if (!request) {
      request = generateInsightAction(range);
      requests.current.set(range, request);
    }

    request
      .then((result) => {
        if (!live) return;
        const text = result.text;
        if (text) setGenerated((current) => ({ ...current, [range]: text }));
        else setFailed((current) => ({ ...current, [range]: true }));
      })
      .catch(() => {
        // The reason is already in the usage log.
        if (live) setFailed((current) => ({ ...current, [range]: true }));
      });

    return () => {
      live = false;
    };
  }, [aiEnabled, generated, failed, range, view]);

  useEffect(() => {
    if (view !== "daily" || !aiEnabled || dailyChecked) return;

    let live = true;
    // Asked even when a report is showing: the server returns the same one
    // unless it is over an hour old and the figures have moved.
    dailyRequest.current ??= generateDailyReportAction();
    dailyRequest.current
      .then((result) => {
        if (!live) return;
        setDailyChecked(true);
        if (result.text && result.at) setDaily({ text: result.text, at: result.at });
        else setDailyNote(result.note ?? "No daily report was written.");
      })
      .catch(() => {
        if (!live) return;
        setDailyChecked(true);
        setDailyNote("The daily report could not be written just now.");
      });

    return () => {
      live = false;
    };
  }, [aiEnabled, dailyChecked, view]);

  // Waiting on this view's request: no commentary and no failure yet.
  const pending =
    aiEnabled &&
    (view === "period" ? !generated[range] && !failed[range] : !daily && !dailyNote);

  const text = view === "period" ? (generated[range] ?? null) : (daily?.text ?? null);
  const { shown } = useTypewriter(text, {
    animate: text !== null && text !== (view === "period" ? cached[range] : cachedDaily?.text),
  });

  const placeholder = !aiEnabled
    ? "AI commentary is switched off on this server."
    : view === "period"
      ? "Commentary on this period's figures appears here once it has been written."
      : (dailyNote ?? "Today's report appears here once it has been written.");

  return (
    <InsightPanel
      title="AI Insights"
      views={{
        options: [
          { id: "period", label: range },
          { id: "daily", label: "Daily report" },
        ],
        value: view,
        onChange: (next) => setView(next === "daily" ? "daily" : "period"),
      }}
      body={shown || placeholder}
      footnote={view === "daily" && daily && shown ? dailyReportFootnote(daily.at) : undefined}
      loading={pending}
      action="View Full Report"
      // The report opens for the range being looked at, so its revenue total
      // is the one on the tile above.
      onAction={() => router.push(`/dashboard/report?range=${REPORT_RANGE_SLUGS[range]}`)}
    />
  );
}
