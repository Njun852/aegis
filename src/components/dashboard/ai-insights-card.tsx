"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { generateInsightAction } from "@/app/actions/ai";
import { InsightPanel } from "@/components/ui";
import { useTypewriter } from "@/hooks/use-typewriter";
import { REPORT_RANGE_SLUGS } from "@/lib/report";
import type { DateRange } from "@/types";
import { useDashboardRange } from "./dashboard-range-provider";

export interface AiInsightsCardProps {
  /**
   * Insights already generated for the current figures, read from the cache
   * during render. A hit here populates the card with no request at all.
   */
  cached: Partial<Record<DateRange, string>>;
  /** Whether the install has a key. False means the card never calls out. */
  aiEnabled: boolean;
}

/**
 * The dashboard's AI commentary.
 *
 * Spend behaviour, which is the whole design of this component:
 *
 * - no key — the sample copy renders and nothing is ever requested;
 * - cache hit — the stored text renders, again with no request;
 * - cache miss — exactly one request, for one range, and only for a range
 *   someone actually looked at. The answer is keyed on the figures, so it is
 *   reused until the numbers themselves move.
 *
 * While a request is in flight the panel shows a skeleton rather than the
 * sample copy, so nobody reads a sentence that is about to be replaced. A
 * freshly generated insight is then revealed progressively; a cached one
 * appears whole, because it was not written in front of anyone.
 */
export function AiInsightsCard({ cached, aiEnabled }: AiInsightsCardProps) {
  const router = useRouter();
  const { range } = useDashboardRange();
  const [generated, setGenerated] =
    useState<Partial<Record<DateRange, string>>>(cached);
  const [failed, setFailed] = useState<Partial<Record<DateRange, true>>>({});

  // One request per range for this mount, kept across effect runs: switching
  // back and forth cannot fire a second one, and React's second run of the
  // effect in development listens to the same request instead of dropping it.
  const requests = useRef(new Map<DateRange, ReturnType<typeof generateInsightAction>>());

  useEffect(() => {
    if (!aiEnabled || generated[range] || failed[range]) return;

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
  }, [aiEnabled, generated, failed, range]);

  // Waiting on this range's request: no commentary and no failure yet.
  const pending = aiEnabled && !generated[range] && !failed[range] ? range : null;

  const text = generated[range] ?? null;
  const { shown } = useTypewriter(text, {
    animate: text !== null && text !== cached[range],
  });

  return (
    <InsightPanel
      title="AI Insights"
      body={
        shown ||
        (aiEnabled
          ? "Commentary on this period's figures appears here once it has been written."
          : "AI commentary is switched off on this server.")
      }
      loading={pending === range}
      action="View Full Report"
      // The report opens for the range being looked at, so its revenue total
      // is the one on the tile above.
      onAction={() => router.push(`/dashboard/report?range=${REPORT_RANGE_SLUGS[range]}`)}
    />
  );
}
