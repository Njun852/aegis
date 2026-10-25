import "server-only";

import { manilaDateKey } from "@/lib/booking-slots";
import { MONEY_NATURES, feeKindLabel, findDuplicates, moneyEntryProblem, moneyNatureLabel } from "@/lib/finance";
import { formatMoney } from "@/lib/format";
import { formatQuoteDay } from "@/lib/quotations";
import { DuplicateError, logFinanceEvent, moneyAccounts, payments, recordAudit, toPaymentView, unconfirmed } from "./finance";
import { assertCanPayIn, assertCanPayOut } from "./finance-accounts";
import { createBill } from "./finance-bills";
import { checkFee } from "./finance-fees";
import { createInvoice } from "./finance-invoices";
import { InputError, insertWithRef } from "./refs";
import type { FinanceActor, MoneyEntryInput, PaymentDetail, PaymentDocument } from "@/types";

/**
 * Money In and Money Out entered on their own, without an invoice or bill
 * already on file. A sale is posted as an invoice collected the same day and
 * an expense as a bill paid the same day, so Income, Receivables, Payables
 * and the month-end reports treat them exactly like any other. Everything
 * else (owner's money, loans, other) is an `other` payment, which moves one
 * balance and is never income or expense.
 */

function todayKey(): string {
  return manilaDateKey(new Date());
}

/** Where the entry landed: the invoice, the bill or the payment, for the screen to open. */
export type MoneyEntryResult = { kind: "invoice" | "bill" | "payment"; ref: string };

export async function recordMoney(input: MoneyEntryInput, actor: FinanceActor): Promise<MoneyEntryResult> {
  const problem = moneyEntryProblem(input, todayKey());
  if (problem) throw new InputError(problem);
  const nature = MONEY_NATURES.find((entry) => entry.key === input.nature)!;
  const description = input.description.trim();

  if (nature.key === "sale") {
    const ref = await createInvoice(
      {
        customerName: input.party,
        customerRef: null,
        jobOrderRef: null,
        number: input.reference,
        invoiceDate: input.paidOn,
        dueDate: input.paidOn,
        amountCents: input.amountCents,
        responsiblePerson: actor.name,
        remarks: description,
        nextFollowUpDate: null,
        collectedInto: { accountRef: input.accountRef, paidOn: input.paidOn, fee: input.fee },
        confirmedDuplicates: input.confirmedDuplicates,
      },
      actor,
    );
    return { kind: "invoice", ref };
  }
  if (nature.key === "expense") {
    const ref = await createBill(
      {
        payee: input.party,
        supplierRef: null,
        receiptRef: null,
        reference: input.reference,
        billDate: input.paidOn,
        dueDate: input.paidOn,
        amountCents: input.amountCents,
        category: input.category!,
        responsiblePerson: actor.name,
        remarks: description,
        paidFrom: { accountRef: input.accountRef, paidOn: input.paidOn, fee: input.fee },
        confirmedDuplicates: input.confirmedDuplicates,
      },
      actor,
    );
    return { kind: "bill", ref };
  }

  // Owner's money, a loan, other: one payment that moves one balance.
  const fee = await checkFee(input.fee, input.amountCents, input.direction);
  const account =
    input.direction === "in"
      ? await assertCanPayIn(input.accountRef, input.paidOn)
      : await assertCanPayOut(input.accountRef, input.amountCents + (fee?.cents ?? 0), input.paidOn);

  const collection = await payments();
  const party = input.party.trim();
  const reference = input.reference.trim();
  const live = await collection.find({ kind: "other", status: "recorded", nature: { $in: MONEY_NATURES.map((entry) => entry.key) } }).toArray();
  const matches = findDuplicates(
    { party, reference, dateKey: input.paidOn, amountCents: input.amountCents },
    live
      .filter((doc) => doc.direction === input.direction)
      .map((doc) => ({
        ref: doc.ref,
        party: doc.party ?? "",
        reference: doc.reference ?? "",
        dateKey: doc.paidOn,
        amountCents: doc.amountCents,
        label: [moneyNatureLabel(doc.nature!), doc.party, doc.reference, formatMoney(doc.amountCents), formatQuoteDay(doc.paidOn)].filter(Boolean).join(" · "),
      })),
  );
  if (unconfirmed(matches, input.confirmedDuplicates).length > 0) throw new DuplicateError(matches, "entry");

  const ref = await insertWithRef(collection, "PY-", 1001, (next) =>
    collection.insertOne({
      ref: next,
      accountRef: account.ref,
      direction: input.direction,
      kind: "other",
      amountCents: input.amountCents,
      ...(fee ? { fee } : {}),
      paidOn: input.paidOn,
      nature: nature.key,
      ...(party ? { party } : {}),
      ...(reference ? { reference } : {}),
      note: description,
      status: "recorded",
      createdBy: actor.name,
      createdAt: new Date(),
    }),
  );
  await logFinanceEvent(
    actor,
    input.direction === "in" ? "money.in" : "money.out",
    ref,
    [
      `${nature.label}: ${formatMoney(input.amountCents)} ${input.direction === "in" ? "into" : "from"} ${account.name} on ${formatQuoteDay(input.paidOn)}`,
      party,
      reference && `ref. ${reference}`,
      fee && `${feeKindLabel(fee.kind).toLowerCase()} ${formatMoney(fee.cents)}`,
      matches.length > 0 && `saved past the duplicate warning for ${matches.map((match) => match.ref).join(", ")}`,
    ]
      .filter(Boolean)
      .join(", "),
  );
  return { kind: "payment", ref };
}

/** One payment with both accounts' names and its audit line, for the payment drawer. */
export async function findPaymentDetail(ref: string): Promise<PaymentDetail | null> {
  const [paymentCollection, accountCollection] = await Promise.all([payments(), moneyAccounts()]);
  const [doc, accounts] = await Promise.all([paymentCollection.findOne({ ref }), accountCollection.find().toArray()]);
  if (!doc) return null;
  const names = new Map(accounts.map((account) => [account.ref, account.name]));
  return {
    ...toPaymentView(doc, names),
    toAccountName: doc.toAccountRef ? (names.get(doc.toAccountRef) ?? doc.toAccountRef) : null,
    audit: recordAudit(doc, paymentSource(doc)),
  };
}

function paymentSource(doc: PaymentDocument): string {
  if (doc.invoiceRef) return `Collection on invoice ${doc.invoiceRef}`;
  if (doc.billRef) return `Payment on bill ${doc.billRef}`;
  if (doc.reconciliationRef) return `Adjustment for count ${doc.reconciliationRef}`;
  if (doc.kind === "transfer") return "Transfer between accounts";
  return doc.nature ? `Money ${doc.direction} entry` : "Entered in Finance";
}
