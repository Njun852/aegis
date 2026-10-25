"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { recordTransferAction } from "@/app/actions/finance";
import { Field, INPUT, Modal, Notice, SELECT } from "@/components/forms/form-kit";
import { useToast } from "@/components/layout/toast-provider";
import { Button } from "@/components/ui";
import { accountTypeLabel } from "@/lib/finance";
import { formatMoney } from "@/lib/format";
import { parseAmount } from "@/lib/quotations";
import { useFee } from "./fee-fields";
import type { FeeRule, MoneyAccountSummary } from "@/types";

/**
 * Money moved between two of the business's own accounts: cash banked, a
 * withdrawal for petty cash, an e-wallet cashed out. It changes where money
 * is, never how much there is, and is never income or expense. A fee for the
 * move (InstaPay, a GCash cash-out) is the one expense in it, paid by the
 * account the money leaves.
 */
export function TransferModal({
  accounts,
  feeRules,
  fromRef,
  today,
  onClose,
}: {
  /** Active accounts only. */
  accounts: MoneyAccountSummary[];
  feeRules: FeeRule[];
  fromRef: string;
  today: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [from, setFrom] = useState(fromRef || accounts[0]?.ref || "");
  const [to, setTo] = useState(accounts.find((account) => account.ref !== (fromRef || accounts[0]?.ref))?.ref ?? "");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(today);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const source = accounts.find((account) => account.ref === from);
  const target = accounts.find((account) => account.ref === to);
  const fee = useFee(feeRules, parseAmount(amount) || 0, "out");

  const save = () => {
    const amountCents = parseAmount(amount);
    if (!amountCents) {
      setError("Enter the amount moved, such as 5000 or 5,000.00.");
      return;
    }
    if (from === to) {
      setError("Choose two different accounts.");
      return;
    }
    if (fee.problem) {
      setError(fee.problem);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await recordTransferAction({ fromRef: from, toRef: to, amountCents, fee: fee.fee, paidOn, note });
      if (!result.ok) {
        setError(result.error);
        toast({ tone: "error", title: "Transfer not recorded", description: result.error, key: "finance-transfer" });
        return;
      }
      toast({
        tone: "success",
        title: "Transfer recorded",
        description: `${formatMoney(amountCents)} from ${source?.name} to ${target?.name}${
          fee.fee ? `, plus a ${formatMoney(fee.fee.cents)} fee from ${source?.name}` : ""
        } (${result.ref}).`,
        key: "finance-transfer",
      });
      router.refresh();
      onClose();
    });
  };

  const label = (account: MoneyAccountSummary) => `${account.name} · ${accountTypeLabel(account)}`;

  return (
    <Modal
      title="Transfer between accounts"
      icon="arrow-left-right"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button icon="check" onClick={save} disabled={pending || !from || !to}>
            {pending ? "Recording…" : "Record transfer"}
          </Button>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      <div className="grid grid-cols-1 gap-3.5 wide:grid-cols-2">
        <Field label="From" required hint={source ? `Holds ${formatMoney(source.balanceCents)} today.` : undefined}>
          <select style={SELECT} value={from} onChange={(event) => setFrom(event.target.value)}>
            {accounts.map((account) => (
              <option key={account.ref} value={account.ref}>
                {label(account)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="To" required>
          <select style={SELECT} value={to} onChange={(event) => setTo(event.target.value)}>
            {accounts.map((account) => (
              <option key={account.ref} value={account.ref} disabled={account.ref === from}>
                {label(account)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Amount" required>
          <input style={INPUT} inputMode="decimal" value={amount} placeholder="0.00" onChange={(event) => setAmount(event.target.value)} />
        </Field>
        <Field label="Date" required>
          <input style={INPUT} type="date" value={paidOn} max={today} onChange={(event) => setPaidOn(event.target.value)} />
        </Field>
      </div>
      <Field label="Note" hint="Deposit slip number, who carried it, what it was for.">
        <input style={INPUT} value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} />
      </Field>
      {fee.fields}
    </Modal>
  );
}
