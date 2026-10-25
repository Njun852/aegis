import { Badge } from "@/components/ui";
import type { IntakeItem } from "@/types";

/** Where an upload stands in the Review Queue. */
export function StatusBadge({ item }: { item: IntakeItem }) {
  if (item.status === "posted") return <Badge tone="positive">Posted</Badge>;
  if (item.status === "discarded") return <Badge tone="neutral">Discarded</Badge>;
  if (item.status === "posting") return <Badge tone="accent">Posting…</Badge>;
  if (item.status === "unread") return <Badge tone="negative">Not read</Badge>;
  return item.reviewReasons.length > 0 ? <Badge tone="warning">Needs review</Badge> : <Badge tone="accent">Ready to post</Badge>;
}
