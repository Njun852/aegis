import type { Metadata } from "next";
import { OwnerBoardView } from "@/components/owner/owner-board";
import { loadOwnerBoard } from "@/lib/dal/owner-board";

export const metadata: Metadata = {
  title: "Owner board · AEGIS AI",
  description: "Every business on one screen: messages, bookings, jobs, finance, stock, ads and fleet, each item opening where it lives.",
};

/** Administrators only: `loadOwnerBoard` sends anyone else to their dashboard. */
export default async function OwnerBoardPage() {
  const board = await loadOwnerBoard();
  return <OwnerBoardView board={board} />;
}
