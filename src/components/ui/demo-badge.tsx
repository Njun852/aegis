import type { CSSProperties } from "react";
import { Badge } from "./badge";

export interface DemoBadgeProps {
  /** Tighter padding for use inline beside a stat label. */
  compact?: boolean;
  style?: CSSProperties;
}

/**
 * Marks a figure that has no data source yet, so a sample number can never be
 * read as a real operating result.
 *
 * Deliberately one component rather than a pill spelled out per card: when a
 * figure becomes real the change is deleting one `demo` flag, and finding every
 * sample figure that is left is a single grep for `DemoBadge`.
 */
export function DemoBadge({ compact, style }: DemoBadgeProps) {
  return (
    <span
      // `title` rather than a custom tooltip: it needs to work on a static
      // server-rendered card, and this is a label nobody hovers twice.
      title="Sample figure — this number has no data source yet and is not a real operating result."
      style={{ display: "inline-flex", flexShrink: 0 }}
    >
      <Badge
        tone="warning"
        pill={false}
        style={{
          padding: compact ? "1px 5px" : "2px 7px",
          fontSize: "9.5px",
          lineHeight: "14px",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          ...style,
        }}
      >
        Demo data
      </Badge>
    </span>
  );
}
