/**
 * Owner text alerts: short SMS to the business's own people when something
 * needs them, such as a quotation answered or a discount waiting for approval.
 * Set per business in Business Management. Not customer messaging; that is
 * Text Blast.
 */

/** The groups of events an owner can choose to be texted about. */
export type OwnerAlertGroup = "quotes" | "approvals" | "bookings" | "jobs";

export interface OwnerAlertRecipient {
  name: string;
  /** As typed, "0917 123 4567"; turned into E.164 only when a text goes out. */
  mobile: string;
}

/** Stored on the business record. Absent reads as switched off. */
export interface OwnerAlertConfig {
  enabled: boolean;
  recipients: OwnerAlertRecipient[];
  groups: OwnerAlertGroup[];
  /** Texts per business per day, across every recipient. Bounds what a provider bills. */
  dailyLimit: number;
}

/**
 * What happened to one text. "not-sent" is the honest state while no SMS
 * provider is connected: recorded, never delivered, and not retried later,
 * since an alert that arrives days late is noise.
 */
export type OwnerAlertStatus = "sent" | "failed" | "not-sent" | "skipped";

export interface OwnerAlertDocument {
  businessId: string;
  group: OwnerAlertGroup;
  /** One text per event per recipient: the same event raised twice is written once. */
  eventKey: string;
  to: string;
  recipientName: string;
  body: string;
  status: OwnerAlertStatus;
  /** Why it was not sent, in words a person can act on. */
  reason: string;
  provider: string | null;
  providerId: string | null;
  createdAt: Date;
}

/** One row of the panel's recent list. */
export interface OwnerAlertSummary {
  group: OwnerAlertGroup;
  recipientName: string;
  body: string;
  status: OwnerAlertStatus;
  reason: string;
  /** "Oct 15 · 09:12" */
  at: string;
}

/** What the admin panel needs. Holds no secrets: the provider's credentials live in the environment. */
export interface OwnerAlertPanelData {
  config: OwnerAlertConfig;
  /** Null while no SMS provider is connected. */
  provider: string | null;
  sentToday: number;
  recent: OwnerAlertSummary[];
}
