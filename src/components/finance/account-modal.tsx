"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createAccountAction, updateAccountAction } from "@/app/actions/finance";
import { Field, INPUT, Modal, Notice, SELECT } from "@/components/forms/form-kit";
import { useToast } from "@/components/layout/toast-provider";
import { Button } from "@/components/ui";
import { accountInputProblem } from "@/lib/finance";
import { amountInput, parseAmount } from "@/lib/quotations";
import type { BankAccountKind, MoneyAccountSummary, MoneyAccountType } from "@/types";

type Choice = "cash" | "bank-account" | "passbook" | "ewallet";

const CHOICES: { value: Choice; label: string }[] = [
  { value: "cash", label: "Cash on hand" },
  { value: "bank-account", label: "Bank account" },
  { value: "passbook", label: "Passbook" },
  { value: "ewallet", label: "E-wallet" },
];

function split(choice: Choice): { type: MoneyAccountType; bankKind: BankAccountKind | null } {
  if (choice === "bank-account") return { type: "bank", bankKind: "account" };
  if (choice === "passbook") return { type: "bank", bankKind: "passbook" };
  return { type: choice, bankKind: null };
}

/** Adds an account, or edits one when `account` is given. Administrators only. */
export function AccountModal({
  account,
  today,
  onClose,
  onSaved,
}: {
  account: MoneyAccountSummary | null;
  today: string;
  onClose: () => void;
  onSaved: (ref: string) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [choice, setChoice] = useState<Choice>("cash");
  const [name, setName] = useState(account?.name ?? "");
  const [institution, setInstitution] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [opening, setOpening] = useState(account ? amountInput(account.openingBalanceCents) : "");
  const [openingDate, setOpeningDate] = useState(account?.openingDate ?? today);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const { type, bankKind } = split(choice);
  const openingLocked = Boolean(account?.hasActivity);

  const save = () => {
    const openingBalanceCents = parseAmount(opening) ?? 0;
    if (parseAmount(opening) === undefined) {
      setError("The opening balance must be an amount, such as 25000 or 25,000.00.");
      return;
    }
    if (!account) {
      const problem = accountInputProblem({ type, bankKind, name, institution, accountNumber, openingBalanceCents, openingDate }, today);
      if (problem) {
        setError(problem);
        return;
      }
    }
    setError(null);
    startTransition(async () => {
      const result = account
        ? { ...(await updateAccountAction(account.ref, { name, openingBalanceCents, openingDate })), ref: account.ref }
        : await createAccountAction({ type, bankKind, name, institution, accountNumber, openingBalanceCents, openingDate });
      if (!result.ok) {
        setError(result.error);
        toast({ tone: "error", title: "Account not saved", description: result.error, key: "finance-account" });
        return;
      }
      toast({
        tone: "success",
        title: account ? `${name.trim()} saved` : `${name.trim()} added`,
        description: account ? undefined : `Saved as ${result.ref}.`,
        key: "finance-account",
      });
      router.refresh();
      onSaved(result.ref);
    });
  };

  return (
    <Modal
      title={account ? `Edit ${account.name}` : "New account"}
      icon="wallet"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button icon="check" onClick={save} disabled={pending}>
            {pending ? "Saving…" : account ? "Save" : "Add account"}
          </Button>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      {!account && (
        <Field
          label="Kind"
          required
          hint={
            choice === "passbook" || choice === "bank-account"
              ? "A passbook and the bank account it records are the same money. Enter each real account once, as whichever you check it with."
              : undefined
          }
        >
          <select style={SELECT} value={choice} onChange={(event) => setChoice(event.target.value as Choice)}>
            {CHOICES.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Name" required>
        <input
          style={INPUT}
          value={name}
          maxLength={80}
          placeholder={type === "cash" ? "Petty cash" : type === "bank" ? "BDO savings" : "GCash"}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      {!account && type !== "cash" && (
        <div className="grid grid-cols-1 gap-3.5 wide:grid-cols-2">
          <Field label={type === "bank" ? "Bank" : "Provider"} required>
            <input
              style={INPUT}
              value={institution}
              maxLength={80}
              placeholder={type === "bank" ? "BDO" : "GCash"}
              onChange={(event) => setInstitution(event.target.value)}
            />
          </Field>
          <Field
            label={type === "bank" ? "Account number" : "Mobile number"}
            required
            hint="Used to stop the same account being added twice. Only the last four digits are kept."
          >
            <input
              style={INPUT}
              inputMode="numeric"
              autoComplete="off"
              value={accountNumber}
              maxLength={40}
              onChange={(event) => setAccountNumber(event.target.value)}
            />
          </Field>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3.5 wide:grid-cols-2">
        <Field
          label="Opening balance"
          required
          hint={openingLocked ? "Fixed: money has moved through this account or it has been counted." : undefined}
        >
          <input
            style={INPUT}
            inputMode="decimal"
            value={opening}
            disabled={openingLocked}
            placeholder="0.00"
            onChange={(event) => setOpening(event.target.value)}
          />
        </Field>
        <Field label="Balance as of" required hint={openingLocked ? undefined : "The start of this day, before anything that day."}>
          <input
            style={INPUT}
            type="date"
            value={openingDate}
            max={today}
            disabled={openingLocked}
            onChange={(event) => setOpeningDate(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
