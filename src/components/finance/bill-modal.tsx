"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createBillAction, updateBillAction } from "@/app/actions/finance";
import { Field, INPUT, Modal, Notice, SELECT } from "@/components/forms/form-kit";
import { useToast } from "@/components/layout/toast-provider";
import { Button } from "@/components/ui";
import { EXPENSE_CATEGORIES, billInputProblem, termsDays } from "@/lib/finance";
import { addDaysToKey } from "@/lib/finance-periods";
import { formatMoney } from "@/lib/format";
import { amountInput, formatQuoteDay, parseAmount } from "@/lib/quotations";
import { locked } from "./locked";
import type { BillSummary, ExpenseCategory, MoneyAccountSummary, PayeeOption, UnbilledReceipt } from "@/types";

/**
 * Enters a bill, edits one (`bill`), or makes one from a supplier receipt
 * (`receipt`). A bill already paid in full when it is entered, such as a cash
 * purchase, records the payment with it.
 */
export function BillModal({
  bill,
  receipt,
  payees,
  accounts,
  today,
  defaultPerson,
  onClose,
  onSaved,
}: {
  bill: BillSummary | null;
  receipt: UnbilledReceipt | null;
  payees: PayeeOption[];
  /** Active accounts, to pay from. */
  accounts: MoneyAccountSummary[];
  today: string;
  defaultPerson: string;
  onClose: () => void;
  onSaved: (ref: string) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [payee, setPayee] = useState(bill?.payee ?? receipt?.supplierName ?? "");
  const [reference, setReference] = useState(bill?.reference ?? receipt?.receiptNo ?? "");
  const [category, setCategory] = useState<ExpenseCategory>(bill?.category ?? "parts");
  const [billDate, setBillDate] = useState(bill?.billDate ?? receipt?.receivedDate ?? today);
  const [dueDate, setDueDate] = useState(bill?.dueDate ?? receipt?.suggestedDueDate ?? "");
  const [dueTouched, setDueTouched] = useState(Boolean(bill || receipt?.suggestedDueDate));
  const [amount, setAmount] = useState(bill ? amountInput(bill.amountCents) : receipt ? amountInput(receipt.totalCents) : "");
  const [person, setPerson] = useState(bill?.responsiblePerson ?? defaultPerson);
  const [remarks, setRemarks] = useState(bill?.remarks ?? "");
  const [paidNow, setPaidNow] = useState(false);
  const [paidFrom, setPaidFrom] = useState(accounts[0]?.ref ?? "");
  const [paidOn, setPaidOn] = useState(billDate);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const supplier = payees.find((entry) => entry.name.trim().toLowerCase() === payee.trim().toLowerCase()) ?? null;
  const supplierRef = receipt?.supplierRef ?? bill?.supplierRef ?? supplier?.ref ?? null;
  const terms = receipt?.terms ?? supplier?.terms ?? "";
  const days = termsDays(terms);
  const moneyLocked = Boolean(bill && bill.paidCents > 0);

  // Due date follows the bill date by the supplier's terms until a person sets it.
  const followTerms = (nextDate: string, nextTerms: string) => {
    const credit = termsDays(nextTerms);
    if (!dueTouched && credit !== null && /^\d{4}-\d{2}-\d{2}$/.test(nextDate)) setDueDate(addDaysToKey(nextDate, credit));
  };

  const save = () => {
    const amountCents = parseAmount(amount);
    if (!amountCents) {
      setError("Enter the bill's amount, such as 4500 or 4,500.00.");
      return;
    }
    const input = {
      payee,
      supplierRef,
      receiptRef: receipt?.ref ?? null,
      reference,
      billDate,
      dueDate,
      amountCents,
      category,
      responsiblePerson: person,
      remarks,
      paidFrom: !bill && paidNow ? { accountRef: paidFrom, paidOn } : null,
    };
    const problem = billInputProblem(input, today);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = bill ? { ...(await updateBillAction(bill.ref, input)), ref: bill.ref } : await createBillAction(input);
      if (!result.ok) {
        setError(result.error);
        toast({ tone: "error", title: "Bill not saved", description: result.error, key: "finance-bill" });
        return;
      }
      toast({
        tone: "success",
        title: bill ? `${result.ref} saved` : `Bill ${result.ref} added`,
        description: bill
          ? undefined
          : input.paidFrom
            ? `${formatMoney(amountCents)} to ${payee.trim()}, recorded as paid.`
            : `${formatMoney(amountCents)} to ${payee.trim()}, due ${formatQuoteDay(dueDate)}.`,
        key: "finance-bill",
      });
      router.refresh();
      onSaved(result.ref);
    });
  };

  return (
    <Modal
      title={bill ? `Edit ${bill.ref}` : receipt ? `Bill from ${receipt.ref}` : "New bill"}
      icon="file-text"
      width={620}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button icon="check" onClick={save} disabled={pending}>
            {pending ? "Saving…" : bill ? "Save" : "Add bill"}
          </Button>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      {receipt && (
        <Notice tone="info">
          Goods received on {formatQuoteDay(receipt.receivedDate)}, {formatMoney(receipt.totalCents)}.{" "}
          {receipt.suggestedDueDate
            ? `Due date set from ${receipt.supplierName}'s terms (${receipt.terms}).`
            : `${receipt.supplierName} has no payment terms AEGIS can read; set the due date from their invoice.`}
        </Notice>
      )}
      {moneyLocked && (
        <Notice tone="info">Something has been paid on this bill, so its amount, date and category are fixed.</Notice>
      )}
      <div className="grid grid-cols-1 gap-3.5 wide:grid-cols-2">
        <Field label="Supplier / payee" required hint={supplierRef && !receipt ? "Linked to the supplier record." : undefined}>
          <input
            style={locked(INPUT, Boolean(receipt))}
            value={payee}
            maxLength={120}
            list="finance-payees"
            disabled={Boolean(receipt)}
            placeholder="Davao Auto Parts, Davao Light, landlord…"
            onChange={(event) => {
              setPayee(event.target.value);
              const match = payees.find((entry) => entry.name.toLowerCase() === event.target.value.trim().toLowerCase());
              if (match) followTerms(billDate, match.terms);
            }}
          />
          <datalist id="finance-payees">
            {payees.map((entry) => (
              <option key={entry.ref} value={entry.name} />
            ))}
          </datalist>
        </Field>
        <Field label="Invoice / reference">
          <input style={INPUT} value={reference} maxLength={80} placeholder="Their invoice or receipt number" onChange={(event) => setReference(event.target.value)} />
        </Field>
        <Field label="Category" required>
          <select style={locked(SELECT, moneyLocked)} value={category} disabled={moneyLocked} onChange={(event) => setCategory(event.target.value as ExpenseCategory)}>
            {EXPENSE_CATEGORIES.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Amount" required>
          <input style={locked(INPUT, moneyLocked)} inputMode="decimal" value={amount} disabled={moneyLocked} placeholder="0.00" onChange={(event) => setAmount(event.target.value)} />
        </Field>
        <Field label="Invoice date" required hint="The month of this date is the month the cost belongs to.">
          <input
            style={locked(INPUT, moneyLocked)}
            type="date"
            value={billDate}
            max={today}
            disabled={moneyLocked}
            onChange={(event) => {
              setBillDate(event.target.value);
              followTerms(event.target.value, terms);
              if (!paidNow) setPaidOn(event.target.value);
            }}
          />
        </Field>
        <Field label="Due date" required hint={days !== null && !dueTouched ? `From the terms: ${terms}.` : undefined}>
          <input
            style={INPUT}
            type="date"
            value={dueDate}
            min={billDate}
            onChange={(event) => {
              setDueDate(event.target.value);
              setDueTouched(true);
            }}
          />
        </Field>
        <Field label="Responsible person">
          <input style={INPUT} value={person} maxLength={80} onChange={(event) => setPerson(event.target.value)} />
        </Field>
      </div>
      <Field label="Remarks">
        <textarea rows={2} maxLength={600} style={{ ...INPUT, resize: "vertical" }} value={remarks} onChange={(event) => setRemarks(event.target.value)} />
      </Field>
      {!bill && (
        <div className="flex flex-col gap-3" style={{ padding: "10px 12px", border: "1px solid var(--border-default)", borderRadius: 12 }}>
          <label className="flex items-center gap-2" style={{ fontSize: "12.5px", fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={paidNow}
              disabled={accounts.length === 0}
              onChange={(event) => {
                setPaidNow(event.target.checked);
                if (!dueTouched) setDueDate(billDate);
              }}
            />
            Already paid in full
            {accounts.length === 0 && <span style={{ fontWeight: 400, color: "var(--text-muted)" }}> (add an account first)</span>}
          </label>
          {paidNow && (
            <div className="grid grid-cols-1 gap-3.5 wide:grid-cols-2">
              <Field label="Paid from" required>
                <select style={SELECT} value={paidFrom} onChange={(event) => setPaidFrom(event.target.value)}>
                  {accounts.map((account) => (
                    <option key={account.ref} value={account.ref}>
                      {account.name} · {formatMoney(account.balanceCents)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Paid on" required>
                <input style={INPUT} type="date" value={paidOn} min={billDate} max={today} onChange={(event) => setPaidOn(event.target.value)} />
              </Field>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
