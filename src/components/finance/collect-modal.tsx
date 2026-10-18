"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { collectInvoiceAction } from "@/app/actions/finance";
import { Field, INPUT, Modal, Notice, SELECT } from "@/components/forms/form-kit";
import { useToast } from "@/components/layout/toast-provider";
import { Button } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { amountInput, parseAmount } from "@/lib/quotations";
import type { InvoiceSummary, MoneyAccountSummary } from "@/types";

/** Money a customer paid on an invoice, in full or in part, into one of the business's accounts. */
export function CollectModal({
  invoice,
  accounts,
  today,
  onClose,
}: {
  invoice: InvoiceSummary;
  /** Active accounts. */
  accounts: MoneyAccountSummary[];
  today: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [accountRef, setAccountRef] = useState(accounts[0]?.ref ?? "");
  const [amount, setAmount] = useState(amountInput(invoice.outstandingCents));
  const [paidOn, setPaidOn] = useState(today);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    const amountCents = parseAmount(amount);
    if (!amountCents) {
      setError("Enter the amount collected.");
      return;
    }
    if (amountCents > invoice.outstandingCents) {
      setError(`That is more than the ${formatMoney(invoice.outstandingCents)} still owed.`);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await collectInvoiceAction(invoice.ref, { accountRef, amountCents, paidOn, note });
      if (!result.ok) {
        setError(result.error);
        toast({ tone: "error", title: "Collection not recorded", description: result.error, key: "finance-collect" });
        return;
      }
      const left = invoice.outstandingCents - amountCents;
      toast({
        tone: "success",
        title: left === 0 ? `Invoice ${invoice.number} collected in full` : `${formatMoney(amountCents)} collected on invoice ${invoice.number}`,
        description: left === 0 ? `Recorded as ${result.ref}.` : `${formatMoney(left)} still owed. Recorded as ${result.ref}.`,
        key: "finance-collect",
      });
      router.refresh();
      onClose();
    });
  };

  return (
    <Modal
      title={`Collect from ${invoice.customerName}`}
      icon="wallet"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button icon="check" onClick={save} disabled={pending || !accountRef}>
            {pending ? "Recording…" : "Record collection"}
          </Button>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      {accounts.length === 0 && <Notice tone="warning">Add the account the money went into on the Accounts tab first.</Notice>}
      <div style={{ fontSize: "12.5px", color: "var(--text-secondary)" }}>
        Invoice {invoice.number} · {formatMoney(invoice.outstandingCents)} still owed of {formatMoney(invoice.amountCents)}
      </div>
      <div className="grid grid-cols-1 gap-3.5 wide:grid-cols-2">
        <Field label="Paid into" required>
          <select style={SELECT} value={accountRef} onChange={(event) => setAccountRef(event.target.value)}>
            {accounts.map((account) => (
              <option key={account.ref} value={account.ref}>
                {account.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Amount" required hint="Less than the full amount records a part payment.">
          <input style={INPUT} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </Field>
        <Field label="Collected on" required>
          <input style={INPUT} type="date" value={paidOn} min={invoice.invoiceDate} max={today} onChange={(event) => setPaidOn(event.target.value)} />
        </Field>
        <Field label="Note" hint="Official receipt number, cheque number, GCash reference.">
          <input style={INPUT} value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
