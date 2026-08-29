"use client";

import { useEffect, useRef, useState } from "react";
import { generateInsightAction } from "@/app/actions/ai";
import { InsightPanel } from "@/components/ui";
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
 * The card never blocks the dashboard: the sample copy is on screen from the
 * first paint and is replaced in place when the real one arrives.
 */
export function AiInsightsCard({ cached, aiEnabled }: AiInsightsCardProps) {
  const { range, data } = useDashboardRange();
  const [generated, setGenerated] =
    useState<Partial<Record<DateRange, string>>>(cached);

  // Ranges already asked about on this mount, so switching back and forth
  // cannot fire a second request for the same one.
  const requested = useRef(
    new Set<DateRange>(Object.keys(cached) as DateRange[]),
  );

  useEffect(() => {
    if (!aiEnabled || generated[range] || requested.current.has(range)) return;

    requested.current.add(range);
    let live = true;

    generateInsightAction(range)
      .then((result) => {
        const text = result.text;
        if (live && text) {
          setGenerated((current) => ({ ...current, [range]: text }));
        }
      })
      .catch(() => {
        // A failed generation leaves the sample copy in place; the reason is
        // already in the usage log.
      });

    return () => {
      live = false;
    };
  }, [aiEnabled, generated, range]);

  return (
    <InsightPanel
      title="AI Insights"
      body={generated[range] ?? data.insight}
      action="View Full Report"
    />
  );
}
