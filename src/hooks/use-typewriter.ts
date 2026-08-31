"use client";

import { useEffect, useState } from "react";

export interface TypewriterOptions {
  /** Set false to show the text whole — e.g. for content read from cache. */
  animate?: boolean;
  /** Roughly how long the whole reveal should take, in milliseconds. */
  durationMs?: number;
}

export interface TypewriterResult {
  shown: string;
  done: boolean;
}

/**
 * Reveals text progressively, the way a model appears to write it.
 *
 * This is a *reveal*, not a stream: the text has already arrived in full. That
 * is a deliberate trade. Real token streaming would show the first word sooner,
 * but these surfaces use structured JSON output — streaming them would paint
 * `{"insight":"…` across the card — and the responses are two or three
 * sentences that arrive in a second or two anyway. A skeleton while the request
 * is in flight, then a reveal, reads identically and keeps the schema
 * guarantees, the caching and the single spend path intact.
 *
 * Respects `prefers-reduced-motion`: text appears whole for anyone who has
 * asked for less movement.
 */
export function useTypewriter(
  text: string | null,
  { animate = true, durationMs = 900 }: TypewriterOptions = {},
): TypewriterResult {
  const target = text ?? "";
  const enabled = animate && target.length > 0;

  /**
   * Keyed by the text it belongs to, so a progress reading left over from the
   * previous string can never be sliced into the new one. State is only ever
   * written from inside an animation frame — never synchronously in the effect
   * body, which would cascade a render on every mount.
   */
  const [progress, setProgress] = useState<{
    key: string;
    upto: number;
  } | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const reduced =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    // Driven from the clock rather than a per-character timer, so the reveal
    // takes the same time whatever the frame rate and however long the text is.
    const startedAt = performance.now();
    let frame = 0;

    const step = () => {
      const ratio = reduced
        ? 1
        : Math.min(1, (performance.now() - startedAt) / durationMs);

      setProgress({ key: target, upto: Math.ceil(target.length * ratio) });
      if (ratio < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [enabled, target, durationMs]);

  if (!enabled) return { shown: target, done: true };

  const upto = progress?.key === target ? progress.upto : 0;
  return { shown: target.slice(0, upto), done: upto >= target.length };
}
