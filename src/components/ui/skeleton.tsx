import type { CSSProperties } from "react";

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: string;
  style?: CSSProperties;
}

/**
 * A shimmering placeholder for content that is on its way.
 *
 * The shimmer is a moving gradient rather than a pulse, because a pulse on a
 * card that already glows (the insight orb) reads as two things breathing out
 * of step. `prefers-reduced-motion` drops it to a flat block — see
 * `globals.css`.
 */
export function Skeleton({
  width = "100%",
  height = 12,
  radius = "var(--radius-xs)",
  style,
}: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className="aegis-skeleton"
      style={{
        display: "block",
        width,
        height,
        borderRadius: radius,
        ...style,
      }}
    />
  );
}

export interface SkeletonTextProps {
  /** Number of lines. The last one is rendered short, as real text ends. */
  lines?: number;
  lineHeight?: number;
  gap?: number;
  label?: string;
}

/** A paragraph-shaped skeleton, for prose that is being generated. */
export function SkeletonText({
  lines = 3,
  lineHeight = 11,
  gap = 8,
  label = "Generating",
}: SkeletonTextProps) {
  return (
    <span
      role="status"
      aria-label={label}
      style={{ display: "flex", flexDirection: "column", gap }}
    >
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          height={lineHeight}
          width={index === lines - 1 ? "62%" : "100%"}
        />
      ))}
    </span>
  );
}
