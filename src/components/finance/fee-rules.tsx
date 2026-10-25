"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createFeeRuleAction, updateFeeRuleAction } from "@/app/actions/finance";
import { Field, INPUT, Modal, Notice, SELECT } from "@/components/forms/form-kit";
import { useToast } from "@/components/layout/toast-provider";
import { Badge, Button } from "@/components/ui";
import { FEE_KINDS, describeFeeRule, feeFromRule, feeKindLabel, feeRuleProblem } from "@/lib/finance";
import { formatMoney } from "@/lib/format";
import { amountInput, parseAmount } from "@/lib/quotations";
import type { FeeKind, FeeRule } from "@/types";

const HEADING = { margin: 0, fontFamily: "var(--font-display)", fontSize: "13.5px", fontWeight: 700 };

/** "2.5" is 250 hundredths of a percent; null when it is not a percentage. */
function parsePercent(text: string): number | null {
  const cleaned = text.replace(/[%\s]/g, "");
  if (!cleaned) return 0;
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/**
 * The fee rules a payment form offers: card MDR, bank charges, e-wallet
 * fees. Everyone sees them; administrators keep them. A change applies to
 * new payments only.
 */
export function FeeRulesSection({ rules, isAdmin }: { rules: FeeRule[]; isAdmin: boolean }) {
  const [editing, setEditing] = useState<FeeRule | "new" | null>(null);
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-col">
          <h3 style={HEADING}>Fee rules</h3>
          <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
            Fill in the fee on a payment: card MDR, bank charges, e-wallet fees. A fee is an expense of the month it is paid in.
          </span>
        </span>
        {isAdmin && (
          <Button size="sm" variant="secondary" icon="plus" onClick={() => setEditing("new")}>
            New fee rule
          </Button>
        )}
      </div>
      {rules.length === 0 ? (
        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
          No fee rules yet. A fee can still be typed on any payment.
        </span>
      ) : (
        <div style={{ border: "1px solid var(--border-default)", borderRadius: 12, overflow: "hidden" }}>
          {rules.map((rule) => (
            <div key={rule.ref} className="flex items-center gap-3" style={{ borderBottom: "1px solid var(--gray-50)", padding: "8px 12px", opacity: rule.active ? 1 : 0.6 }}>
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span style={{ fontSize: "12.5px", fontWeight: 600 }}>{rule.name}</span>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  {rule.ref} · {feeKindLabel(rule.kind)} · on ₱10,000.00: {formatMoney(feeFromRule(rule, 1_000_000))}
                </span>
              </span>
              <span style={{ fontSize: "12.5px", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{describeFeeRule(rule)}</span>
              {!rule.active && <Badge tone="neutral">Not in use</Badge>}
              {isAdmin && (
                <Button size="sm" variant="ghost" onClick={() => setEditing(rule)}>
                  Edit
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      {editing && <FeeRuleModal rule={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function FeeRuleModal({ rule, onClose }: { rule: FeeRule | null; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(rule?.name ?? "");
  const [kind, setKind] = useState<FeeKind>(rule?.kind ?? "card");
  const [percent, setPercent] = useState(rule ? String(rule.percentBps / 100) : "");
  const [fixed, setFixed] = useState(rule && rule.fixedCents > 0 ? amountInput(rule.fixedCents) : "");
  const [active, setActive] = useState(rule?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const percentBps = parsePercent(percent);
  const fixedCents = parseAmount(fixed) ?? (fixed.trim() ? undefined : 0);

  const save = () => {
    if (percentBps === null) {
      setError("Enter the percentage as a number, such as 3 or 2.5.");
      return;
    }
    if (fixedCents === undefined || fixedCents === null) {
      setError("Enter the fixed amount, such as 15 or 15.00, or leave it empty.");
      return;
    }
    const input = { name, kind, percentBps, fixedCents };
    const problem = feeRuleProblem(input);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = rule ? { ...(await updateFeeRuleAction(rule.ref, { ...input, active })), ref: rule.ref } : await createFeeRuleAction(input);
      if (!result.ok) {
        setError(result.error);
        toast({ tone: "error", title: "Fee rule not saved", description: result.error, key: "finance-fee-rule" });
        return;
      }
      toast({
        tone: "success",
        title: rule ? `${name.trim()} saved` : `${name.trim()} added`,
        description: rule ? "New payments use it; recorded ones keep their fee." : `${describeFeeRule(input)}, saved as ${result.ref}.`,
        key: "finance-fee-rule",
      });
      router.refresh();
      onClose();
    });
  };

  return (
    <Modal
      title={rule ? `Edit ${rule.name}` : "New fee rule"}
      icon="credit-card"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button icon="check" onClick={save} disabled={pending}>
            {pending ? "Saving…" : rule ? "Save" : "Add rule"}
          </Button>
        </>
      }
    >
      {error && <Notice tone="error">{error}</Notice>}
      <div className="grid grid-cols-1 gap-3.5 wide:grid-cols-2">
        <Field label="Name" required>
          <input style={INPUT} value={name} maxLength={80} placeholder="BDO card terminal" onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Kind" required hint={FEE_KINDS.find((entry) => entry.key === kind)?.hint}>
          <select style={SELECT} value={kind} onChange={(event) => setKind(event.target.value as FeeKind)}>
            {FEE_KINDS.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Percentage" hint="Of the gross, such as 3 for a 3% MDR.">
          <input style={INPUT} inputMode="decimal" value={percent} placeholder="0" onChange={(event) => setPercent(event.target.value)} />
        </Field>
        <Field label="Fixed amount" hint="Per payment, such as 15 for InstaPay.">
          <input style={INPUT} inputMode="decimal" value={fixed} placeholder="0.00" onChange={(event) => setFixed(event.target.value)} />
        </Field>
      </div>
      {percentBps !== null && typeof fixedCents === "number" && (percentBps > 0 || fixedCents > 0) && (
        <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
          On ₱10,000.00 the fee is {formatMoney(feeFromRule({ percentBps, fixedCents }, 1_000_000))}, leaving{" "}
          {formatMoney(1_000_000 - feeFromRule({ percentBps, fixedCents }, 1_000_000))} when it is taken from money received.
        </span>
      )}
      {rule && (
        <label className="flex items-center gap-2" style={{ fontSize: "12.5px", fontWeight: 600 }}>
          <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
          In use (offered on payment forms)
        </label>
      )}
    </Modal>
  );
}
