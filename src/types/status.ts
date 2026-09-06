/**
 * The system-status screen's vocabulary.
 *
 * The four state words are the ones the acceptance checklist asks for, spelled
 * exactly as it spells them, so what the owner reads on screen and what they
 * read on the checklist are the same word.
 */
export type IntegrationState = "ONLINE" | "DISCONNECTED" | "ERROR" | "STALE";

export type IntegrationKey = "mail" | "openai" | "database" | "meta";

/** One label/value pair beneath an integration's headline state. */
export interface StatusFact {
  label: string;
  value: string;
}

export interface IntegrationStatus {
  key: IntegrationKey;
  label: string;
  state: IntegrationState;
  /** One sentence the owner can act on, without opening a log. */
  detail: string;
  facts: StatusFact[];
}

/** A recorded failure, as the status screen lists it. */
export interface StatusFailure {
  /** ISO 8601. */
  at: string;
  surface: string;
  outcome: string;
  detail: string;
}

export interface SystemStatus {
  integrations: IntegrationStatus[];
  /** Most recent first. Empty is a good result, and says so on screen. */
  failures: StatusFailure[];
  /** ISO 8601 — when these readings were taken. */
  checkedAt: string;
}
