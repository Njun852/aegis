"use server";

import { revalidatePath } from "next/cache";
import { canStoreSecrets } from "@/lib/auth/secrets";
import { getBusinessForUser } from "@/lib/dal/businesses";
import {
  clearMailbox,
  readMailboxStatus,
  recordVerifyOutcome,
  saveMailbox,
} from "@/lib/dal/mailbox";
import { requireAdmin } from "@/lib/dal/session";
import { explainMailFailure } from "@/lib/mail/failures";
import { verifyMailbox } from "@/lib/mail/ingest";
import type { MailboxStatus } from "@/types";

/**
 * Connecting and disconnecting a business mailbox.
 *
 * Every entry point is administrator-only and re-checks that the business is
 * one this account may administer — `getBusinessForUser` is the same gate the
 * admin screens already use, so a hand-crafted request cannot attach a mailbox
 * to somebody else's business.
 *
 * The app password travels one way. It arrives here, is encrypted, and is
 * stored; no action in this file returns it, and `MailboxStatus` has no field
 * that could carry it back.
 */

export interface MailboxActionState {
  error: string | null;
  status: MailboxStatus | null;
}

/** Rejects obvious nonsense before opening a socket to find out. */
function looksLikeAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function saveMailboxAction(
  businessId: string,
  address: string,
  appPassword: string,
): Promise<MailboxActionState> {
  await requireAdmin();

  if (!(await getBusinessForUser(businessId))) {
    return { error: "That business could not be found.", status: null };
  }

  if (!canStoreSecrets()) {
    return {
      error:
        "This server has no MAIL_CREDENTIAL_KEY set, so a mailbox password cannot be stored securely. Generate one with: openssl rand -hex 32",
      status: null,
    };
  }

  const trimmedAddress = address.trim().toLowerCase();
  // Google prints app passwords in four groups of four; people paste them that
  // way, and the spaces are not part of the secret.
  const trimmedPassword = appPassword.replace(/\s+/g, "");

  if (!looksLikeAddress(trimmedAddress)) {
    return { error: "Enter the full mailbox address.", status: null };
  }
  if (trimmedPassword.length < 16) {
    return {
      error:
        "That does not look like a Google app password. They are 16 characters, generated at myaccount.google.com/apppasswords with 2-Step Verification switched on.",
      status: null,
    };
  }

  await saveMailbox(businessId, trimmedAddress, trimmedPassword);

  revalidatePath(`/admin/businesses/${businessId}`);
  revalidatePath("/mail");
  revalidatePath("/status");

  return { error: null, status: await readMailboxStatus(businessId) };
}

/**
 * Opens a connection and closes it, without reading a single message.
 *
 * Worth its own action rather than folding into save: it tells an admin whether
 * the credentials work at the moment they enter them, instead of leaving them
 * to infer it from an empty inbox later.
 */
export async function testMailboxAction(
  businessId: string,
): Promise<MailboxActionState> {
  await requireAdmin();

  if (!(await getBusinessForUser(businessId))) {
    return { error: "That business could not be found.", status: null };
  }

  const failure = await verifyMailbox(businessId);
  await recordVerifyOutcome(businessId, failure);
  revalidatePath("/status");

  return {
    error: failure ? explainMailFailure(failure) : null,
    status: await readMailboxStatus(businessId),
  };
}

export async function disconnectMailboxAction(
  businessId: string,
): Promise<MailboxActionState> {
  await requireAdmin();

  if (!(await getBusinessForUser(businessId))) {
    return { error: "That business could not be found.", status: null };
  }

  await clearMailbox(businessId);

  revalidatePath(`/admin/businesses/${businessId}`);
  revalidatePath("/mail");
  revalidatePath("/status");

  return { error: null, status: await readMailboxStatus(businessId) };
}
