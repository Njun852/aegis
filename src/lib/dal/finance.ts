import "server-only";

import { tenantScope } from "./tenant";
import { verifySession } from "./session";
import { findUserById } from "./users";
import type {
  BillDocument,
  FinanceActor,
  FinanceEventDocument,
  FinanceEventLine,
  InvoiceDocument,
  MoneyAccountDocument,
  PaymentDocument,
  ReconciliationDocument,
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
const financeEvents = () => tenantScope<FinanceEventDocument>("financeEvents");

export async function financeActor(): Promise<FinanceActor & { role: UserRole }> {
  const { userId, role } = await verifySession();
  const user = await findUserById(userId);
  return { userId, name: user?.name || user?.username || "Unknown user", role };
}

/** One record's history, newest first, for the drawer that shows it. */
export async function listEventsFor(ref: string): Promise<FinanceEventLine[]> {
  const collection = await financeEvents();
  const docs = await collection.find({ ref }).sort({ at: -1 }).limit(100).toArray();
  return docs.map((doc) => ({ at: doc.at.toISOString(), actor: doc.actor.name, action: doc.action, detail: doc.detail }));
}

/** Append-only. Written after the change it describes, never instead of it. */
export async function logFinanceEvent(actor: FinanceActor, action: string, ref: string, detail: string): Promise<void> {
  const collection = await financeEvents();
  await collection.insertOne({
    at: new Date(),
    actor: { userId: actor.userId, name: actor.name },
    action,
    ref,
    detail,
  });
}
