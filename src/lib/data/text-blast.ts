/**
 * Indexes Text Blast relies on, kept in one place so `scripts/seed.ts` (a fresh
 * database) and `scripts/text-blast-check.ts` (an existing one) create the same
 * set.
 */
export interface TextBlastIndex {
  collection: "smsMessages";
  keys: Record<string, 1 | -1>;
  options?: { unique?: boolean };
}

export const TEXT_BLAST_INDEXES: TextBlastIndex[] = [
  { collection: "smsMessages", keys: { businessId: 1, ref: 1 }, options: { unique: true } },
  // The rule that makes automatic sending safe: one text per car per due date,
  // however many times, or from however many places, the sweep runs.
  {
    collection: "smsMessages",
    keys: { businessId: 1, vehicleRef: 1, dueKey: 1 },
    options: { unique: true },
  },
  { collection: "smsMessages", keys: { businessId: 1, status: 1, createdAt: -1 } },
];
