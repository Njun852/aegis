/**
 * Indexes Ask AEGIS relies on, kept in one place so `scripts/seed.ts` (a fresh
 * database) and `scripts/ask-check.ts` (an existing one) create the same set.
 */
export interface AskIndex {
  collection: "askLog";
  keys: Record<string, 1 | -1>;
  options?: { unique?: boolean };
}

export const ASK_INDEXES: AskIndex[] = [
  // The daily question limit counts by this.
  { collection: "askLog", keys: { businessId: 1, createdAt: -1 } },
];
