"use server";

import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/dal/businesses";
import { financeActor } from "@/lib/dal/finance";
import {
  createAccount,
  recordCount,
  recordTransfer,
  resolveCount,
  setAccountActive,
  updateAccount,
  voidPayment,
} from "@/lib/dal/finance-accounts";
import { createBill, recordBillPayment, updateBill, voidBill, voidBillPayment } from "@/lib/dal/finance-bills";
import { InputError } from "@/lib/dal/refs";
import { EXPENSE_CATEGORIES } from "@/lib/finance";
import type { BillInput, BillPaymentInput, ExpenseCategory, MoneyAccountInput, TransferInput } from "@/types";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function refresh() {
  revalidatePath("/finance");
  // The dashboard carries the reconciliation alert.
  revalidatePath("/dashboard");
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cents(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) ? value : Number.NaN;
}

async function guard<T>(work: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof InputError) return { ok: false, error: error.message };
    throw error;
  }
}

/**
 * Members enter, administrators own. Accounts and their opening balances are
 * what every Standing figure starts from, and resolving a difference decides
 * what the book says, so those are for administrators. Anyone with the module
 * can record a transfer or a count.
 */
async function adminActor() {
  const actor = await financeActor();
  if (actor.role !== "aegis_admin") {
    throw new InputError("Only an administrator can do this. Ask one to set it up.");
  }
  return actor;
}

export async function createAccountAction(raw: MoneyAccountInput): Promise<Result<{ ref: string }>> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await adminActor();
    const type = raw.type;
    const ref = await createAccount(
      {
        type,
        bankKind: type === "bank" ? (raw.bankKind === "passbook" ? "passbook" : raw.bankKind === "account" ? "account" : null) : null,
        name: text(raw.name, 80),
        institution: text(raw.institution, 80),
        accountNumber: text(raw.accountNumber, 40),
        openingBalanceCents: cents(raw.openingBalanceCents),
        openingDate: text(raw.openingDate, 10),
      },
      actor,
    );
    refresh();
    return { ok: true, ref };
  });
}

export async function updateAccountAction(
  ref: string,
  raw: { name: string; openingBalanceCents: number; openingDate: string },
): Promise<Result> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await adminActor();
    await updateAccount(
      text(ref, 20),
      { name: text(raw.name, 80), openingBalanceCents: cents(raw.openingBalanceCents), openingDate: text(raw.openingDate, 10) },
      actor,
    );
    refresh();
    return { ok: true };
  });
}

export async function setAccountActiveAction(ref: string, active: boolean): Promise<Result> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await adminActor();
    await setAccountActive(text(ref, 20), active === true, actor);
    refresh();
    return { ok: true };
  });
}

export async function recordTransferAction(raw: TransferInput): Promise<Result<{ ref: string }>> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await financeActor();
    const ref = await recordTransfer(
      {
        fromRef: text(raw.fromRef, 20),
        toRef: text(raw.toRef, 20),
        amountCents: cents(raw.amountCents),
        paidOn: text(raw.paidOn, 10),
        note: text(raw.note, 200),
      },
      actor,
    );
    refresh();
    return { ok: true, ref };
  });
}

/** Administrators only: taking back money movement changes balances already reported on. */
export async function voidPaymentAction(ref: string, reason: string): Promise<Result> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await adminActor();
    await voidPayment(text(ref, 20), text(reason, 300), actor);
    refresh();
    return { ok: true };
  });
}

export async function recordCountAction(
  accountRef: string,
  asOf: string,
  countedCents: number,
): Promise<Result<{ ref: string; differenceCents: number }>> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await financeActor();
    const result = await recordCount(text(accountRef, 20), text(asOf, 10), cents(countedCents), actor);
    refresh();
    return { ok: true, ...result };
  });
}

// ---- Bills --------------------------------------------------------------------

const CATEGORIES: ExpenseCategory[] = EXPENSE_CATEGORIES.map((entry) => entry.key);

function readBill(raw: BillInput): Omit<BillInput, "supplierRef" | "receiptRef" | "paidFrom"> {
  return {
    payee: text(raw.payee, 120),
    reference: text(raw.reference, 80),
    billDate: text(raw.billDate, 10),
    dueDate: text(raw.dueDate, 10),
    amountCents: cents(raw.amountCents),
    category: CATEGORIES.includes(raw.category) ? raw.category : ("" as ExpenseCategory),
    responsiblePerson: text(raw.responsiblePerson, 80),
    remarks: text(raw.remarks, 600),
  };
}

export async function createBillAction(raw: BillInput): Promise<Result<{ ref: string }>> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await financeActor();
    const paidFrom =
      raw.paidFrom && typeof raw.paidFrom === "object"
        ? { accountRef: text(raw.paidFrom.accountRef, 20), paidOn: text(raw.paidFrom.paidOn, 10) }
        : null;
    const ref = await createBill(
      {
        ...readBill(raw),
        supplierRef: text(raw.supplierRef, 20) || null,
        receiptRef: text(raw.receiptRef, 20) || null,
        paidFrom,
      },
      actor,
    );
    refresh();
    return { ok: true, ref };
  });
}

export async function updateBillAction(ref: string, raw: BillInput): Promise<Result> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await financeActor();
    await updateBill(text(ref, 20), readBill(raw), actor);
    refresh();
    return { ok: true };
  });
}

export async function payBillAction(ref: string, raw: BillPaymentInput): Promise<Result<{ ref: string }>> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await financeActor();
    const paymentRef = await recordBillPayment(
      text(ref, 20),
      { accountRef: text(raw.accountRef, 20), amountCents: cents(raw.amountCents), paidOn: text(raw.paidOn, 10), note: text(raw.note, 200) },
      actor,
    );
    refresh();
    return { ok: true, ref: paymentRef };
  });
}

/** Administrators only: a void bill leaves the month's costs. */
export async function voidBillAction(ref: string, reason: string): Promise<Result> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await adminActor();
    await voidBill(text(ref, 20), text(reason, 300), actor);
    refresh();
    return { ok: true };
  });
}

export async function voidBillPaymentAction(paymentRef: string, reason: string): Promise<Result> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await adminActor();
    await voidBillPayment(text(paymentRef, 20), text(reason, 300), actor);
    refresh();
    return { ok: true };
  });
}

export async function resolveCountAction(ref: string, resolution: string, adjust: boolean): Promise<Result> {
  await requireModule("finance");
  return guard(async () => {
    const actor = await adminActor();
    await resolveCount(text(ref, 20), text(resolution, 600), adjust === true, actor);
    refresh();
    return { ok: true };
  });
}
