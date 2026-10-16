import "server-only";

import { tenantScope } from "./tenant";
import { verifySession } from "./session";
import { findUserById } from "./users";
import type {
  FinanceActor,
  FinanceEventDocument,
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
export const payments = () => tenantScope<PaymentDocument>("payments");
export const reconciliations = () => tenantScope<ReconciliationDocument>("reconciliations");
const financeEvents = () => tenantScope<FinanceEventDocument>("financeEvents");

export async function financeActor(): Promise<FinanceActor & { role: UserRole }> {
  const { userId, role } = await verifySession();
  const user = await findUserById(userId);
  return { userId, name: user?.name || user?.username || "Unknown user", role };
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
