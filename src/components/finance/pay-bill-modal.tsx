"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { payBillAction } from "@/app/actions/finance";
import { Field, INPUT, Modal, Notice, SELECT } from "@/components/forms/form-kit";
import { useToast } from "@/components/layout/toast-provider";
import { Button } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { amountInput, parseAmount } from "@/lib/quotations";
import { useFee } from "./fee-fields";
import type { BillSummary, FeeRule, MoneyAccountSummary } from "@/types";

/**
 * Money paid on a bill, in full or in part, out of one of the business's
 * accounts. A bank charge or e-wallet fee is paid on top: the bill is settled
 * by the amount, the account pays the amount and the fee.
 */
export function PayBillModal({
  bill,
  accounts,
  feeRules,
  today,
  onClose,
}: {
  bill: BillSummary;
  /** Active accounts. */
  accounts: MoneyAccountSummary[];
  feeRules: FeeRule[];
  today: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [accountRef, setAccountRef] = useState(accounts[0]?.ref ?? "");
  const [amount, setAmount] = useState(amountInput(bill.outstandingCents));
  const [paidOn, setPaidOn] = useState(today);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fee = useFee(feeRules, parseAmount(amount) || 0, "out");

  const save = () => {
    const amountCents = parseAmount(amount);
    if (!amountCents) {
      setError("Enter the amount paid.");
      return;
    }
    if (amountCents > bill.outstandingCents) {
      setError(`That is more than the ${formatMoney(bill.outstandingCents)} still owed.`);
      return;
    }
    if (fee.problem) {
      setError(fee.problem);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await payBillAction(bill.ref, { accountRef, amountCents, fee: fee.fee, paidOn, note });
      if (!result.ok) {
        setError(result.error);
        toast({ tone: "error", title: "Payment not recorded", description: result.error, key: "finance-pay" });
        return;
      }
      const left = bill.outstandingCents - amountCents;
      toast({
        tone: "success",
        title: left === 0 ? `${bill.ref} paid in full` : `${formatMoney(amountCents)} paid on ${bill.ref}`,
        description: left === 0 ? `Recorded as ${result.ref}.` : `${formatMoney(left)} still owed. Recorded as ${result.ref}.`,
        key: "finance-pay",
      });
      router.refresh();
      onClose();
    });
  };

  return (
    <Modal
      title={`Pay ${bill.payee}`}
      icon="credit-card"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button icon="check" onClick={save} disabled={pending || !accountRef}>
            {pending ? "Recording…" : "Record payment"}
          </Button>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      {accounts.length === 0 && <Notice tone="warning">Add the account it was paid from on the Accounts tab first.</Notice>}
      <div style={{ fontSize: "12.5px", color: "var(--text-secondary)" }}>
        {bill.ref}
        {bill.reference ? ` · ${bill.reference}` : ""} · {formatMoney(bill.outstandingCents)} still owed of {formatMoney(bill.amountCents)}
      </div>
      <div className="grid grid-cols-1 gap-3.5 wide:grid-cols-2">
        <Field label="Paid from" required>
          <select style={SELECT} value={accountRef} onChange={(event) => setAccountRef(event.target.value)}>
            {accounts.map((account) => (
              <option key={account.ref} value={account.ref}>
                {account.name} · {formatMoney(account.balanceCents)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Amount" required hint="Less than the full amount records a part payment.">
          <input style={INPUT} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </Field>
        <Field label="Paid on" required>
          <input style={INPUT} type="date" value={paidOn} min={bill.billDate} max={today} onChange={(event) => setPaidOn(event.target.value)} />
        </Field>
        <Field label="Note" hint="Cheque number, reference, who paid.">
          <input style={INPUT} value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </div>
      {fee.fields}
    </Modal>
  );
}
