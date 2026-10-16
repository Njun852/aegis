/**
 * Indexes Finance relies on, kept in one place so `scripts/seed.ts` (a fresh
 * database) and `scripts/finance-check.ts` (an existing one) create the same
 * set. Several of them are the controls themselves, not just speed.
 */
export interface FinanceIndex {
  collection:
    | "moneyAccounts"
    | "invoices"
    | "bills"
    | "payments"
    | "reconciliations"
    | "financeReports"
    | "financeEvents";
  keys: Record<string, 1 | -1>;
  options?: { unique?: boolean; partialFilterExpression?: Record<string, unknown> };
}

export const FINANCE_INDEXES: FinanceIndex[] = [
  { collection: "moneyAccounts", keys: { businessId: 1, ref: 1 }, options: { unique: true } },
  // One record per real account, so the same money cannot be entered once as a
  // bank account and again as a passbook. Cash has no number and no key.
  {
    collection: "moneyAccounts",
    keys: { businessId: 1, accountKey: 1 },
    options: { unique: true, partialFilterExpression: { accountKey: { $type: "string" } } },
  },
  { collection: "invoices", keys: { businessId: 1, ref: 1 }, options: { unique: true } },
  // An invoice number is issued once.
  { collection: "invoices", keys: { businessId: 1, number: 1 }, options: { unique: true } },
  { collection: "invoices", keys: { businessId: 1, invoiceDate: 1 } },
  // One invoice per job order, so invoicing twice cannot record the sale twice.
  {
    collection: "invoices",
    keys: { businessId: 1, jobOrderRef: 1 },
    options: { unique: true, partialFilterExpression: { jobOrderRef: { $type: "string" } } },
  },
  { collection: "bills", keys: { businessId: 1, ref: 1 }, options: { unique: true } },
  { collection: "bills", keys: { businessId: 1, billDate: 1 } },
  { collection: "bills", keys: { businessId: 1, dueDate: 1 } },
  // One bill per supplier receipt, so a receipt's cost is counted once.
  {
    collection: "bills",
    keys: { businessId: 1, receiptRef: 1 },
    options: { unique: true, partialFilterExpression: { receiptRef: { $type: "string" } } },
  },
  { collection: "payments", keys: { businessId: 1, ref: 1 }, options: { unique: true } },
  { collection: "payments", keys: { businessId: 1, accountRef: 1, paidOn: 1 } },
  { collection: "payments", keys: { businessId: 1, invoiceRef: 1 } },
  { collection: "payments", keys: { businessId: 1, billRef: 1 } },
  { collection: "reconciliations", keys: { businessId: 1, ref: 1 }, options: { unique: true } },
  { collection: "reconciliations", keys: { businessId: 1, accountRef: 1, asOf: -1 } },
  // Each revision of each report is written once: the automatic close running
  // twice, or two corrections racing, cannot both write the same revision.
  {
    collection: "financeReports",
    keys: { businessId: 1, kind: 1, period: 1, revision: 1 },
    options: { unique: true },
  },
  { collection: "financeEvents", keys: { businessId: 1, at: -1 } },
];
