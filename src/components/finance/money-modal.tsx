"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { attachFileAction, recordMoneyAction } from "@/app/actions/finance";
import { Field, INPUT, Modal, Notice, SELECT } from "@/components/forms/form-kit";
import { useToast } from "@/components/layout/toast-provider";
import { Button, Icon } from "@/components/ui";
import { EXPENSE_CATEGORIES, MONEY_NATURES, moneyEntryProblem } from "@/lib/finance";
import { monthLabel } from "@/lib/finance-periods";
import { formatMoney } from "@/lib/format";
import { parseAmount } from "@/lib/quotations";
import { DuplicateNotice } from "./duplicate-notice";
import { useFee } from "./fee-fields";
import { prepareUpload } from "./record-trail";
import { ScanBox, scanAmount, useAttachScan, type Scan, type ScannedFile } from "./scan-fill";
import type { DuplicateMatch, ExpenseCategory, FeeRule, MoneyAccountSummary, MoneyNature } from "@/types";

/** Documents picked in the form; more can be attached from the transaction afterwards. */
const MAX_DOCUMENTS = 6;

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
  const [scan, setScan] = useState<Scan | null>(null);
  const attachScan = useAttachScan();
  /** Receipts, deposit slips, screenshots of a transfer: attached to the transaction as it is saved. */
  const [documents, setDocuments] = useState<ScannedFile[]>([]);
  const [reading, setReading] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  const pickDocuments = async (files: FileList | null) => {
    const list = files ? [...files] : [];
    if (picker.current) picker.current.value = "";
    if (list.length === 0) return;
    const room = MAX_DOCUMENTS - documents.length;
    if (room <= 0) {
      setError(`Attach up to ${MAX_DOCUMENTS} documents here; add more from the transaction once it is saved.`);
      return;
    }
    setReading(true);
    setError(null);
    try {
      const prepared: ScannedFile[] = [];
      for (const file of list.slice(0, room)) {
        prepared.push({ name: file.name, dataUrl: await prepareUpload(file) });
      }
      setDocuments((current) => [...current, ...prepared]);
      if (list.length > room) setError(`Only the first ${room} were added: up to ${MAX_DOCUMENTS} documents here.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That file could not be read.");
    } finally {
      setReading(false);
    }
  };

  /** Attaches the picked documents to the saved record. Returns the sentence the success toast adds. */
  const attachDocuments = async (recordRef: string): Promise<string> => {
    let attached = 0;
    for (const doc of documents) {
      try {
        const result = await attachFileAction(recordRef, doc.name, doc.dataUrl);
        if (result.ok) attached += 1;
        else toast({ tone: "error", title: `${doc.name} not attached`, description: `${result.error} Attach it from ${recordRef}.`, key: `money-doc-${doc.name}` });
      } catch {
        toast({ tone: "error", title: `${doc.name} not attached`, description: `Attach it from ${recordRef}.`, key: `money-doc-${doc.name}` });
      }
    }
    return attached === 0 ? "" : ` ${attached} ${attached === 1 ? "document" : "documents"} attached.`;
  };

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

  /** Puts what a scan read into the fields: a receipt the business paid is money out, one it issued is money in. */
  const fill = (next: Scan) => {
    const { read } = next;
    setScan(next);
    if (read.direction !== direction) turn(read.direction);
    else setDuplicates(null);
    if (read.party) setParty(read.party);
    if (read.reference) setReference(read.reference);
    if (read.date) setPaidOn(read.date);
    if (read.amountCents !== null) setAmount(scanAmount(read.amountCents));
    if (read.description) setDescription(read.description);
    if (read.direction === "out" && read.category) setCategory(read.category);
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
      const attached = (await attachScan(result.ref, scan?.file)) + (await attachDocuments(result.ref));
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
        ].join(" ") + attached,
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
      <ScanBox scan={scan} expect={null} onScan={fill} />
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
      <Field
        label="Attach documents"
        hint="The receipt, official receipt, deposit slip or a screenshot of the transfer: a photo or a PDF. Saved with the transaction and shown in the account history."
      >
        <div className="flex flex-col gap-2">
          {scan && (
            <span className="flex items-center gap-2" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              <Icon name="sparkles" size={14} />
              {scan.file.name} <span style={{ color: "var(--text-muted)" }}>(the scan, attached too)</span>
            </span>
          )}
          {documents.map((doc, index) => (
            <span key={`${doc.name}-${index}`} className="flex items-center gap-2" style={{ fontSize: "12px" }}>
              <Icon name={doc.dataUrl.startsWith("data:application/pdf") ? "file-text" : "image"} size={14} />
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.name}</span>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => setDocuments((current) => current.filter((_, at) => at !== index))}
              >
                Remove
              </Button>
            </span>
          ))}
          <input
            ref={picker}
            type="file"
            accept="image/*,application/pdf"
            multiple
            hidden
            onChange={(event) => void pickDocuments(event.target.files)}
          />
          <div>
            <Button
              size="sm"
              variant="secondary"
              icon="paperclip"
              disabled={pending || reading || documents.length >= MAX_DOCUMENTS}
              onClick={() => picker.current?.click()}
            >
              {reading ? "Reading…" : documents.length > 0 ? "Add another" : "Attach photo or PDF"}
            </Button>
          </div>
        </div>
      </Field>
    </Modal>
  );
}
