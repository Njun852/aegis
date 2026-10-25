/**
 * The Finance screen's tabs. A plain module, not a client component, because
 * the page (a server component) needs the list itself to decide which tab a
 * person may open; exports of a "use client" file reach the server only as
 * references.
 */
export type FinanceTab = "overview" | "income" | "standing" | "reports" | "accounts" | "receivables" | "payables" | "intake";

/**
 * The owner's four (overview, the two live reports and the archive) come first and are for
 * administrators; the working tabs where records are entered follow.
 */
export const FINANCE_TABS: { id: FinanceTab; label: string; icon: string; adminOnly: boolean }[] = [
  { id: "overview", label: "Overview", icon: "layout-dashboard", adminOnly: true },
  { id: "income", label: "Income", icon: "trending-up", adminOnly: true },
  { id: "standing", label: "Standing", icon: "gauge", adminOnly: true },
  { id: "reports", label: "Reports", icon: "archive", adminOnly: true },
  { id: "accounts", label: "Accounts", icon: "wallet", adminOnly: false },
  { id: "receivables", label: "Receivables", icon: "inbox", adminOnly: false },
  { id: "payables", label: "Payables", icon: "file-text", adminOnly: false },
  // Photos and PDFs of invoices and receipts, read by AI and confirmed by a person.
  { id: "intake", label: "Review Queue", icon: "image", adminOnly: false },
];

/** The tab a bare /finance opens: the owner's screen, or Accounts for a member. */
export function defaultFinanceTab(isAdmin: boolean): FinanceTab {
  return isAdmin ? "overview" : "accounts";
}
