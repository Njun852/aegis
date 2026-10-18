import "server-only";

import { createHash } from "node:crypto";
import { manilaDateKey } from "@/lib/booking-slots";
import {
  MIN_RESOLUTION,
  accountIdentity,
  accountInputProblem,
  accountRows,
  figureOf,
  isAmount,
  lowestBalance,
  reconcile,
  transferProblem,
} from "@/lib/finance";
import { formatMoney, formatSignedMoney } from "@/lib/format";
import { formatQuoteDay } from "@/lib/quotations";
import { logFinanceEvent, moneyAccounts, payments, reconciliations } from "./finance";
import { InputError, insertWithRef, isDuplicateKey } from "./refs";
import type {
  CountRow,
  DateKey,
  FinanceActor,
  MoneyAccount,
  MoneyAccountDocument,
  MoneyAccountInput,
  MoneyAccountSummary,
  PaymentDocument,
  Reconciliation,
  ReconciliationDocument,
  TransferInput,
} from "@/types";

/**
 * Cash, bank, passbook and e-wallet accounts, transfers between them, and
 * counts set against the book. Balances are never stored: every one is the
 * opening balance plus the payments since, worked out by `accountRows`, so a
 * balance on screen always opens into the records that make it up.
 */

const TYPE_ORDER: Record<MoneyAccount["type"], number> = { cash: 0, bank: 1, ewallet: 2 };

function todayKey(): DateKey {
  return manilaDateKey(new Date());
}

/**
 * The account number is hashed with its bank before it is stored, so the
 * duplicate check works without AEGIS keeping full account numbers.
 */
function hashIdentity(identity: string): string {
  return createHash("sha256").update(identity).digest("hex");
}

export function toAccount(doc: MoneyAccountDocument): MoneyAccount {
  return {
    ref: doc.ref,
    type: doc.type,
    bankKind: doc.bankKind,
    name: doc.name,
    institution: doc.institution,
    numberLast4: doc.numberLast4,
    openingBalanceCents: doc.openingBalanceCents,
    openingDate: doc.openingDate,
    active: doc.active,
  };
}

function toReconciliation(doc: ReconciliationDocument): Reconciliation {
  return {
    ref: doc.ref,
    accountRef: doc.accountRef,
    asOf: doc.asOf,
    countedCents: doc.countedCents,
    bookCents: doc.bookCents,
    differenceCents: doc.differenceCents,
    status: doc.status,
    resolution: doc.resolution ?? "",
    resolvedBy: doc.resolvedBy ?? "",
    createdBy: doc.createdBy,
  };
}

async function readAll() {
  const [accountCollection, paymentCollection, countCollection] = await Promise.all([
    moneyAccounts(),
    payments(),
    reconciliations(),
  ]);
  const [accountDocs, paymentDocs, countDocs] = await Promise.all([
    accountCollection.find().toArray(),
    paymentCollection.find().toArray(),
    countCollection.find().sort({ asOf: -1, createdAt: -1 }).toArray(),
  ]);
  return {
    accounts: accountDocs.map(toAccount),
    payments: paymentDocs,
    recorded: paymentDocs.filter((payment) => payment.status === "recorded"),
    counts: countDocs,
  };
}

async function findAccount(ref: string): Promise<MoneyAccount | null> {
  const collection = await moneyAccounts();
  const doc = await collection.findOne({ ref });
  return doc ? toAccount(doc) : null;
}

export async function listAccountSummaries(asOf: DateKey = todayKey()): Promise<MoneyAccountSummary[]> {
  const { accounts, payments: all, recorded, counts } = await readAll();
  return accounts
    .map((account) => {
      const rows = accountRows(account, recorded, asOf);
      const own = counts.filter((count) => count.accountRef === account.ref);
      return {
        ...account,
        rows,
        balanceCents: figureOf(rows).cents,
        lastCount: own[0] ? toReconciliation(own[0]) : null,
        openCounts: own.filter((count) => count.status === "open").length,
        hasActivity:
          own.length > 0 ||
          all.some((payment) => payment.accountRef === account.ref || payment.toAccountRef === account.ref),
        voidableRefs: recorded
          .filter((payment) => payment.kind === "transfer" || payment.kind === "other")
          .filter((payment) => payment.accountRef === account.ref || payment.toAccountRef === account.ref)
          .map((payment) => payment.ref),
      };
    })
    .sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
}

/** Every count on record, newest first, with what the book says for that day now. */
export async function listCounts(): Promise<CountRow[]> {
  const { accounts, recorded, counts } = await readAll();
  return counts.map((doc) => {
    const account = accounts.find((entry) => entry.ref === doc.accountRef);
    return {
      ...toReconciliation(doc),
      bookNowCents: account ? figureOf(accountRows(account, recorded, doc.asOf)).cents : doc.bookCents,
    };
  });
}

/** Counts whose difference nobody has explained yet: the owner's discrepancy alert. */
export async function listOpenDiscrepancies(): Promise<(Reconciliation & { accountName: string })[]> {
  const [countCollection, accountCollection] = await Promise.all([reconciliations(), moneyAccounts()]);
  const [docs, accounts] = await Promise.all([
    countCollection.find({ status: "open" }).sort({ asOf: -1 }).toArray(),
    accountCollection.find().toArray(),
  ]);
  return docs.map((doc) => ({
    ...toReconciliation(doc),
    accountName: accounts.find((account) => account.ref === doc.accountRef)?.name ?? doc.accountRef,
  }));
}

function duplicateMessage(existing: Pick<MoneyAccountDocument, "ref" | "name" | "bankKind">): string {
  return `This account is already on record as ${existing.ref} (${existing.name}). A passbook is the same money as its bank account, so each account is entered once.`;
}

export async function createAccount(input: MoneyAccountInput, actor: FinanceActor): Promise<string> {
  const today = todayKey();
  const problem = accountInputProblem(input, today);
  if (problem) throw new InputError(problem);

  const digits = input.type === "cash" ? "" : input.accountNumber.replace(/\D/g, "");
  const identity = input.type === "cash" ? null : accountIdentity(input.institution, digits);
  const accountKey = identity ? hashIdentity(identity) : undefined;

  const collection = await moneyAccounts();
  if (accountKey) {
    const existing = await collection.findOne({ accountKey });
    if (existing) throw new InputError(duplicateMessage(existing));
  }

  const now = new Date();
  let ref: string;
  try {
    ref = await insertWithRef(collection, "MA-", 1001, (next) =>
      collection.insertOne({
        ref: next,
        type: input.type,
        ...(input.type === "bank" ? { bankKind: input.bankKind ?? "account" } : {}),
        name: input.name.trim(),
        institution: input.type === "cash" ? "" : input.institution.trim(),
        numberLast4: digits.slice(-4),
        ...(accountKey ? { accountKey } : {}),
        openingBalanceCents: input.openingBalanceCents,
        openingDate: input.openingDate,
        active: true,
        createdAt: now,
        updatedAt: now,
      }),
    );
  } catch (error) {
    // Two people adding the same account at once: the index decides.
    if (isDuplicateKey(error, "accountKey") && accountKey) {
      const existing = await collection.findOne({ accountKey });
      throw new InputError(existing ? duplicateMessage(existing) : "This account is already on record.");
    }
    throw error;
  }

  await logFinanceEvent(
    actor,
    "account.created",
    ref,
    `${input.name.trim()}, opening balance ${formatMoney(input.openingBalanceCents)} on ${formatQuoteDay(input.openingDate)}`,
  );
  return ref;
}

/**
 * The name can always change. The opening balance and its day can change only
 * while nothing has moved through the account and nobody has counted it,
 * since every balance and count after that was worked out from them.
 */
export async function updateAccount(
  ref: string,
  changes: { name: string; openingBalanceCents: number; openingDate: DateKey },
  actor: FinanceActor,
): Promise<void> {
  const account = await findAccount(ref);
  if (!account) throw new InputError("That account is no longer on record.");
  const name = changes.name.trim();
  if (!name) throw new InputError("Give the account a name.");

  const openingChanged =
    changes.openingBalanceCents !== account.openingBalanceCents || changes.openingDate !== account.openingDate;
  if (openingChanged) {
    if (!isAmount(changes.openingBalanceCents, true)) throw new InputError("The opening balance must be zero or more.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(changes.openingDate) || changes.openingDate > todayKey()) {
      throw new InputError("Choose a day that has already come for the opening balance.");
    }
    const summary = (await listAccountSummaries()).find((entry) => entry.ref === ref);
    if (summary?.hasActivity) {
      throw new InputError("The opening balance is fixed once money has moved through the account or it has been counted.");
    }
  }

  const collection = await moneyAccounts();
  await collection.updateOne(
    { ref },
    { $set: { name, openingBalanceCents: changes.openingBalanceCents, openingDate: changes.openingDate, updatedAt: new Date() } },
  );
  const detail = openingChanged
    ? `${name}, opening balance now ${formatMoney(changes.openingBalanceCents)} on ${formatQuoteDay(changes.openingDate)}`
    : `Renamed ${name}`;
  await logFinanceEvent(actor, "account.updated", ref, detail);
}

/** Set aside, never deleted; and only once it is empty, so no money drops out of Standing. */
export async function setAccountActive(ref: string, active: boolean, actor: FinanceActor): Promise<void> {
  const summary = (await listAccountSummaries()).find((entry) => entry.ref === ref);
  if (!summary) throw new InputError("That account is no longer on record.");
  if (!active && summary.balanceCents !== 0) {
    throw new InputError(`${summary.name} still holds ${formatMoney(summary.balanceCents)}. Transfer it to another account first.`);
  }
  const collection = await moneyAccounts();
  await collection.updateOne({ ref }, { $set: { active, updatedAt: new Date() } });
  await logFinanceEvent(actor, active ? "account.reopened" : "account.set-aside", ref, summary.name);
}

function belowZero(name: string, lowest: { cents: number; dateKey: DateKey }): string {
  return `That would take ${name} below zero (${formatSignedMoney(lowest.cents)} on ${formatQuoteDay(lowest.dateKey)}).`;
}

export async function recordTransfer(input: TransferInput, actor: FinanceActor): Promise<string> {
  const today = todayKey();
  const { accounts, recorded } = await readAll();
  const from = accounts.find((account) => account.ref === input.fromRef) ?? null;
  const to = accounts.find((account) => account.ref === input.toRef) ?? null;
  const problem = transferProblem(input, from, to, today);
  if (problem || !from || !to) throw new InputError(problem ?? "Choose both accounts.");

  const note = input.note.trim();
  const candidate = {
    ref: "PENDING",
    accountRef: from.ref,
    toAccountRef: to.ref,
    direction: "out" as const,
    kind: "transfer" as const,
    amountCents: input.amountCents,
    paidOn: input.paidOn,
    note,
    status: "recorded" as const,
  };
  const lowest = lowestBalance(from, [...recorded, candidate], input.paidOn, today);
  if (lowest.cents < 0) throw new InputError(belowZero(from.name, lowest));

  const collection = await payments();
  const ref = await insertWithRef(collection, "PY-", 1001, (next) =>
    collection.insertOne({ ...candidate, ref: next, createdBy: actor.name, createdAt: new Date() }),
  );
  await logFinanceEvent(
    actor,
    "transfer.recorded",
    ref,
    `${formatMoney(input.amountCents)} from ${from.name} to ${to.name} on ${formatQuoteDay(input.paidOn)}`,
  );
  return ref;
}

/**
 * Voids a payment recorded by mistake. Kept, marked void, with the reason.
 * Refused when taking it back would leave an account below zero, which would
 * mean money already spent from it. The Accounts screen voids transfers and
 * adjustments; a bill or invoice voids its own payments, so each is undone
 * where the person can see what it settled.
 */
export async function voidPayment(
  ref: string,
  reason: string,
  actor: FinanceActor,
  kinds: PaymentDocument["kind"][] = ["transfer", "other"],
): Promise<PaymentDocument> {
  const why = reason.trim();
  if (why.length < 5) throw new InputError("Say why this is being voided.");
  const { accounts, recorded } = await readAll();
  const target = recorded.find((payment) => payment.ref === ref);
  if (!target) throw new InputError("That payment is already void or no longer on record.");
  if (!kinds.includes(target.kind)) {
    throw new InputError(
      target.kind === "transfer" || target.kind === "other"
        ? "Transfers and adjustments are voided from the account."
        : "Collections and bill payments are voided from the invoice or bill they settle.",
    );
  }

  const remaining = recorded.filter((payment) => payment.ref !== ref);
  const today = todayKey();
  for (const accountRef of [target.accountRef, target.toAccountRef]) {
    const account = accounts.find((entry) => entry.ref === accountRef);
    if (!account) continue;
    const lowest = lowestBalance(account, remaining, target.paidOn, today);
    if (lowest.cents < 0) throw new InputError(belowZero(account.name, lowest));
  }

  const collection = await payments();
  const result = await collection.updateOne({ ref, status: "recorded" }, { $set: { status: "void", voidReason: why } });
  if (result.modifiedCount === 0) throw new InputError("That payment is already void.");
  await logFinanceEvent(actor, "payment.voided", ref, `${formatMoney(target.amountCents)} · ${why}`);
  return target;
}

/** Checks money can arrive in an account on a day: the account is in use and existed then. */
export async function assertCanPayIn(accountRef: string, paidOn: DateKey): Promise<MoneyAccount> {
  const account = await findAccount(accountRef);
  if (!account) throw new InputError("Choose the account it was paid into.");
  if (!account.active) throw new InputError(`${account.name} is no longer used.`);
  if (paidOn < account.openingDate) {
    throw new InputError(`${account.name} has no balance on record before ${formatQuoteDay(account.openingDate)}.`);
  }
  return account;
}

/**
 * Checks money can leave an account on a day, before anything is written:
 * the account is in use, existed then, and stays at or above zero on that day
 * and every day after.
 */
export async function assertCanPayOut(accountRef: string, amountCents: number, paidOn: DateKey): Promise<MoneyAccount> {
  const { accounts, recorded } = await readAll();
  const account = accounts.find((entry) => entry.ref === accountRef);
  if (!account) throw new InputError("Choose the account it was paid from.");
  if (!account.active) throw new InputError(`${account.name} is no longer used.`);
  if (paidOn < account.openingDate) {
    throw new InputError(`${account.name} has no balance on record before ${formatQuoteDay(account.openingDate)}.`);
  }
  const candidate = {
    ref: "PENDING",
    accountRef,
    direction: "out" as const,
    kind: "bill" as const,
    amountCents,
    paidOn,
    note: "",
    status: "recorded" as const,
  };
  const lowest = lowestBalance(account, [...recorded, candidate], paidOn, todayKey());
  if (lowest.cents < 0) throw new InputError(belowZero(account.name, lowest));
  return account;
}

export async function recordCount(
  accountRef: string,
  asOf: DateKey,
  countedCents: number,
  actor: FinanceActor,
): Promise<{ ref: string; differenceCents: number }> {
  const { accounts, recorded } = await readAll();
  const account = accounts.find((entry) => entry.ref === accountRef);
  if (!account) throw new InputError("That account is no longer on record.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || asOf > todayKey()) throw new InputError("Choose a day that has already come.");
  if (asOf < account.openingDate) throw new InputError(`${account.name} has no balance on record before ${formatQuoteDay(account.openingDate)}.`);
  if (!isAmount(countedCents, true)) throw new InputError("Enter the counted or statement balance, zero or more.");

  const bookCents = figureOf(accountRows(account, recorded, asOf)).cents;
  const { differenceCents, status } = reconcile(bookCents, countedCents);
  const collection = await reconciliations();
  const ref = await insertWithRef(collection, "RC-", 1001, (next) =>
    collection.insertOne({
      ref: next,
      accountRef,
      asOf,
      countedCents,
      bookCents,
      differenceCents,
      status,
      createdBy: actor.name,
      createdAt: new Date(),
    }),
  );
  await logFinanceEvent(
    actor,
    "count.recorded",
    ref,
    `${account.name} on ${formatQuoteDay(asOf)}: counted ${formatMoney(countedCents)}, book ${formatMoney(bookCents)}`,
  );
  return { ref, differenceCents };
}

/**
 * An administrator explains an open difference. With `adjust`, the book is
 * brought to the count by an `other` payment for the difference on the count's
 * day, which moves the balance and is never income or expense. Without it the
 * explanation stands alone (a deposit still in transit, a payment recorded
 * since). Safe to repeat: an adjustment already made for this count is reused.
 */
export async function resolveCount(
  ref: string,
  resolution: string,
  adjust: boolean,
  actor: FinanceActor,
): Promise<void> {
  const text = resolution.trim();
  if (text.length < MIN_RESOLUTION) {
    throw new InputError(`Say what the difference was and why (at least ${MIN_RESOLUTION} characters).`);
  }
  const countCollection = await reconciliations();
  const count = await countCollection.findOne({ ref });
  if (!count) throw new InputError("That count is no longer on record.");
  if (count.status !== "open") throw new InputError("That count has no open difference.");

  if (adjust) {
    const { accounts, recorded } = await readAll();
    const account = accounts.find((entry) => entry.ref === count.accountRef);
    if (!account) throw new InputError("That account is no longer on record.");
    const already = recorded.find((payment) => payment.reconciliationRef === ref);
    if (!already) {
      const adjustment: Omit<PaymentDocument, "businessId" | "ref" | "createdAt" | "createdBy"> = {
        accountRef: account.ref,
        direction: count.differenceCents > 0 ? "in" : "out",
        kind: "other",
        amountCents: Math.abs(count.differenceCents),
        paidOn: count.asOf,
        reconciliationRef: ref,
        note: `Adjustment to count ${ref}`,
        status: "recorded",
      };
      const lowest = lowestBalance(account, [...recorded, { ...adjustment, ref: "PENDING" }], count.asOf, todayKey());
      if (lowest.cents < 0) throw new InputError(belowZero(account.name, lowest));
      const paymentCollection = await payments();
      const paymentRef = await insertWithRef(paymentCollection, "PY-", 1001, (next) =>
        paymentCollection.insertOne({ ...adjustment, ref: next, createdBy: actor.name, createdAt: new Date() }),
      );
      await logFinanceEvent(actor, "count.adjusted", paymentRef, `${account.name} ${formatSignedMoney(count.differenceCents)} to match ${ref}`);
    }
  }

  const result = await countCollection.updateOne(
    { ref, status: "open" },
    { $set: { status: "resolved", resolution: text, resolvedBy: actor.name, resolvedAt: new Date() } },
  );
  if (result.modifiedCount === 0) throw new InputError("Someone resolved this count a moment ago.");
  await logFinanceEvent(actor, "count.resolved", ref, adjust ? `Book adjusted. ${text}` : text);
}
