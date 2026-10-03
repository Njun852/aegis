import { isPhilippineMobile, manilaDateKey } from "@/lib/booking-slots";
import { phoneKey } from "@/lib/crm";
import { addMonths } from "@/lib/fleet";
import type { ReminderOutcome, SkipReason } from "@/types";

/**
 * The rules of Text Blast, kept pure so the sweep, the screen and
 * `scripts/text-blast-check.ts` all apply exactly the same ones.
 *
 * Sending is automatic, so these rules are what stand between "a reminder when
 * the car is due" and a surprise mass-text: one text per car per due date, only
 * near the due date, only in the daytime, never to someone who opted out.
 */

/** Days after a due date a reminder is still worth sending on its own. */
export const CATCH_UP_DAYS = 30;
/** A queued text not sent within this many days is retired, never sent late. */
export const QUEUE_EXPIRY_DAYS = 14;
export const MAX_LEAD_DAYS = 30;
/** Texts are written from 9:00 up to 18:00, Manila time. */
export const SENDING_HOURS = { from: 9, to: 18 };
export const MAX_TEMPLATE_LENGTH = 480;

export const PLACEHOLDERS = ["name", "vehicle", "plate", "due", "business", "link"] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];

export const DEFAULT_TEMPLATE_WITH_LINK =
  "Hi {name}, your {vehicle} ({plate}) is due for service. Book at {link} or call us. {business}";
export const DEFAULT_TEMPLATE =
  "Hi {name}, your {vehicle} ({plate}) is due for service. Call us to book your visit. {business}";

/** The template in force: the saved one, or the default that suits the business. */
export function effectiveTemplate(saved: string | null | undefined, hasLink: boolean): string {
  const trimmed = saved?.trim();
  if (trimmed) return trimmed;
  return hasLink ? DEFAULT_TEMPLATE_WITH_LINK : DEFAULT_TEMPLATE;
}

/** Placeholders in a template that Text Blast does not know, e.g. a typo. */
export function unknownPlaceholders(template: string): string[] {
  const found = [...template.matchAll(/\{([^{}]*)\}/g)].map((match) => match[1]);
  return [...new Set(found.filter((name) => !PLACEHOLDERS.includes(name as Placeholder)))];
}

/**
 * Fills a template. A placeholder with nothing to put in it (no booking link)
 * is removed, and the doubled space it leaves is closed up.
 */
export function renderTemplate(template: string, values: Record<Placeholder, string>): string {
  return template
    .replace(/\{([a-z]+)\}/g, (whole, name: string) =>
      PLACEHOLDERS.includes(name as Placeholder) ? values[name as Placeholder] : whole,
    )
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ ([.,!?])/g, "$1")
    .trim();
}

/** Every character of the GSM 7-bit default alphabet; the last few count double. */
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = "^{}\\[~]|€";

/**
 * How many SMS parts a text takes, which is what a provider bills. Plain text
 * fits 160 characters in one part, 153 each once it is split; any character
 * outside the GSM alphabet (an emoji, a curly quote) drops that to 70 and 67.
 */
export function countSegments(body: string): { segments: number; characters: number; unicode: boolean } {
  const chars = [...body];
  const unicode = chars.some((char) => !GSM_BASIC.includes(char) && !GSM_EXTENDED.includes(char));

  if (unicode) {
    // UTF-16 code units are what the limit counts, so an emoji is two.
    const units = body.length;
    return { segments: units === 0 ? 0 : units <= 70 ? 1 : Math.ceil(units / 67), characters: units, unicode };
  }

  const septets = chars.reduce((sum, char) => sum + (GSM_EXTENDED.includes(char) ? 2 : 1), 0);
  return {
    segments: septets === 0 ? 0 : septets <= 160 ? 1 : Math.ceil(septets / 153),
    characters: septets,
    unicode,
  };
}

/** "0917 123 4567" → "+639171234567", the form a provider is given. */
export function toE164(mobile: string): string | null {
  if (!isPhilippineMobile(mobile)) return null;
  return `+63${phoneKey(mobile).slice(1)}`;
}

/** Whether a text may be written now: daytime in Manila, any day of the week. */
export function isSendingHour(now: Date): boolean {
  const hour = new Date(now.getTime() + 8 * 3_600_000).getUTCHours();
  return hour >= SENDING_HOURS.from && hour < SENDING_HOURS.to;
}

/** Whole days from one calendar day to another; negative when `to` is earlier. */
export function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86_400_000);
}

function shiftKey(dateKey: string, days: number): string {
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export interface ReminderInput {
  /** The car's latest service, or null with none on record. */
  lastServiceAt: Date | null;
  intervalMonths: number;
  /** The owner's number as typed, or "" with no owner on file. */
  ownerPhone: string;
  ownerOptedOut: boolean;
  leadDays: number;
}

/**
 * What should happen about one car today. The due date is the last service
 * plus the car's own interval in months (six by default), the same date Fleet
 * shows; the reminder goes `leadDays` before it.
 *
 * Checked in this order: nothing to remind about, then the customer's wishes,
 * then whether there is a number to text, then the calendar. So a row always
 * shows the reason a person could act on first.
 */
export function reminderDecision(input: ReminderInput, now: Date): ReminderOutcome {
  if (!input.lastServiceAt) return { kind: "skip", reason: "no-history", dueKey: null };

  const dueKey = manilaDateKey(addMonths(input.lastServiceAt, input.intervalMonths));
  const skip = (reason: SkipReason): ReminderOutcome => ({ kind: "skip", reason, dueKey });

  if (input.ownerOptedOut) return skip("opted-out");
  if (!isPhilippineMobile(input.ownerPhone)) return skip("no-mobile");

  const today = manilaDateKey(now);
  const sendOn = shiftKey(dueKey, -input.leadDays);
  if (today < sendOn) return { kind: "wait", dueKey, sendOn };

  // Long overdue: texting now would be a blast about something months old.
  if (daysBetween(dueKey, today) > CATCH_UP_DAYS) return skip("too-old");

  return { kind: "send", dueKey };
}

export interface ReminderStatus {
  /** One or two words: the state the reminder is in. */
  label: string;
  /** One sentence saying why, or what happens next. */
  detail: string;
  tone: "neutral" | "accent" | "positive" | "warning" | "negative";
  icon: string;
  /** Whether a person may write this reminder themselves. */
  canSendByHand: boolean;
}

/**
 * How a car's reminder reads on the screen: a short status and one plain
 * sentence. Every row answers the same two questions, "has this customer been
 * texted?" and "if not, why not, or when?", without the words the sweep uses
 * for itself (queued, skipped, next run).
 */
export function describeReminder(
  outcome: ReminderOutcome,
  { automatic, providerConnected }: { automatic: boolean; providerConnected: boolean },
): ReminderStatus {
  if (outcome.kind === "done") {
    const service = `the ${formatKey(outcome.dueKey)} service`;
    switch (outcome.status) {
      case "sent":
        return { label: "Sent", detail: `Reminder sent for ${service}.`, tone: "positive", icon: "check", canSendByHand: false };
      case "queued":
        return {
          label: "Not sent yet",
          detail: providerConnected
            ? "The text is written and goes out on the next check."
            : "The text is written, but no SMS provider is connected to send it.",
          tone: "warning",
          icon: "clock",
          canSendByHand: false,
        };
      case "failed":
        return { label: "Failed to send", detail: "The provider refused it. The reason is in the Outbox.", tone: "negative", icon: "circle-alert", canSendByHand: false };
      case "expired":
        return { label: "Never sent", detail: `The text for ${service} waited more than ${QUEUE_EXPIRY_DAYS} days and was dropped.`, tone: "neutral", icon: "minus", canSendByHand: false };
    }
  }

  if (outcome.kind === "send") {
    return automatic
      ? { label: "Due now", detail: "A text will be written within 15 minutes, between 9 AM and 6 PM.", tone: "accent", icon: "send", canSendByHand: false }
      : { label: "Due now", detail: "Not texted: automatic reminders are off.", tone: "warning", icon: "alert-triangle", canSendByHand: true };
  }

  if (outcome.kind === "wait") {
    return automatic
      ? { label: "Scheduled", detail: `Will be texted on ${formatKey(outcome.sendOn)}.`, tone: "neutral", icon: "calendar", canSendByHand: false }
      : { label: "Not due yet", detail: `Due ${formatKey(outcome.dueKey)}. Automatic reminders are off.`, tone: "neutral", icon: "calendar", canSendByHand: false };
  }

  switch (outcome.reason) {
    case "too-old":
      return {
        label: "Overdue",
        detail: `More than ${CATCH_UP_DAYS} days overdue, so not texted automatically.`,
        tone: "warning",
        icon: "alert-triangle",
        canSendByHand: true,
      };
    case "opted-out":
      return { label: "Won't be texted", detail: "Reminders are switched off for this customer.", tone: "neutral", icon: "minus", canSendByHand: false };
    case "no-mobile":
      return { label: "Won't be texted", detail: "The owner has no mobile number on file.", tone: "neutral", icon: "minus", canSendByHand: false };
    case "no-history":
      return { label: "Won't be texted", detail: "No service on record yet, so there is no due date.", tone: "neutral", icon: "minus", canSendByHand: false };
  }
}

/** "Oct 2, 2026" from a date key. */
export function formatKey(dateKey: string): string {
  return new Date(`${dateKey}T12:00:00+08:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  });
}
