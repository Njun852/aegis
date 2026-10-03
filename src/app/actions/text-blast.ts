"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/dal/businesses";
import { setCustomerSmsOptOut } from "@/lib/dal/customers";
import { InputError } from "@/lib/dal/refs";
import {
  queueManualReminder,
  runReminderSweep,
  saveTextBlastSettings,
} from "@/lib/dal/text-blast";

/**
 * Text Blast's actions. Each asserts the module entitlement first, and takes
 * the business from that check: the sweep functions are addressed by business
 * id, and that id must come from the session, never from the browser.
 */

type Result = { ok: true; note?: string } | { ok: false; error: string };

async function attempt(work: () => Promise<string | void>): Promise<Result> {
  try {
    const note = await work();
    revalidatePath("/text-blast");
    return { ok: true, note: note ?? undefined };
  } catch (error) {
    if (error instanceof InputError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function saveTextBlastSettingsAction(input: {
  enabled: boolean;
  template: string;
  leadDays: number;
}): Promise<Result> {
  const business = await requireModule("sms");
  return attempt(() =>
    saveTextBlastSettings(business.id, {
      enabled: Boolean(input.enabled),
      template: String(input.template),
      leadDays: Number(input.leadDays),
    }),
  );
}

export async function setSmsOptOutAction(customerRef: string, optedOut: boolean): Promise<Result> {
  await requireModule("sms");
  const result = await attempt(() => setCustomerSmsOptOut(customerRef, optedOut));
  if (result.ok) revalidatePath("/crm");
  return result;
}

/** One reminder a person asked for, for a car the sweep leaves alone. */
export async function sendReminderAction(vehicleRef: string): Promise<Result> {
  const business = await requireModule("sms");
  return attempt(() => queueManualReminder(business.id, vehicleRef));
}

/** Runs the sweep now instead of waiting for the timer. Same rules, same limits. */
export async function runSweepAction(): Promise<Result> {
  const business = await requireModule("sms");
  const result = await runReminderSweep(business.id);
  revalidatePath("/text-blast");
  return result.ran ? { ok: true, note: result.note } : { ok: false, error: result.note };
}
