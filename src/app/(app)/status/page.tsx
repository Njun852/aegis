import type { Metadata } from "next";
import { StatusBoard } from "@/components/status/status-board";
import { requireAdmin } from "@/lib/dal/session";
import { readSystemStatus } from "@/lib/dal/status";

export const metadata: Metadata = {
  title: "System Status · AEGIS AI",
  description:
    "Mail, OpenAI, database and Meta connection states, data freshness and recent failures.",
};

/** Never served from a cache — a cached status page proves nothing. */
export const dynamic = "force-dynamic";

export default async function StatusPage() {
  // The sidebar hides this route for members, but hiding a link is not access
  // control — this is the check that matters.
  await requireAdmin();

  const status = await readSystemStatus();
  return <StatusBoard status={status} />;
}
