"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { CSSProperties } from "react";
import { attachFileAction, voidPaymentAction } from "@/app/actions/finance";
import { INPUT } from "@/components/forms/form-kit";
import { useToast } from "@/components/layout/toast-provider";
import { Button, Icon } from "@/components/ui";
import { formatMoney, formatSignedMoney } from "@/lib/format";
import { formatQuoteDay } from "@/lib/quotations";
import { formatStamp, prepareUpload } from "./record-trail";
import type { AccountHistoryLine } from "@/types";

const KIND_STYLE: Record<AccountHistoryLine["kind"], { icon: string; fg: string; bg: string }> = {
  opening: { icon: "wallet", fg: "var(--text-secondary)", bg: "var(--surface-inset)" },
  in: { icon: "arrow-down", fg: "var(--status-positive)", bg: "var(--status-positive-soft)" },
  "transfer-in": { icon: "arrow-left-right", fg: "var(--status-positive)", bg: "var(--status-positive-soft)" },
  out: { icon: "arrow-up", fg: "var(--status-negative)", bg: "var(--status-negative-soft)" },
  "transfer-out": { icon: "arrow-left-right", fg: "var(--status-negative)", bg: "var(--status-negative-soft)" },
  adjustment: { icon: "sliders-horizontal", fg: "var(--text-secondary)", bg: "var(--surface-inset)" },
};

/** Where a line's linked invoice or bill opens. */
function linkedHref(ref: string): string {
  return ref.startsWith("INV-")
    ? `/finance?tab=receivables&invoice=${encodeURIComponent(ref)}`
    : `/finance?tab=payables&bill=${encodeURIComponent(ref)}`;
}

/**
 * An account's history, newest first: what each line was, with whom, the
 * balance after it, who recorded it and when, and the documents behind it,
 * each opening in a new tab. A document can be attached to any line here; on
 * a sale or expense it goes on the invoice or bill, where its other papers are.
 */
export function AccountHistory({
  lines,
  balanceCents,
  isAdmin,
  onOpenPayment,
}: {
  lines: AccountHistoryLine[];
  balanceCents: number;
  isAdmin: boolean;
  onOpenPayment: (ref: string) => void;
}) {
  const movements = lines.filter((line) => line.kind !== "opening");
  const documents = lines.reduce((sum, line) => sum + line.attachments.length, 0);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "13.5px", fontWeight: 700 }}>Account history</h3>
        <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
          {movements.length} {movements.length === 1 ? "transaction" : "transactions"} · {documents}{" "}
          {documents === 1 ? "document" : "documents"} · newest first
        </span>
      </div>
      <div style={{ border: "1px solid var(--border-default)", borderRadius: 12, overflow: "hidden" }}>
        {lines.map((line) => (
          <HistoryLine key={`${line.kind}-${line.ref}`} line={line} isAdmin={isAdmin} onOpenPayment={onOpenPayment} />
        ))}
        <div className="flex items-center justify-between gap-3" style={{ padding: "9px 12px", background: "var(--gray-25)" }}>
          <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>Balance today, the sum of every line above</span>
          <span style={{ fontSize: "13px", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatMoney(balanceCents)}</span>
        </div>
      </div>
      {movements.length === 0 && (
        <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>Nothing has moved through this account since it was opened.</span>
      )}
    </section>
  );
}

function HistoryLine({
  line,
  isAdmin,
  onOpenPayment,
}: {
  line: AccountHistoryLine;
  isAdmin: boolean;
  onOpenPayment: (ref: string) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [attaching, setAttaching] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const style = KIND_STYLE[line.kind];
  const isPayment = line.kind !== "opening";
  // A sale's or expense's papers belong with its invoice or bill.
  const attachTo = line.linkedRef ?? line.ref;

  const attach = async (picked: File | undefined) => {
    if (file.current) file.current.value = "";
    if (!picked) return;
    setAttaching(true);
    try {
      const dataUrl = await prepareUpload(picked);
      const result = await attachFileAction(attachTo, picked.name, dataUrl);
      if (!result.ok) {
        toast({ tone: "error", title: "Not attached", description: result.error, key: `attach-${line.ref}` });
        return;
      }
      toast(
        result.alsoOn.length > 0
          ? {
              tone: "info",
              title: `Attached to ${attachTo}, but it may be a duplicate`,
              description: `The same file is already on ${result.alsoOn.join(", ")}. Check the transaction is not entered twice.`,
              key: `attach-${line.ref}`,
              durationMs: 12_000,
            }
          : { tone: "success", title: `Attached to ${attachTo}`, description: picked.name, key: `attach-${line.ref}` },
      );
      router.refresh();
    } catch (cause) {
      toast({
        tone: "error",
        title: "Not attached",
        description: cause instanceof Error ? cause.message : "The file could not be read.",
        key: `attach-${line.ref}`,
      });
    } finally {
      setAttaching(false);
    }
  };

  const confirmVoid = () => {
    startTransition(async () => {
      const result = await voidPaymentAction(line.ref, reason);
      if (!result.ok) {
        toast({ tone: "error", title: "Not voided", description: result.error, key: "finance-void" });
        return;
      }
      toast({ tone: "success", title: `${line.ref} voided`, description: "Kept on record as void, with the reason.", key: "finance-void" });
      setVoiding(false);
      setReason("");
      router.refresh();
    });
  };

  const details = [line.reference, line.feeCents > 0 ? `incl. ${formatMoney(line.feeCents)} fee` : "", line.note].filter(Boolean);

  return (
    <div style={{ borderBottom: "1px solid var(--gray-50)", padding: "10px 12px", display: "flex", gap: 10 }}>
      <span style={{ ...BADGE, background: style.bg, color: style.fg }}>
        <Icon name={style.icon} size={14} />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start gap-3">
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span style={{ fontSize: "12.5px", fontWeight: 600, overflowWrap: "anywhere" }}>
              {line.title}
              {line.party && <span style={{ fontWeight: 400, color: "var(--text-secondary)" }}> · {line.party}</span>}
            </span>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{formatQuoteDay(line.dateKey)}</span>
          </span>
          <span className="flex flex-col items-end leading-tight" style={{ flex: "0 0 auto" }}>
            <span
              style={{
                fontSize: "13px",
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
                color: line.kind === "opening" ? "var(--text-primary)" : line.amountCents < 0 ? "var(--status-negative)" : "var(--status-positive)",
              }}
            >
              {line.kind === "opening" ? formatMoney(line.amountCents) : formatSignedMoney(line.amountCents)}
            </span>
            <span style={{ fontSize: "10.5px", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
              Balance {formatMoney(line.balanceCents)}
            </span>
          </span>
        </div>

        {(details.length > 0 || line.linkedRef) && (
          <span style={{ fontSize: "11.5px", color: "var(--text-secondary)", overflowWrap: "anywhere" }}>
            {details.join(" · ")}
            {line.linkedRef && (
              <>
                {details.length > 0 ? " · " : ""}
                <Link href={linkedHref(line.linkedRef)} style={{ color: "var(--text-accent)" }}>
                  Open {line.linkedRef}
                </Link>
              </>
            )}
          </span>
        )}

        <span className="flex flex-wrap items-center gap-x-2" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
          <Icon name="user" size={11} />
          <span>
            Recorded by <strong style={{ fontWeight: 600, color: "var(--text-secondary)" }}>{line.recordedBy || "unknown"}</strong> ·{" "}
            {formatStamp(line.recordedAt)}
          </span>
          {isPayment && (
            <button type="button" onClick={() => onOpenPayment(line.ref)} title="Open this payment: fee, full history" style={LINK}>
              {line.ref}
            </button>
          )}
        </span>

        <div className="flex flex-wrap items-center gap-1.5" style={{ marginTop: 2 }}>
          {line.attachments.map((doc) => (
            <a
              key={doc.ref}
              href={`/api/finance/attachments/${encodeURIComponent(doc.ref)}`}
              target="_blank"
              rel="noreferrer"
              title={`${doc.name} · attached by ${doc.uploadedBy}, ${formatStamp(doc.uploadedAt)}${doc.recordRef !== line.ref ? ` · on ${doc.recordRef}` : ""}`}
              style={CHIP}
            >
              <Icon name={doc.contentType === "application/pdf" ? "file-text" : "image"} size={12} />
              <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.name}</span>
            </a>
          ))}
          {line.attachments.length === 0 && isPayment && (
            <span style={{ fontSize: "11px", color: "var(--status-warning)" }}>No document</span>
          )}
          {isPayment && (
            <>
              <input ref={file} type="file" accept="image/*,application/pdf" hidden onChange={(event) => void attach(event.target.files?.[0])} />
              <button type="button" onClick={() => file.current?.click()} disabled={attaching} style={{ ...CHIP, cursor: "pointer", borderStyle: "dashed" }}>
                <Icon name="paperclip" size={12} />
                {attaching ? "Attaching…" : "Attach"}
              </button>
            </>
          )}
          {isAdmin && line.voidable && !voiding && (
            <button type="button" onClick={() => setVoiding(true)} style={{ ...LINK, marginLeft: "auto", color: "var(--status-negative)" }}>
              Void
            </button>
          )}
        </div>

        {voiding && (
          <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 4 }}>
            <input
              style={{ ...INPUT, flex: 1, minWidth: 180 }}
              value={reason}
              maxLength={300}
              placeholder="Why is this being voided?"
              onChange={(event) => setReason(event.target.value)}
            />
            <Button size="sm" variant="secondary" onClick={confirmVoid} disabled={pending}>
              {pending ? "Voiding…" : "Void it"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setVoiding(false)} disabled={pending}>
              Keep
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

const BADGE: CSSProperties = {
  width: 28,
  height: 28,
  flex: "0 0 auto",
  borderRadius: 8,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const CHIP: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  height: 24,
  padding: "0 8px",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-pill)",
  background: "var(--surface-card)",
  color: "var(--text-accent)",
  fontFamily: "var(--font-body)",
  fontSize: "11px",
  textDecoration: "none",
};

const LINK: CSSProperties = {
  border: "none",
  background: "none",
  padding: 0,
  cursor: "pointer",
  fontFamily: "var(--font-mono)",
  fontSize: "10.5px",
  color: "var(--text-accent)",
};
