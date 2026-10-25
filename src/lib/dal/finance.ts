import "server-only";

import { tenantScope } from "./tenant";
import { verifySession } from "./session";
import { findUserById } from "./users";
import { InputError } from "./refs";
import type {
  BillDocument,
  DuplicateMatch,
  FeeRuleDocument,
  FieldChange,
  FinanceActor,
  FinanceAttachmentDocument,
  FinanceEventDocument,
  FinanceIntakeDocument,
  FinanceEventLine,
  InvoiceDocument,
  MoneyAccountDocument,
  Payment,
  PaymentDocument,
  ReconciliationDocument,
  RecordAudit,
  UserRole,
} from "@/types";

/**
 * The Finance collections, each reached only through `tenantScope`, and the
 * audit log every write in Finance adds a line to. The rules themselves are
 * pure, in `src/lib/finance.ts`.
 */
export const moneyAccounts = () => tenantScope<MoneyAccountDocument>("moneyAccounts");
export const bills = () => tenantScope<BillDocument>("bills");
export const invoices = () => tenantScope<InvoiceDocument>("invoices");
export const payments = () => tenantScope<PaymentDocument>("payments");
export const reconciliations = () => tenantScope<ReconciliationDocument>("reconciliations");
export const feeRules = () => tenantScope<FeeRuleDocument>("feeRules");
export const financeAttachments = () => tenantScope<FinanceAttachmentDocument>("financeAttachments");
export const financeIntake = () => tenantScope<FinanceIntakeDocument>("financeIntake");
const financeEvents = () => tenantScope<FinanceEventDocument>("financeEvents");

export async function financeActor(): Promise<FinanceActor & { role: UserRole }> {
  const { userId, role } = await verifySession();
  const user = await findUserById(userId);
  return { userId, name: user?.name || user?.username || "Unknown user", role };
}

/**
 * One record's history, newest first, for the drawer that shows it. A bill's
 * payments are logged under their own refs, so a bill passes those as well.
 */
export async function listEventsFor(refs: string | string[]): Promise<FinanceEventLine[]> {
  const collection = await financeEvents();
  const list = Array.isArray(refs) ? refs : [refs];
  const docs = await collection.find({ ref: { $in: list } }).sort({ at: -1 }).limit(150).toArray();
  return docs.map((doc) => ({
    ref: doc.ref,
    at: doc.at.toISOString(),
    actor: doc.actor.name,
    action: doc.action,
    detail: doc.detail,
    changes: doc.changes ?? [],
    reason: doc.reason ?? "",
  }));
}

/**
 * Append-only. Written after the change it describes, never instead of it.
 * A correction also carries its reason and every field it changed.
 */
export async function logFinanceEvent(
  actor: FinanceActor,
  action: string,
  ref: string,
  detail: string,
  correction?: { changes: FieldChange[]; reason: string },
): Promise<void> {
  const collection = await financeEvents();
  await collection.insertOne({
    at: new Date(),
    actor: { userId: actor.userId, name: actor.name },
    action,
    ref,
    detail,
    ...(correction ? { changes: correction.changes, reason: correction.reason } : {}),
  });
}

/**
 * Who made a record and who last changed it. Records from before the change
 * that started keeping `updatedBy` have only `updatedAt`; an `updatedAt` equal
 * to `createdAt` means it was never changed.
 */
export function recordAudit(
  doc: { createdBy?: string; createdAt: Date; updatedBy?: string; updatedAt?: Date },
  source: string,
): RecordAudit {
  const changed = doc.updatedAt && doc.updatedAt.getTime() !== doc.createdAt.getTime();
  return {
    createdBy: doc.createdBy || "Not recorded",
    createdAt: doc.createdAt.toISOString(),
    updatedBy: changed ? doc.updatedBy || "Not recorded" : null,
    updatedAt: changed && doc.updatedAt ? doc.updatedAt.toISOString() : null,
    source,
  };
}

/** A payment as a drawer lists it, dates as strings, with the account's name. */
export function toPaymentView(payment: PaymentDocument, accountNames: Map<string, string>): Payment & { accountName: string } {
  return {
    ref: payment.ref,
    accountRef: payment.accountRef,
    accountName: accountNames.get(payment.accountRef) ?? payment.accountRef,
    direction: payment.direction,
    kind: payment.kind,
    amountCents: payment.amountCents,
    ...(payment.fee ? { fee: payment.fee } : {}),
    paidOn: payment.paidOn,
    ...(payment.invoiceRef ? { invoiceRef: payment.invoiceRef } : {}),
    ...(payment.billRef ? { billRef: payment.billRef } : {}),
    ...(payment.toAccountRef ? { toAccountRef: payment.toAccountRef } : {}),
    ...(payment.reconciliationRef ? { reconciliationRef: payment.reconciliationRef } : {}),
    ...(payment.nature ? { nature: payment.nature } : {}),
    ...(payment.party ? { party: payment.party } : {}),
    ...(payment.reference ? { reference: payment.reference } : {}),
    note: payment.note,
    status: payment.status,
    ...(payment.voidReason ? { voidReason: payment.voidReason } : {}),
    createdBy: payment.createdBy,
    createdAt: payment.createdAt.toISOString(),
    ...(payment.updatedBy ? { updatedBy: payment.updatedBy } : {}),
    updatedAt: payment.updatedAt ? payment.updatedAt.toISOString() : null,
  };
}

/**
 * A new record that looks like one already on file. Refused, with the
 * matches, until the person has seen them and saves past them on purpose, so
 * a document entered twice never quietly counts twice.
 */
export class DuplicateError extends InputError {
  constructor(readonly matches: DuplicateMatch[], what: "bill" | "invoice" | "entry") {
    super(
      matches.length === 1
        ? `This ${what} may already be on record as ${matches[0].ref}. Check it before saving again.`
        : `This ${what} may already be on record ${matches.length} times. Check them before saving again.`,
    );
  }
}

/** The matches the person has not yet seen and saved past; empty means go ahead. */
export function unconfirmed(matches: DuplicateMatch[], confirmed: string[]): DuplicateMatch[] {
  return matches.filter((match) => !confirmed.includes(match.ref));
}
