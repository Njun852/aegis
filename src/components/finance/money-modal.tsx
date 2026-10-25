"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { recordMoneyAction } from "@/app/actions/finance";
import { Field, INPUT, Modal, Notice, SELECT } from "@/components/forms/form-kit";
import { useToast } from "@/components/layout/toast-provider";
import { Button } from "@/components/ui";
import { EXPENSE_CATEGORIES, MONEY_NATURES, moneyEntryProblem } from "@/lib/finance";
import { monthLabel } from "@/lib/finance-periods";
import { formatMoney } from "@/lib/format";
import { parseAmount } from "@/lib/quotations";
import { DuplicateNotice } from "./duplicate-notice";
import { useFee } from "./fee-fields";
import type { DuplicateMatch, ExpenseCategory, FeeRule, MoneyAccountSummary, MoneyNature } from "@/types";

/**
 * Money In or Money Out entered on its own: a walk-in sale, an expense paid on
 * the spot, the owner's money, a loan. The form says before saving whether it
 * counts as income, as an expense, or as neither; a sale or an expense is
 * posted as an invoice or bill settled the same day and opens there.
 */
export function MoneyModal({
  accounts,
  feeRules,
  accountRef,
  today,
  onClose,
}: {
  /** Active accounts. */
  accounts: MoneyAccountSummary[];
  feeRules: FeeRule[];
  /** The account to start on, or "" for the first. */
  accountRef: string;
  today: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [nature, setNature] = useState<MoneyNature>("sale");
  const [account, setAccount] = useState(accountRef || accounts[0]?.ref || "");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(today);
  const [party, setParty] = useState("");
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("other");
  const [duplicates, setDuplicates] = useState<DuplicateMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const entry = MONEY_NATURES.find((item) => item.key === nature)!;
  const amountCents = parseAmount(amount) || 0;
  const fee = useFee(feeRules, amountCents, direction);
  const chosen = accounts.find((item) => item.ref === account);
  const month = /^\d{4}-\d{2}-\d{2}$/.test(paidOn) ? monthLabel(paidOn.slice(0, 7)) : "the month";

  const turn = (next: "in" | "out") => {
    setDirection(next);
    setNature(next === "in" ? "sale" : "expense");
    setDuplicates(null);
  };

  const save = (confirmedDuplicates: string[] = []) => {
    const input = {
      direction,
      nature,
      accountRef: account,
      amountCents,
      fee: fee.fee,
      paidOn,
      party,
      reference,
      description,
      category: nature === "expense" ? category : null,
      confirmedDuplicates,
    };
    const problem = moneyEntryProblem(input, today) ?? fee.problem;
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await recordMoneyAction(input);
      if (!result.ok) {
        setDuplicates(result.duplicates ?? null);
        setError(result.duplicates ? null : result.error);
        toast({ tone: "error", title: `Money ${direction} not recorded`, description: result.error, key: "finance-money" });
        return;
      }
      const moved = direction === "in" ? amountCents - (fee.fee?.cents ?? 0) : amountCents + (fee.fee?.cents ?? 0);
      toast({
        tone: "success",
        title: `${entry.label} recorded (${result.ref})`,
        description: [
          `${formatMoney(moved)} ${direction === "in" ? "into" : "out of"} ${chosen?.name ?? "the account"}.`,
          entry.effect === "income"
            ? `Counted as a sale in ${month}.`
            : entry.effect === "expense"
              ? `Counted as a cost in ${month}.`
              : "Not income or expense: it moves the balance only.",
        ].join(" "),
        key: "finance-money",
        durationMs: 9000,
      });
      onClose();
      router.push(
        result.kind === "invoice"
          ? `/finance?tab=receivables&invoice=${encodeURIComponent(result.ref)}`
          : result.kind === "bill"
            ? `/finance?tab=payables&bill=${encodeURIComponent(result.ref)}`
            : `/finance?tab=accounts&account=${encodeURIComponent(account)}&payment=${encodeURIComponent(result.ref)}`,
        { scroll: false },
      );
    });
  };

  const toggle = (value: "in" | "out", label: string) => (
    <Button variant={direction === value ? "primary" : "secondary"} icon={value === "in" ? "plus" : "minus"} onClick={() => turn(value)}>
      {label}
    </Button>
  );

  return (
    <Modal
      title="Money in / out"
      icon="wallet"
      width={620}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button icon="check" onClick={() => save()} disabled={pending || !account}>
            {pending ? "Recording…" : direction === "in" ? "Record money in" : "Record money out"}
          </Button>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      {duplicates && (
        <DuplicateNotice
          matches={duplicates}
          href={(ref) =>
            ref.startsWith("INV-")
              ? `/finance?tab=receivables&invoice=${encodeURIComponent(ref)}`
              : ref.startsWith("BL-")
                ? `/finance?tab=payables&bill=${encodeURIComponent(ref)}`
                : `/finance?tab=accounts&account=${encodeURIComponent(account)}&payment=${encodeURIComponent(ref)}`
          }
          pending={pending}
          onSaveAnyway={() => save(duplicates.map((match) => match.ref))}
        />
      )}
      {accounts.length === 0 && <Notice tone="warning">Add the cash box, bank account or e-wallet on the Accounts tab first.</Notice>}
      <div className="flex flex-wrap gap-2">
        {toggle("in", "Money in")}
        {toggle("out", "Money out")}
      </div>
      <div className="grid grid-cols-1 gap-3.5 wide:grid-cols-2">
        <Field label="What is it?" required>
          <select
            style={SELECT}
            value={nature}
            onChange={(event) => {
              setNature(event.target.value as MoneyNature);
              setDuplicates(null);
            }}
          >
            {MONEY_NATURES.filter((item) => item.direction === direction).map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={direction === "in" ? "Into" : "Paid from"} required>
          <select style={SELECT} value={account} onChange={(event) => setAccount(event.target.value)}>
            {accounts.map((item) => (
              <option key={item.ref} value={item.ref}>
                {item.name} · {formatMoney(item.balanceCents)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Notice tone={entry.effect === "none" ? "info" : "warning"}>
        {entry.hint}
        {entry.effect === "income" && " It is saved as an invoice collected the same day."}
        {entry.effect === "expense" && " It is saved as a bill paid the same day."}
      </Notice>
      <div className="grid grid-cols-1 gap-3.5 wide:grid-cols-2">
        <Field label="Amount" required hint={direction === "in" ? "The gross, before any fee." : "Before any fee charged on top."}>
          <input style={INPUT} inputMode="decimal" value={amount} placeholder="0.00" onChange={(event) => setAmount(event.target.value)} />
        </Field>
        <Field label="Date" required>
          <input style={INPUT} type="date" value={paidOn} max={today} onChange={(event) => setPaidOn(event.target.value)} />
        </Field>
        <Field label={entry.partyLabel} required={entry.effect !== "none" || nature.startsWith("loan")}>
          <input style={INPUT} value={party} maxLength={120} onChange={(event) => setParty(event.target.value)} />
        </Field>
        <Field
          label={nature === "sale" ? "Official receipt / invoice no." : "Reference no."}
          required={nature === "sale"}
          hint={nature === "sale" ? "Becomes the invoice number; each is used once." : "Receipt, deposit slip or transfer reference."}
        >
          <input style={INPUT} value={reference} maxLength={80} onChange={(event) => setReference(event.target.value)} />
        </Field>
        {nature === "expense" && (
          <Field label="Category" required>
            <select style={SELECT} value={category} onChange={(event) => setCategory(event.target.value as ExpenseCategory)}>
              {EXPENSE_CATEGORIES.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <Field label="Description" required={nature === "other-in" || nature === "other-out"}>
        <textarea rows={2} maxLength={600} style={{ ...INPUT, resize: "vertical" }} value={description} onChange={(event) => setDescription(event.target.value)} />
      </Field>
      {fee.fields}
      <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
        Attach the receipt or deposit slip from the record once it is saved.
      </span>
    </Modal>
  );
}
