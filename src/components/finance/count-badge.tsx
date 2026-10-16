import { Badge } from "@/components/ui";
import { formatSignedMoney } from "@/lib/format";
import type { CountRow } from "@/types";

export function CountBadge({ status, differenceCents }: { status: CountRow["status"]; differenceCents: number }) {
  if (status === "matched") return <Badge tone="positive">Matched</Badge>;
  const amount = formatSignedMoney(differenceCents);
  if (status === "resolved") return <Badge tone="neutral">Explained {amount}</Badge>;
  return <Badge tone="negative">Off by {amount}</Badge>;
}
