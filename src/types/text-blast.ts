/**
 * Text Blast: automatic SMS reminders to customers whose car is due for
 * service. No SMS provider is connected yet, so a message is `queued` and says
 * so; nothing here may read as delivered until a provider reports it.
 */

export type SmsStatus = "queued" | "sent" | "failed" | "expired";

/** Why a text exists: the automatic sweep, or a person pressing "Send reminder". */
export type SmsKind = "service-due" | "manual";

/** Per-business settings, stored on the business record. */
export interface TextBlastConfig {
  /** The automatic sweep runs for this business only while this is true. */
  enabled: boolean;
  template: string;
  /** Days before the due date to send. 0 sends on the day it falls due. */
  leadDays: number;
  updatedAt: Date;
  /** When the sweep last ran for this business, and what it did, in words. */
  lastRunAt?: Date | null;
  lastRunNote?: string | null;
}

/** The same, as the screen receives it. */
export interface TextBlastSettings {
  enabled: boolean;
  template: string;
  leadDays: number;
  /** ISO 8601. */
  lastRunAt: string | null;
  lastRunNote: string | null;
}

/** Stored shape. One document per text. */
export interface SmsMessageDocument {
  businessId: string;
  ref: string;
  kind: SmsKind;
  vehicleRef: string;
  customerRef: string;
  /** E.164, "+639171234567". */
  to: string;
  body: string;
  /** How many SMS parts the body takes, which is what a provider bills. */
  segments: number;
  /**
   * The due date this reminder is for, "2026-10-02". With `vehicleRef` it is
   * unique, which is what holds a car to one reminder per due date however
   * often the sweep runs.
   */
  dueKey: string;
  status: SmsStatus;
  /** Why it is in this state, in words: "No SMS provider connected". */
  statusNote: string;
  provider: string | null;
  providerMessageId: string | null;
  createdAt: Date;
  sentAt: Date | null;
}

export interface SmsMessage {
  ref: string;
  kind: SmsKind;
  vehicleRef: string;
  customerRef: string;
  to: string;
  body: string;
  segments: number;
  dueKey: string;
  status: SmsStatus;
  statusNote: string;
  /** "Oct 2 · 09:15" */
  created: string;
  /** "Oct 2 · 09:16", or null while not sent. */
  sent: string | null;
}

/** What the sweep will do, or has done, about one car. */
export type ReminderOutcome =
  /** Due and eligible: the next sweep in sending hours writes the text. */
  | { kind: "send"; dueKey: string }
  /** Not yet due. `sendOn` is the day the text will be written. */
  | { kind: "wait"; dueKey: string; sendOn: string }
  /** A text for this due date already exists. */
  | { kind: "done"; dueKey: string; status: SmsStatus }
  | { kind: "skip"; reason: SkipReason; dueKey: string | null };

export type SkipReason =
  | "no-history"
  | "no-mobile"
  | "opted-out"
  /** Overdue for longer than the catch-up window, so not texted automatically. */
  | "too-old";

/** One row of the Upcoming list. */
export interface ReminderRow {
  vehicleRef: string;
  plate: string;
  vehicle: string;
  customerRef: string;
  ownerName: string;
  ownerPhone: string;
  optedOut: boolean;
  /** "Oct 2, 2026", or null with no service on record. */
  dueDay: string | null;
  outcome: ReminderOutcome;
  /** The text as it would read for this car, for the preview. */
  preview: string;
}

/** What one run of the sweep did. */
export interface SweepResult {
  /** False when the business is not set up to run: why is in `note`. */
  ran: boolean;
  created: number;
  sent: number;
  failed: number;
  expired: number;
  note: string;
}
