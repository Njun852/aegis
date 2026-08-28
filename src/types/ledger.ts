/**
 * Which module produced an entry. The dashboard totals over the ledger rather
 * than over any one module, so revenue is correct for whatever combination of
 * modules a business has switched on.
 */
export type LedgerSource = "bookings" | "inventory" | "crm" | "manual";

/**
 * `recognised` counts toward revenue. `void` is kept rather than deleted so a
 * cancelled sale leaves an audit trail instead of vanishing.
 */
export type LedgerStatus = "recognised" | "void";

export interface LedgerEntryDocument {
  businessId: string;
  source: LedgerSource;
  /** The originating record, e.g. a booking ref. Unique per source per tenant. */
  sourceRef: string;
  /** When the revenue belongs, not when the row was written. */
  occurredAt: Date;
  amountCents: number;
  status: LedgerStatus;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface LedgerEntry {
  source: LedgerSource;
  sourceRef: string;
  occurredAt: string;
  amountCents: number;
  status: LedgerStatus;
  description: string;
}

/** One calendar month of recognised revenue. */
export interface RevenueMonthBucket {
  /** Start of the month, ISO. */
  monthIso: string;
  /** "Aug" */
  label: string;
  totalCents: number;
}
