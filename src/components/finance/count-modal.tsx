"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { recordCountAction } from "@/app/actions/finance";
import { Field, INPUT, Modal, Notice, SELECT } from "@/components/forms/form-kit";
import { useToast } from "@/components/layout/toast-provider";
import { Button } from "@/components/ui";
import { accountTypeLabel } from "@/lib/finance";
import { formatSignedMoney } from "@/lib/format";
import { parseAmount } from "@/lib/quotations";
import type { MoneyAccountSummary } from "@/types";

/**
 * A cash count, or the balance printed in a passbook or on a statement,
 * entered for a day. The server works out the book balance for the same day;
 * any difference stays an alert until an administrator explains it.
 */
export function CountModal({
  accounts,
  accountRef,
  today,
  onClose,
}: {
  accounts: MoneyAccountSummary[];
  accountRef: string;
  today: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const usable = accounts.filter((account) => account.active);
  const [ref, setRef] = useState(accountRef || usable[0]?.ref || "");
  const [asOf, setAsOf] = useState(today);
  const [counted, setCounted] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const account = accounts.find((entry) => entry.ref === ref);
  const what = account?.type === "cash" ? "Counted cash" : account?.bankKind === "passbook" ? "Passbook balance" : "Statement balance";

  const save = () => {
    const countedCents = parseAmount(counted);
    if (countedCents === undefined || countedCents === null) {
      setError("Enter the balance, such as 12500 or 12,500.00. Enter 0 for an empty account.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await recordCountAction(ref, asOf, countedCents);
      if (!result.ok) {
        setError(result.error);
        toast({ tone: "error", title: "Count not recorded", description: result.error, key: "finance-count" });
        return;
      }
      if (result.differenceCents === 0) {
        toast({ tone: "success", title: "Count matches the book", description: `${account?.name} · ${result.ref}`, key: "finance-count" });
      } else {
        toast({
          tone: "info",
          title: `Count recorded, off by ${formatSignedMoney(result.differenceCents)}`,
          description: `${account?.name} differs from the book. It stays on the alert list until an administrator explains it.`,
          key: "finance-count",
        });
      }
      router.refresh();
      onClose();
    });
  };

  return (
    <Modal
      title="Record a count"
      icon="check"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button icon="check" onClick={save} disabled={pending || !ref}>
            {pending ? "Checking…" : "Check against the book"}
          </Button>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      <Field label="Account" required>
        <select style={SELECT} value={ref} onChange={(event) => setRef(event.target.value)}>
          {usable.map((entry) => (
            <option key={entry.ref} value={entry.ref}>
              {entry.name} · {accountTypeLabel(entry)}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-1 gap-3.5 wide:grid-cols-2">
        <Field label="As of the end of" required>
          <input style={INPUT} type="date" value={asOf} max={today} onChange={(event) => setAsOf(event.target.value)} />
        </Field>
        <Field label={what} required hint="What you actually see, not what AEGIS shows.">
          <input style={INPUT} inputMode="decimal" value={counted} placeholder="0.00" onChange={(event) => setCounted(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
