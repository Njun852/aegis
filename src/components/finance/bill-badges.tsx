import { Badge, type BadgeTone } from "@/components/ui";
import { AP_STATUS_GROUPS } from "@/lib/finance";
import type { ApStatusGroup, BillPayState } from "@/types";

const GROUP_TONE: Record<ApStatusGroup, BadgeTone> = {
  "critical-overdue": "negative",
  overdue: "negative",
  "due-today": "warning",
  "due-7": "warning",
  "due-30": "info",
  "due-later": "neutral",
};

const STATE_TONE: Record<BillPayState, BadgeTone> = {
  Unpaid: "neutral",
  "Part paid": "info",
  Paid: "positive",
  Void: "neutral",
};

export function groupTone(group: ApStatusGroup): BadgeTone {
  return GROUP_TONE[group];
}

export function GroupBadge({ group }: { group: ApStatusGroup }) {
  return <Badge tone={GROUP_TONE[group]}>{AP_STATUS_GROUPS.find((entry) => entry.key === group)?.label}</Badge>;
}

export function StateBadge({ state }: { state: BillPayState }) {
  return <Badge tone={STATE_TONE[state]}>{state}</Badge>;
}
