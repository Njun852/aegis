import "server-only";

import { describeFeeRule, feeKindLabel, feeProblem, feeRuleProblem, fieldChanges } from "@/lib/finance";
import { feeRules, logFinanceEvent } from "./finance";
import { InputError, insertWithRef } from "./refs";
import type { FeeRule, FeeRuleDocument, FeeRuleInput, FinanceActor, PaymentFee, PaymentFeeInput } from "@/types";

/**
 * Fee rules: card MDR, bank charges and e-wallet fees, kept by
 * administrators. A rule only fills in the fee on a payment form; the fee a
 * payment records is what the person confirms, since the bank's statement is
 * what counts. Rules are set aside, never deleted, so a payment's `ruleRef`
 * always still names one.
 */

function toRule(doc: FeeRuleDocument): FeeRule {
  return {
    ref: doc.ref,
    name: doc.name,
    kind: doc.kind,
    percentBps: doc.percentBps,
    fixedCents: doc.fixedCents,
    active: doc.active,
  };
}

/** Every rule, in use first, then by name. */
export async function listFeeRules(): Promise<FeeRule[]> {
  const collection = await feeRules();
  const docs = await collection.find().sort({ active: -1, name: 1 }).toArray();
  return docs.map(toRule);
}

export async function createFeeRule(input: FeeRuleInput, actor: FinanceActor): Promise<string> {
  const problem = feeRuleProblem(input);
  if (problem) throw new InputError(problem);
  const collection = await feeRules();
  const now = new Date();
  const ref = await insertWithRef(collection, "FR-", 1001, (next) =>
    collection.insertOne({
      ref: next,
      name: input.name.trim(),
      kind: input.kind,
      percentBps: input.percentBps,
      fixedCents: input.fixedCents,
      active: true,
      createdBy: actor.name,
      createdAt: now,
      updatedAt: now,
    }),
  );
  await logFinanceEvent(actor, "fee-rule.created", ref, `${input.name.trim()}: ${feeKindLabel(input.kind)}, ${describeFeeRule(input)}`);
  return ref;
}

/** A changed rule fills in new payments only; payments already recorded keep the fee they were given. */
export async function updateFeeRule(ref: string, input: FeeRuleInput & { active: boolean }, actor: FinanceActor): Promise<void> {
  const problem = feeRuleProblem(input);
  if (problem) throw new InputError(problem);
  const collection = await feeRules();
  const doc = await collection.findOne({ ref });
  if (!doc) throw new InputError("That fee rule is no longer on record.");

  const changes = fieldChanges([
    { field: "Name", from: doc.name, to: input.name.trim() },
    { field: "Kind", from: feeKindLabel(doc.kind), to: feeKindLabel(input.kind) },
    { field: "Fee", from: describeFeeRule(doc), to: describeFeeRule(input) },
    { field: "In use", from: doc.active ? "Yes" : "No", to: input.active ? "Yes" : "No" },
  ]);
  if (changes.length === 0) return;
  await collection.updateOne(
    { ref },
    {
      $set: {
        name: input.name.trim(),
        kind: input.kind,
        percentBps: input.percentBps,
        fixedCents: input.fixedCents,
        active: input.active,
        updatedBy: actor.name,
        updatedAt: new Date(),
      },
    },
  );
  await logFinanceEvent(actor, "fee-rule.updated", ref, changes.map((change) => `${change.field}: ${change.to}`).join(", "), {
    changes,
    reason: "",
  });
}

/**
 * The fee a payment will carry, checked before anything is written: a real
 * amount of a known kind, less than the gross for money in, and from a rule
 * that is on record when one is named. Null when there is no fee.
 */
export async function checkFee(
  input: PaymentFeeInput | null,
  grossCents: number,
  direction: "in" | "out",
): Promise<PaymentFee | null> {
  if (!input) return null;
  const problem = feeProblem(input, grossCents, direction);
  if (problem) throw new InputError(problem);
  if (input.ruleRef) {
    const collection = await feeRules();
    if (!(await collection.findOne({ ref: input.ruleRef }))) throw new InputError("That fee rule is no longer on record.");
  }
  return { cents: input.cents, kind: input.kind, ...(input.ruleRef ? { ruleRef: input.ruleRef } : {}) };
}
