"use server";

import { revalidatePath } from "next/cache";
import { AI_MONTHLY_TOKEN_BUDGET, isAiConfigured } from "@/lib/ai/client";
import { ASK_BUDGET_SHARE, ASK_PER_DAY, askAegis } from "@/lib/ai/ask";
import { explainFailure } from "@/lib/ai/failures";
import { MAX_QUESTION_CHARS, type AskProposal, type AskTool, type AskTurn } from "@/lib/ask";
import { tokensUsedThisMonth } from "@/lib/dal/ai";
import { countAsksToday, recordAsk } from "@/lib/dal/ask-log";
import { getBooking } from "@/lib/dal/bookings";
import { getActiveBusiness } from "@/lib/dal/businesses";
import { findCustomer, listCustomers } from "@/lib/dal/customers";
import { findVehicleOption } from "@/lib/dal/fleet";
import { readQuotationSettings } from "@/lib/dal/quotations";
import { verifySession } from "@/lib/dal/session";
import { addDays, emptyLine, manilaDateKey, manilaDateTimeInput } from "@/lib/quotations";
import { setBookingStatusAction } from "./bookings";
import {
  approveSpecialPricingAction,
  convertToJobOrderAction,
  markQuotationGivenAction,
  recordQuoteResponseAction,
  saveQuotationAction,
  setJobOrderStatusAction,
} from "./quotations";
import type { BookingStatus, QuoteBillTo, QuoteLine } from "@/types";

type AskResult =
  | { ok: true; answer: string; proposals: AskProposal[]; tools: AskTool[] }
  | { ok: false; error: string };

/**
 * A question from the chat bubble. The answer is text plus, when the person
 * asked for something to be done, proposals they must confirm one by one.
 * Nothing is changed here. The limits are checked before anything is spent,
 * and every question is logged whatever its outcome.
 */
export async function askAegisAction(question: string, history: AskTurn[]): Promise<AskResult> {
  const { userId, role } = await verifySession();
  const business = await getActiveBusiness();
  if (!business) return { ok: false, error: "Sign in again to use Ask AEGIS." };

  const text = typeof question === "string" ? question.trim() : "";
  if (!text) return { ok: false, error: "Type a question first." };
  if (text.length > MAX_QUESTION_CHARS) {
    return { ok: false, error: `Keep the question under ${MAX_QUESTION_CHARS} characters.` };
  }
  if (!isAiConfigured()) return { ok: false, error: explainFailure("not-configured") };

  if ((await countAsksToday()) >= ASK_PER_DAY) {
    await recordAsk({ userId, question: text, tools: [], answer: "", outcome: "limit", billed: false });
    return { ok: false, error: `${business.name} has asked ${ASK_PER_DAY} questions today, the daily limit. Try again tomorrow.` };
  }
  if ((await tokensUsedThisMonth()) >= AI_MONTHLY_TOKEN_BUDGET * ASK_BUDGET_SHARE) {
    return {
      ok: false,
      error: "Most of this month's AI allowance is used, and the rest is kept for mail. Ask AEGIS is paused until next month.",
    };
  }

  const result = await askAegis(business, text, Array.isArray(history) ? history : [], {
    isAdmin: role === "aegis_admin",
  });
  await recordAsk({
    userId,
    question: text,
    tools: result.ok ? [...result.tools, ...result.proposals.map((proposal) => `proposed:${proposal.kind}`)] : [],
    answer: result.ok ? result.answer : "",
    outcome: result.ok ? "ok" : result.reason,
    billed: result.ok ? result.billed : result.reason !== "not-configured" && result.reason !== "over-budget",
  });
  if (!result.ok) return { ok: false, error: explainFailure(result.reason) };
  return { ok: true, answer: result.answer, proposals: result.proposals, tools: result.tools };
}

type RunResult = { ok: true; message: string; href: string | null } | { ok: false; error: string };

/**
 * Runs one proposal the person confirmed. It goes through the same server
 * action as the screen's own button, so every permission, module check and
 * rule applies exactly as it does there; the bubble gains no powers of its
 * own. The proposal comes back from the browser, so nothing in it is trusted
 * beyond naming what to do: each action re-reads and re-checks the record.
 */
export async function runAskProposalAction(proposal: AskProposal): Promise<RunResult> {
  const { userId } = await verifySession();
  const business = await getActiveBusiness();
  if (!business) return { ok: false, error: "Sign in again to use Ask AEGIS." };
  const ref = typeof proposal?.params?.ref === "string" ? proposal.params.ref : "";

  const result = await run(proposal, ref, business.modules);
  await recordAsk({
    userId,
    question: `[confirmed] ${String(proposal?.title ?? proposal?.kind).slice(0, 200)}`,
    tools: [`ran:${proposal?.kind}`],
    answer: result.ok ? result.message : result.error,
    outcome: result.ok ? "ok" : "error",
    billed: false,
  });
  return result;
}

async function run(proposal: AskProposal, ref: string, modules: string[]): Promise<RunResult> {
  switch (proposal?.kind) {
    case "booking_status": {
      const status = proposal.params.status as BookingStatus;
      const result = await setBookingStatusAction(ref, status);
      return result.ok
        ? { ok: true, message: status === "Cancelled" ? `${ref} cancelled.` : `${ref} moved to ${status}.`, href: `/bookings?booking=${encodeURIComponent(ref)}` }
        : result;
    }

    case "quote_mark_given": {
      const result = await markQuotationGivenAction(ref, proposal.params.how ?? "");
      return result.ok ? { ok: true, message: `${ref} marked as given.`, href: `/quotations/${encodeURIComponent(ref)}` } : result;
    }

    case "quote_answer": {
      const outcome = proposal.params.outcome;
      if (outcome !== "Approved" && outcome !== "Declined") return { ok: false, error: "Only a full approval or a decline can be recorded here." };
      const result = await recordQuoteResponseAction(ref, {
        outcome,
        at: manilaDateTimeInput(new Date()),
        customerName: proposal.params.customerName ?? "",
        method: "In person",
        note: "Recorded through Ask AEGIS.",
        approvedLineIds: [],
        approvedDiscountCents: 0,
      });
      return result.ok
        ? { ok: true, message: `${ref} recorded as ${outcome.toLowerCase()}.`, href: `/quotations/${encodeURIComponent(ref)}` }
        : result;
    }

    case "approve_pricing": {
      const result = await approveSpecialPricingAction(ref, proposal.params.pricingKey ?? "");
      return result.ok ? { ok: true, message: `Pricing on ${ref} approved.`, href: `/quotations/${encodeURIComponent(ref)}` } : result;
    }

    case "make_job_order": {
      const result = await convertToJobOrderAction(ref);
      return result.ok
        ? {
            ok: true,
            message: `${result.created ? "Made" : "Already"} ${result.jobOrderRef}.${result.bookingNote ? ` ${result.bookingNote}` : ""}`,
            href: `/quotations/jobs/${encodeURIComponent(result.jobOrderRef)}`,
          }
        : result;
    }

    case "job_status": {
      const status = proposal.params.status ?? "";
      const result = await setJobOrderStatusAction(ref, status);
      return result.ok
        ? { ok: true, message: `${ref} moved to ${status}.${result.bookingNote ? ` ${result.bookingNote}` : ""}`, href: `/quotations/jobs/${encodeURIComponent(ref)}` }
        : result;
    }

    case "draft_quotation":
      return draftQuotation(proposal, modules);

    default:
      return { ok: false, error: "That is not something Ask AEGIS can do." };
  }
}

/**
 * Saves the drafted quotation through the editor's own save, which checks
 * every field again. Linked to the booking's customer and car when it is for
 * a booking; otherwise to a CRM customer only when exactly one has that name.
 */
async function draftQuotation(proposal: AskProposal, modules: string[]): Promise<RunResult> {
  const draft = proposal.params.draft;
  if (!draft || !Array.isArray(draft.lines) || draft.lines.length === 0) {
    return { ok: false, error: "The draft has no lines." };
  }
  const settings = await readQuotationSettings();
  const quoteDate = manilaDateKey(new Date());
  const crm = modules.includes("crm");

  const booking = draft.bookingRef ? await getBooking(draft.bookingRef) : null;
  let billTo: QuoteBillTo = {
    customerRef: null,
    name: String(draft.customerName ?? "").slice(0, 120),
    company: "",
    address: "",
    phone: "",
    email: "",
  };
  let linkedRef = booking?.customerRef ?? null;
  if (!linkedRef && crm && billTo.name) {
    const same = (await listCustomers()).filter((entry) => entry.name.trim().toLowerCase() === billTo.name.trim().toLowerCase());
    if (same.length === 1) linkedRef = same[0].ref;
  }
  const customer = linkedRef && crm ? await findCustomer(linkedRef) : null;
  if (customer) {
    billTo = { customerRef: customer.ref, name: customer.name, company: customer.company, address: "", phone: customer.phone, email: customer.email };
  } else if (booking) {
    billTo = { ...billTo, name: booking.customer, company: booking.company, phone: booking.phone, email: booking.email };
  }
  const car = booking?.vehicleRef && modules.includes("fleet") ? await findVehicleOption(booking.vehicleRef) : null;

  const lines: QuoteLine[] = draft.lines.map((line) => ({
    ...emptyLine(line.section === "labor" ? "labor" : "parts", "suggested"),
    description: String(line.description ?? ""),
    qty: Number(line.qty) || 1,
    unitPriceCents: typeof line.unitPriceCents === "number" ? line.unitPriceCents : null,
  }));

  const result = await saveQuotationAction(null, {
    quoteDate,
    validUntil: addDays(quoteDate, settings.validDays),
    drNumber: "",
    bookingRef: booking?.ref ?? null,
    billTo,
    vehicle: {
      vehicleRef: car?.ref ?? null,
      plate: car?.plate ?? booking?.request?.vehicle.plate ?? "",
      makeModel: car?.label ?? "",
      odometerKm: null,
    },
    serviceAdvisor: "",
    technician: "",
    lines,
    discountCents: 0,
    discountReason: "",
    notes: settings.notes,
  });
  if (!result.ok) return result;
  revalidatePath("/quotations");
  return { ok: true, message: `${result.ref} saved as a Draft. Check it before sending.`, href: `/quotations/${encodeURIComponent(result.ref)}` };
}
