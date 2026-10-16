import "server-only";

import {
  ASK_SCREENS,
  refHref,
  type AskActionKind,
  type AskDraftLine,
  type AskProposal,
  type AskScreen,
} from "@/lib/ask";
import { bookingMoveRefusal, jobStartRefusal } from "@/lib/job-orders";
import {
  MAX_AMOUNT_CENTS,
  MAX_QTY,
  QUOTE_HANDOVER_METHODS,
  formatPeso,
  pricingCleared,
  specialPricingKey,
  specialPricingReason,
} from "@/lib/quotations";
import { getBooking } from "./bookings";
import { findJobOrder, listJobsForBooking } from "./job-orders";
import { findQuotation } from "./quotations";
import type { BookingStatus, Business, JobOrderStatus } from "@/types";

/**
 * Turns what the model proposed into cards a person can confirm. Each
 * proposal is checked against the record as it is now, and its title and
 * details are written from that record, never from the model's wording, so
 * Confirm does what the card says. Nothing here writes: running a confirmed
 * proposal is `runAskProposalAction`, through the screens' own actions.
 */

/** What the model returns for one action, before checking. */
export interface RawAskAction {
  kind: string;
  ref: string;
  screen: string;
  status: string;
  outcome: string;
  customer: string;
  how: string;
  lines: { section: string; description: string; qty: number; unit_price: number }[];
}

export function actionsFor(business: Business, isAdmin: boolean): AskActionKind[] {
  const has = (key: string) => business.modules.includes(key as Business["modules"][number]);
  const kinds: AskActionKind[] = ["open"];
  if (has("bookings")) kinds.push("booking_status");
  if (has("quotes")) {
    kinds.push("draft_quotation", "quote_mark_given", "quote_answer", "make_job_order", "job_status");
    if (isAdmin) kinds.push("approve_pricing");
  }
  return kinds;
}

const BOOKING_STATUSES: BookingStatus[] = ["Pending", "Confirmed", "In progress", "Completed", "Cancelled"];
const JOB_STATUSES: JobOrderStatus[] = ["Open", "In progress", "Completed", "Cancelled"];
const MAX_DRAFT_LINES = 20;

const blocked = (proposal: Omit<AskProposal, "blocked">, reason: string): AskProposal => ({ ...proposal, blocked: reason });

async function propose(raw: RawAskAction, id: string, allowed: AskActionKind[]): Promise<AskProposal | null> {
  const kind = allowed.find((entry) => entry === raw.kind);
  if (!kind) return null;
  const ref = raw.ref.trim().toUpperCase();
  const base = { id, kind, details: [] as string[], href: ref ? refHref(ref) : null, params: { ref } };

  switch (kind) {
    case "open": {
      const screen = (Object.keys(ASK_SCREENS) as AskScreen[]).find((key) => key === raw.screen);
      const href = (ref && refHref(ref)) || (screen ? ASK_SCREENS[screen] : null);
      if (!href) return null;
      return { ...base, href, title: `Open ${ref || screen?.replace("_", " ")}`, blocked: null };
    }

    case "booking_status": {
      const status = BOOKING_STATUSES.find((entry) => entry.toLowerCase() === raw.status.trim().toLowerCase());
      const booking = ref ? await getBooking(ref) : null;
      if (!booking) return blocked({ ...base, title: `Change booking ${ref || "?"}` }, "That booking is not on file.");
      const proposal = {
        ...base,
        title: status === "Cancelled" ? `Cancel booking ${booking.ref}` : `Move booking ${booking.ref} to ${status ?? "?"}`,
        details: [`${booking.customer} · ${booking.service}`, `${booking.day} ${booking.time}`, `${booking.status} → ${status ?? "?"}`],
        params: { ref: booking.ref, status },
      };
      if (!status) return blocked(proposal, "That is not a booking status.");
      if (status === booking.status) return blocked(proposal, `It is already ${status}.`);
      const refusal = bookingMoveRefusal(status, await listJobsForBooking(booking.ref));
      return refusal ? blocked(proposal, refusal) : { ...proposal, blocked: null };
    }

    case "quote_mark_given":
    case "quote_answer":
    case "approve_pricing":
    case "make_job_order": {
      const quote = ref ? await findQuotation(ref) : null;
      if (!quote) return blocked({ ...base, title: `Quotation ${ref || "?"}` }, "That quotation is not on file.");
      const who = quote.billTo.name || quote.billTo.company || "No name";
      const about = `${who} · ${formatPeso(quote.totals.totalCents)} · rev ${quote.revision} · ${quote.status}`;
      if (quote.jobOrderRef && kind !== "make_job_order") {
        return blocked({ ...base, title: `Quotation ${quote.ref}`, details: [about] }, `It is already job order ${quote.jobOrderRef}.`);
      }

      if (kind === "quote_mark_given") {
        const how = QUOTE_HANDOVER_METHODS.find((entry) => entry.toLowerCase() === raw.how.trim().toLowerCase()) ?? QUOTE_HANDOVER_METHODS[0];
        const proposal = { ...base, title: `Mark ${quote.ref} as given`, details: [about, how], params: { ref: quote.ref, how } };
        if (quote.status !== "Draft" && quote.status !== "Sent" && quote.status !== "Expired") {
          return blocked(proposal, `The customer has already answered (${quote.status}).`);
        }
        if (quote.totals.unpricedCount > 0) return blocked(proposal, "Price every line first.");
        if (!pricingCleared(quote)) return blocked(proposal, "Its special pricing needs an administrator's approval first.");
        return { ...proposal, blocked: null };
      }

      if (kind === "quote_answer") {
        const said = raw.outcome.trim().toLowerCase();
        const outcome: "Approved" | "Declined" | null = said === "declined" ? "Declined" : said === "approved" ? "Approved" : null;
        const customerName = raw.customer.trim().slice(0, 120) || who;
        const proposal = {
          ...base,
          title: outcome === "Declined" ? `Record that ${quote.ref} was declined` : `Record that ${quote.ref} was approved`,
          details: [about, `Answered by ${customerName}, in person, now`],
          params: { ref: quote.ref, outcome: outcome ?? undefined, customerName },
        };
        if (!outcome) return blocked(proposal, "Only a full approval or a decline can be recorded here. Tick the lines for a partial approval on the quotation.");
        if (quote.status !== "Sent" && quote.status !== "Expired") {
          return blocked(proposal, quote.status === "Draft" ? "It has not been sent or given to the customer yet." : `An answer is already recorded (${quote.status}).`);
        }
        return { ...proposal, blocked: null };
      }

      if (kind === "approve_pricing") {
        const key = specialPricingKey(quote.lines, quote.discountCents);
        const proposal = {
          ...base,
          title: `Approve special pricing on ${quote.ref}`,
          details: [about, specialPricingReason(quote.lines, quote.discountCents) ?? "", quote.discountReason ? `Reason: ${quote.discountReason}` : ""].filter(Boolean),
          params: { ref: quote.ref, pricingKey: key },
        };
        if (!key) return blocked(proposal, "It has no discount or below-cost price to approve.");
        if (pricingCleared(quote)) return blocked(proposal, "Its pricing is already approved.");
        return { ...proposal, blocked: null };
      }

      const proposal = {
        ...base,
        title: `Make a job order from ${quote.ref}`,
        details: [about, quote.response ? `Approved ${formatPeso(quote.response.approvedTotalCents)} by ${quote.response.customerName}` : "", quote.bookingRef ? `Booking ${quote.bookingRef} takes the approved amount as its value` : ""].filter(Boolean),
        params: { ref: quote.ref },
      };
      if (quote.jobOrderRef) return blocked(proposal, `It is already job order ${quote.jobOrderRef}.`);
      if (quote.status !== "Approved" && quote.status !== "Partially Approved") {
        return blocked(proposal, "The customer's approval is not recorded yet.");
      }
      return { ...proposal, blocked: null };
    }

    case "job_status": {
      const status = JOB_STATUSES.find((entry) => entry.toLowerCase() === raw.status.trim().toLowerCase());
      const job = ref ? await findJobOrder(ref) : null;
      if (!job) return blocked({ ...base, title: `Job order ${ref || "?"}` }, "That job order is not on file.");
      const proposal = {
        ...base,
        title: status === "Cancelled" ? `Cancel job order ${job.ref}` : `Move job order ${job.ref} to ${status ?? "?"}`,
        details: [`${job.billTo.name || job.billTo.company} · ${formatPeso(job.approvedTotalCents)}`, `${job.status} → ${status ?? "?"}`, job.bookingRef ? `Booking ${job.bookingRef} follows it` : ""].filter(Boolean),
        params: { ref: job.ref, status },
      };
      if (!status) return blocked(proposal, "That is not a job order status.");
      if (status === job.status) return blocked(proposal, `It is already ${status}.`);
      if (job.status === "Cancelled") return blocked(proposal, "A cancelled job order stays cancelled.");
      const booking = job.bookingRef ? await getBooking(job.bookingRef) : null;
      const refusal = jobStartRefusal(status, booking ? { ref: booking.ref, status: booking.status } : null);
      return refusal ? blocked(proposal, refusal) : { ...proposal, blocked: null };
    }

    case "draft_quotation": {
      const lines: AskDraftLine[] = raw.lines
        .slice(0, MAX_DRAFT_LINES)
        .map((line) => ({
          section: line.section === "labor" ? ("labor" as const) : ("parts" as const),
          description: String(line.description ?? "").trim().slice(0, 160),
          qty: Number.isFinite(line.qty) && line.qty > 0 && line.qty <= MAX_QTY ? Math.round(line.qty * 100) / 100 : 1,
          unitPriceCents:
            Number.isFinite(line.unit_price) && line.unit_price > 0 && line.unit_price * 100 <= MAX_AMOUNT_CENTS
              ? Math.round(line.unit_price * 100)
              : null,
        }))
        .filter((line) => line.description);
      const booking = ref.startsWith("BK-") ? await getBooking(ref) : null;
      const customerName = booking?.customer || raw.customer.trim().slice(0, 120);
      const priced = lines.filter((line) => line.unitPriceCents !== null);
      const total = priced.reduce((sum, line) => sum + Math.round(line.qty * (line.unitPriceCents ?? 0)), 0);
      const proposal = {
        ...base,
        href: "/quotations",
        title: `Draft a quotation for ${customerName || "?"}`,
        details: [
          ...(booking ? [`For booking ${booking.ref} · ${booking.service}`] : []),
          ...lines.map(
            (line) =>
              `${line.qty} × ${line.description}${line.section === "labor" ? " (labor)" : ""} @ ${line.unitPriceCents === null ? "no price yet" : formatPeso(line.unitPriceCents)}`,
          ),
          `Total ${formatPeso(total)}${priced.length < lines.length ? `, ${lines.length - priced.length} unpriced` : ""} · saved as a Draft, nothing is sent`,
        ],
        params: { draft: { bookingRef: booking?.ref ?? null, customerName, lines } },
      };
      if (!customerName) return blocked(proposal, "Who is it for? Name the customer or the booking.");
      if (lines.length === 0) return blocked(proposal, "No lines to quote. Say what parts or labor to include.");
      return { ...proposal, blocked: null };
    }
  }
}

/** Checked proposals, in the order the model gave them; unknown kinds are dropped. */
export async function buildProposals(
  business: Business,
  isAdmin: boolean,
  raw: RawAskAction[],
): Promise<AskProposal[]> {
  const allowed = actionsFor(business, isAdmin);
  const proposals: AskProposal[] = [];
  for (const [index, action] of raw.slice(0, 4).entries()) {
    const proposal = await propose(action, `p${Date.now().toString(36)}${index}`, allowed);
    if (proposal) proposals.push(proposal);
  }
  return proposals;
}
