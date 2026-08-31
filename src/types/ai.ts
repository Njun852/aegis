import type { MailCategory, MailPriority } from "./mail";

/**
 * Which surface a generation belongs to. Also partitions the cache and the
 * usage log, so cost is attributable per feature as well as per business.
 */
export type AiKind =
  | "dashboard-insight"
  | "ads-insight"
  | "mail-triage"
  | "compose-draft";

/**
 * Why a generation did not produce text. Every one of these is a normal
 * outcome the UI renders around — none of them is an exception to throw.
 */
export type AiFailure =
  | "not-configured"
  | "over-budget"
  | "timeout"
  | "rate-limited"
  | "unusable"
  | "error";

export type AiResult<T> =
  | { ok: true; data: T; cached: boolean }
  | { ok: false; reason: AiFailure };

/**
 * A cached generation. `cacheKey` is a hash of the exact model inputs, so
 * identical inputs are never paid for twice; `promptVersion` invalidates the
 * whole partition when a prompt is rewritten.
 */
export interface AiOutputDocument {
  businessId: string;
  kind: AiKind;
  cacheKey: string;
  promptVersion: number;
  payload: unknown;
  model: string;
  createdAt: Date;
}

/**
 * One billable call. Written whatever the outcome — a call that failed after
 * the model produced tokens still cost money, and a spend investigation that
 * only sees successes is worse than useless.
 */
export interface AiUsageDocument {
  businessId: string;
  kind: AiKind;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  outcome: "ok" | AiFailure;
  /** "2026-08". Makes the monthly cap a single indexed equality match. */
  period: string;
  createdAt: Date;
}

/** What the mail triage model returns for one message, after validation. */
export interface MailTriageResult {
  id: string;
  priority: MailPriority;
  category: MailCategory;
  summary: string;
  actionItems: string[];
  replies: string[];
  /** A deadline stated in the email, as written. `null` when none is stated. */
  deadline: string | null;
  needsApproval: boolean;
  approvalReason: string;
}
