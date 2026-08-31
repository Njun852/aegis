"use client";

import { useEffect, useRef, useState } from "react";
import { generateInsightAction } from "@/app/actions/ai";
import { InsightPanel } from "@/components/ui";
import { useTypewriter } from "@/hooks/use-typewriter";
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
  const { range, data } = useDashboardRange();
  const [generated, setGenerated] =
    useState<Partial<Record<DateRange, string>>>(cached);
  const [pending, setPending] = useState<DateRange | null>(null);

  // Ranges already asked about on this mount, so switching back and forth
  // cannot fire a second request for the same one.
  const requested = useRef(
    new Set<DateRange>(Object.keys(cached) as DateRange[]),
  );

  useEffect(() => {
    if (!aiEnabled || generated[range] || requested.current.has(range)) return;

    requested.current.add(range);
    setPending(range);
    let live = true;

    generateInsightAction(range)
      .then((result) => {
        if (!live) return;
        const text = result.text;
        if (text) setGenerated((current) => ({ ...current, [range]: text }));
        setPending(null);
      })
      .catch(() => {
        // A failed generation falls back to the sample copy; the reason is
        // already in the usage log.
        if (live) setPending(null);
      });

    return () => {
      live = false;
    };
  }, [aiEnabled, generated, range]);

  const text = generated[range] ?? null;
  const { shown } = useTypewriter(text, {
    animate: text !== null && text !== cached[range],
  });

  return (
    <InsightPanel
      title="AI Insights"
      body={shown || data.insight}
      loading={pending === range}
      action="View Full Report"
    />
  );
}
