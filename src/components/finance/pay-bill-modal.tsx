"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { payBillAction } from "@/app/actions/finance";
import { Field, INPUT, Modal, Notice, SELECT } from "@/components/forms/form-kit";
import { useToast } from "@/components/layout/toast-provider";
import { Button } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { amountInput, parseAmount } from "@/lib/quotations";
import type { BillSummary, MoneyAccountSummary } from "@/types";

/** Money paid on a bill, in full or in part, out of one of the business's accounts. */
export function PayBillModal({
  bill,
  accounts,
  today,
  onClose,
}: {
  bill: BillSummary;
  /** Active accounts. */
  accounts: MoneyAccountSummary[];
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
    setError(null);
    startTransition(async () => {
      const result = await payBillAction(bill.ref, { accountRef, amountCents, paidOn, note });
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
    </Modal>
  );
}
