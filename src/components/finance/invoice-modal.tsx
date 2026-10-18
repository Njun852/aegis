"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createInvoiceAction, updateInvoiceAction } from "@/app/actions/finance";
import { Field, INPUT, Modal, Notice, SELECT } from "@/components/forms/form-kit";
import { useToast } from "@/components/layout/toast-provider";
import { Button } from "@/components/ui";
import { invoiceInputProblem } from "@/lib/finance";
import { addDaysToKey } from "@/lib/finance-periods";
import { formatMoney } from "@/lib/format";
import { amountInput, formatQuoteDay, parseAmount } from "@/lib/quotations";
import { locked } from "./locked";
import type { CustomerOption, InvoiceSummary, MoneyAccountSummary, UninvoicedJob } from "@/types";

const TERMS = [
  { label: "On receipt", days: 0 },
  { label: "15 days", days: 15 },
  { label: "30 days", days: 30 },
];

/**
 * Issues an invoice, edits one (`invoice`), or invoices a completed job order
 * (`job`). An invoice collected in full when it is issued, such as a cash
 * sale, records the collection with it.
 */
export function InvoiceModal({
  invoice,
  job,
  customers,
  accounts,
  suggestedNumber,
  today,
  defaultPerson,
  onClose,
  onSaved,
}: {
  invoice: InvoiceSummary | null;
  job: UninvoicedJob | null;
  customers: CustomerOption[];
  /** Active accounts, to collect into. */
  accounts: MoneyAccountSummary[];
  suggestedNumber: string;
  today: string;
  defaultPerson: string;
  onClose: () => void;
  onSaved: (ref: string) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [customerName, setCustomerName] = useState(invoice?.customerName ?? job?.customerName ?? "");
  const [number, setNumber] = useState(invoice?.number ?? suggestedNumber);
  const [invoiceDate, setInvoiceDate] = useState(invoice?.invoiceDate ?? today);
  const [dueDate, setDueDate] = useState(invoice?.dueDate ?? "");
  const [amount, setAmount] = useState(invoice ? amountInput(invoice.amountCents) : job ? amountInput(job.approvedTotalCents) : "");
  const [person, setPerson] = useState(defaultPerson);
  const [remarks, setRemarks] = useState("");
  const [followUpOn, setFollowUpOn] = useState("");
  const [collectedNow, setCollectedNow] = useState(false);
  const [collectInto, setCollectInto] = useState(accounts[0]?.ref ?? "");
  const [collectedOn, setCollectedOn] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const moneyLocked = Boolean(invoice && invoice.collectedCents > 0);
  const customer = customers.find((entry) => entry.name.trim().toLowerCase() === customerName.trim().toLowerCase()) ?? null;

  const save = () => {
    const amountCents = parseAmount(amount);
    if (!amountCents) {
      setError("Enter the invoice amount, such as 12500 or 12,500.00.");
      return;
    }
    const due = collectedNow && !dueDate ? invoiceDate : dueDate;
    const input = {
      customerName,
      customerRef: job?.customerRef ?? invoice?.customerRef ?? customer?.ref ?? null,
      jobOrderRef: job?.ref ?? null,
      number,
      invoiceDate,
      dueDate: due,
      amountCents,
      responsiblePerson: person,
      remarks,
      nextFollowUpDate: followUpOn || null,
      collectedInto: !invoice && collectedNow ? { accountRef: collectInto, paidOn: collectedOn } : null,
    };
    const problem = invoiceInputProblem(input, today);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = invoice ? { ...(await updateInvoiceAction(invoice.ref, input)), ref: invoice.ref } : await createInvoiceAction(input);
      if (!result.ok) {
        setError(result.error);
        toast({ tone: "error", title: "Invoice not saved", description: result.error, key: "finance-invoice" });
        return;
      }
      toast({
        tone: "success",
        title: invoice ? `${result.ref} saved` : `Invoice ${number.trim()} issued`,
        description: invoice
          ? undefined
          : input.collectedInto
            ? `${formatMoney(amountCents)} from ${customerName.trim()}, recorded as collected (${result.ref}).`
            : `${formatMoney(amountCents)} owed by ${customerName.trim()}, due ${formatQuoteDay(due)} (${result.ref}).`,
        key: "finance-invoice",
      });
      router.refresh();
      onSaved(result.ref);
    });
  };

  return (
    <Modal
      title={invoice ? `Edit invoice ${invoice.number}` : job ? `Invoice ${job.ref}` : "New invoice"}
      icon="file-text"
      width={620}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button icon="check" onClick={save} disabled={pending}>
            {pending ? "Saving…" : invoice ? "Save" : "Issue invoice"}
          </Button>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      {job && (
        <Notice tone="info">
          Completed job {job.ref}
          {job.vehicle ? ` (${job.vehicle})` : ""}, approved by the customer at {formatMoney(job.approvedTotalCents)}.
        </Notice>
      )}
      {moneyLocked && <Notice tone="info">Something has been collected on this invoice, so its amount and date are fixed.</Notice>}
      <div className="grid grid-cols-1 gap-3.5 wide:grid-cols-2">
        <Field label="Customer / company" required hint={customer && !job ? "Linked to the CRM customer." : undefined}>
          <input
            style={locked(INPUT, Boolean(job))}
            value={customerName}
            maxLength={120}
            list="finance-customers"
            disabled={Boolean(job)}
            onChange={(event) => setCustomerName(event.target.value)}
          />
          <datalist id="finance-customers">
            {customers.map((entry) => (
              <option key={entry.ref} value={entry.name} />
            ))}
          </datalist>
        </Field>
        <Field label="Invoice number" required hint={invoice ? undefined : "The next number after the last one issued. Change it to match the printed invoice."}>
          <input style={INPUT} value={number} maxLength={40} onChange={(event) => setNumber(event.target.value)} />
        </Field>
        <Field label="Amount" required>
          <input style={locked(INPUT, moneyLocked)} inputMode="decimal" value={amount} disabled={moneyLocked} placeholder="0.00" onChange={(event) => setAmount(event.target.value)} />
        </Field>
        <Field label="Invoice date" required hint="The month of this date is the month the sale belongs to.">
          <input
            style={locked(INPUT, moneyLocked)}
            type="date"
            value={invoiceDate}
            max={today}
            disabled={moneyLocked}
            onChange={(event) => {
              setInvoiceDate(event.target.value);
              setCollectedOn(event.target.value);
            }}
          />
        </Field>
        <Field label="Due date" required className="wide:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <input style={{ ...INPUT, maxWidth: 200 }} type="date" value={dueDate} min={invoiceDate} onChange={(event) => setDueDate(event.target.value)} />
            {TERMS.map((term) => (
              <Button key={term.label} size="sm" variant="ghost" onClick={() => setDueDate(addDaysToKey(invoiceDate, term.days))}>
                {term.label}
              </Button>
            ))}
          </div>
        </Field>
      </div>
      {!invoice && (
        <>
          <div className="grid grid-cols-1 gap-3.5 wide:grid-cols-2">
            <Field label="Responsible person" hint="Who collects it.">
              <input style={INPUT} value={person} maxLength={80} onChange={(event) => setPerson(event.target.value)} />
            </Field>
            <Field label="Next follow-up">
              <input style={INPUT} type="date" value={followUpOn} min={today} onChange={(event) => setFollowUpOn(event.target.value)} />
            </Field>
          </div>
          <Field label="Remarks">
            <textarea rows={2} maxLength={1000} style={{ ...INPUT, resize: "vertical" }} value={remarks} onChange={(event) => setRemarks(event.target.value)} />
          </Field>
          <div className="flex flex-col gap-3" style={{ padding: "10px 12px", border: "1px solid var(--border-default)", borderRadius: 12 }}>
            <label className="flex items-center gap-2" style={{ fontSize: "12.5px", fontWeight: 600 }}>
              <input type="checkbox" checked={collectedNow} disabled={accounts.length === 0} onChange={(event) => setCollectedNow(event.target.checked)} />
              Collected in full (cash sale)
              {accounts.length === 0 && <span style={{ fontWeight: 400, color: "var(--text-muted)" }}> (add an account first)</span>}
            </label>
            {collectedNow && (
              <div className="grid grid-cols-1 gap-3.5 wide:grid-cols-2">
                <Field label="Paid into" required>
                  <select style={SELECT} value={collectInto} onChange={(event) => setCollectInto(event.target.value)}>
                    {accounts.map((account) => (
                      <option key={account.ref} value={account.ref}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Collected on" required>
                  <input style={INPUT} type="date" value={collectedOn} min={invoiceDate} max={today} onChange={(event) => setCollectedOn(event.target.value)} />
                </Field>
              </div>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
