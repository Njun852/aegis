"use client";

import { useState } from "react";
import { Field, INPUT, SELECT } from "@/components/forms/form-kit";
import { FEE_KINDS, describeFeeRule, feeFromRule, feeKindLabel } from "@/lib/finance";
import { formatMoney } from "@/lib/format";
import { amountInput, parseAmount } from "@/lib/quotations";
import type { FeeKind, FeeRule, PaymentFeeInput } from "@/types";

const NONE = "";
const OTHER = "other";

/**
 * The fee on a payment: none, one worked out from a rule, or one typed in.
 * A rule fills the amount in as the gross changes until the person types
 * their own, since the bank's statement is what counts. Shows Gross / Fee /
 * Net under the fields so what reaches or leaves the account is plain.
 *
 * `fee` is null for no fee, and `problem` says what is wrong with a typed one.
 * `initial` starts it on a typed fee, such as one read off a receipt.
 */
export function useFee(
  rules: FeeRule[],
  grossCents: number,
  direction: "in" | "out",
  initial: { kind: FeeKind; cents: number } | null = null,
) {
  const active = rules.filter((rule) => rule.active);
  const [choice, setChoice] = useState(initial ? OTHER : NONE);
  const [kind, setKind] = useState<FeeKind>(initial?.kind ?? "bank");
  const [typed, setTyped] = useState<string | null>(initial ? amountInput(initial.cents) : null);

  const rule = active.find((entry) => entry.ref === choice) ?? null;
  const worked = rule ? feeFromRule(rule, grossCents) : 0;
  const text = typed ?? (rule ? amountInput(worked) : "");
  const cents = choice === NONE ? 0 : parseAmount(text) ?? Number.NaN;

  const fee: PaymentFeeInput | null =
    choice === NONE ? null : { cents, kind: rule ? rule.kind : kind, ruleRef: rule ? rule.ref : null };
  const problem =
    choice === NONE
      ? null
      : !Number.isInteger(cents) || cents <= 0
        ? "Enter the fee, or choose no fee."
        : direction === "in" && cents >= grossCents
          ? "The fee cannot be the whole amount received or more."
          : null;
  const net = direction === "in" ? grossCents - (fee?.cents || 0) : grossCents + (fee?.cents || 0);

  const fields = (
    <div className="flex flex-col gap-2.5" style={{ padding: "10px 12px", border: "1px solid var(--border-default)", borderRadius: 12 }}>
      <div className="grid grid-cols-1 gap-3.5 wide:grid-cols-2">
        <Field
          label="Fee"
          hint={
            rule
              ? `${feeKindLabel(rule.kind)}: ${describeFeeRule(rule)}. Change the amount if the statement shows another.`
              : choice === OTHER
                ? FEE_KINDS.find((entry) => entry.key === kind)?.hint
                : direction === "in"
                  ? "Card MDR or an e-wallet fee taken before the money arrives."
                  : "A bank charge or e-wallet fee paid on top."
          }
        >
          <select
            style={SELECT}
            value={choice}
            onChange={(event) => {
              setChoice(event.target.value);
              setTyped(null);
            }}
          >
            <option value={NONE}>No fee</option>
            {active.map((entry) => (
              <option key={entry.ref} value={entry.ref}>
                {entry.name} · {describeFeeRule(entry)}
              </option>
            ))}
            <option value={OTHER}>Other fee (type it in)</option>
          </select>
        </Field>
        {choice !== NONE && (
          <Field label="Fee amount" required>
            <input style={INPUT} inputMode="decimal" value={text} placeholder="0.00" onChange={(event) => setTyped(event.target.value)} />
          </Field>
        )}
        {choice === OTHER && (
          <Field label="Kind of fee" required>
            <select style={SELECT} value={kind} onChange={(event) => setKind(event.target.value as FeeKind)}>
              {FEE_KINDS.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.label}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      {choice !== NONE && grossCents > 0 && (
        <div className="grid grid-cols-3 gap-2" style={{ fontVariantNumeric: "tabular-nums" }}>
          {[
            { label: "Gross", value: grossCents },
            { label: "Fee", value: Number.isFinite(cents) ? cents : 0 },
            { label: direction === "in" ? "Net deposited" : "Total out", value: net },
          ].map((figure) => (
            <span key={figure.label} className="flex flex-col">
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{figure.label}</span>
              <span style={{ fontSize: "13px", fontWeight: 600 }}>{Number.isFinite(figure.value) ? formatMoney(figure.value) : "—"}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );

  return { fee, problem, fields };
}
