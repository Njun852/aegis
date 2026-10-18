/**
 * The Finance screen's tabs. A plain module, not a client component, because
 * the page (a server component) needs the list itself to decide which tab a
 * person may open; exports of a "use client" file reach the server only as
 * references.
 */
export type FinanceTab = "overview" | "income" | "standing" | "accounts" | "receivables" | "payables";

/**
 * The owner's three (overview and the two reports) come first and are for
 * administrators; the working tabs where records are entered follow.
 */
export const FINANCE_TABS: { id: FinanceTab; label: string; icon: string; adminOnly: boolean }[] = [
  { id: "overview", label: "Overview", icon: "layout-dashboard", adminOnly: true },
  { id: "income", label: "Income", icon: "trending-up", adminOnly: true },
  { id: "standing", label: "Standing", icon: "gauge", adminOnly: true },
  { id: "accounts", label: "Accounts", icon: "wallet", adminOnly: false },
  { id: "receivables", label: "Receivables", icon: "inbox", adminOnly: false },
  { id: "payables", label: "Payables", icon: "file-text", adminOnly: false },
];

/** The tab a bare /finance opens: the owner's screen, or Accounts for a member. */
export function defaultFinanceTab(isAdmin: boolean): FinanceTab {
  return isAdmin ? "overview" : "accounts";
}
