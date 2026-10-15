import { formatAmount } from "@/lib/quotations";
import { countSegments } from "@/lib/text-blast";
import type { OwnerAlertConfig, OwnerAlertGroup } from "@/types";

/**
 * The rules of owner text alerts, kept pure so the panel, the senders and the
 * check script agree. Each alert is one SMS part at most: a provider bills
 * by the part, and an owner reads these on a lock screen.
 */

export const OWNER_ALERT_GROUPS: { key: OwnerAlertGroup; label: string; detail: string }[] = [
  { key: "quotes", label: "Quotation updates", detail: "Sent to a customer, approved, partly approved or declined." },
  { key: "approvals", label: "Approval needed", detail: "A discount or below-cost price waits for an administrator." },
  { key: "bookings", label: "New bookings", detail: "A request from the online booking page or a Messenger chat." },
  { key: "jobs", label: "Job orders", detail: "A job order completed or cancelled." },
];

export const MAX_RECIPIENTS = 3;
export const DEFAULT_DAILY_LIMIT = 20;
export const MAX_DAILY_LIMIT = 200;
/** One GSM part. Anything longer is cut, never split into a second billed part. */
export const MAX_ALERT_CHARS = 160;

export const DEFAULT_OWNER_ALERTS: OwnerAlertConfig = {
  enabled: false,
  recipients: [],
  groups: ["quotes", "approvals", "bookings", "jobs"],
  dailyLimit: DEFAULT_DAILY_LIMIT,
};

export function ownerAlertConfigOf(stored: OwnerAlertConfig | undefined): OwnerAlertConfig {
  return {
    enabled: stored?.enabled ?? DEFAULT_OWNER_ALERTS.enabled,
    recipients: stored?.recipients ?? DEFAULT_OWNER_ALERTS.recipients,
    groups: stored?.groups ?? DEFAULT_OWNER_ALERTS.groups,
    dailyLimit: stored?.dailyLimit ?? DEFAULT_OWNER_ALERTS.dailyLimit,
  };
}

/**
 * Plain GSM text in one part. The characters AEGIS writes elsewhere that SMS
 * cannot carry cheaply (the peso sign, curly quotes, the middle dot, the dash)
 * are swapped for plain ones, since a single one would cut the limit to 70.
 */
export function fitSms(body: string): string {
  let text = body
    .replace(/₱\s?/g, "PHP ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[·•]/g, "-")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...");
  // Anything still outside the GSM alphabet (an emoji in a customer's name)
  // goes, before spaces are tidied so it leaves no gap behind.
  text = [...text]
    .filter((char) => !countSegments(char).unicode)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  if (countSegments(text).characters <= MAX_ALERT_CHARS) return text;
  let cut = text.slice(0, MAX_ALERT_CHARS - 3);
  while (countSegments(`${cut}...`).characters > MAX_ALERT_CHARS) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}...`;
}

const peso = (cents: number) => `PHP ${formatAmount(cents)}`;

export function quoteSentText(business: string, ref: string, customer: string, totalCents: number): string {
  return fitSms(`${business}: ${ref} sent to ${customer || "the customer"}, ${peso(totalCents)}.`);
}

export function quoteAnsweredText(
  business: string,
  ref: string,
  outcome: "Approved" | "Partially Approved" | "Declined",
  customer: string,
  approvedCents: number,
): string {
  const who = customer || "The customer";
  if (outcome === "Declined") return fitSms(`${business}: ${who} declined ${ref}.`);
  const verb = outcome === "Approved" ? "approved" : "partly approved";
  return fitSms(`${business}: ${who} ${verb} ${ref}, ${peso(approvedCents)}. Make the job order in AEGIS.`);
}

export function approvalNeededText(business: string, ref: string, reason: string, by: string): string {
  return fitSms(`${business}: ${ref} by ${by} needs your approval before sending. ${reason}`);
}

export function bookingText(business: string, ref: string, customer: string, when: string, from: string): string {
  return fitSms(`${business}: new booking ${ref} from ${from}, ${customer || "no name"}, ${when}. Confirm it in AEGIS.`);
}

export function jobText(business: string, ref: string, status: "Completed" | "Cancelled", customer: string): string {
  return fitSms(`${business}: job order ${ref}${customer ? ` for ${customer}` : ""} ${status.toLowerCase()}.`);
}

export function testText(business: string): string {
  return fitSms(`${business}: test alert from AEGIS. Owner text alerts are working.`);
}
