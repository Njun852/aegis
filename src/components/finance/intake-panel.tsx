"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { addIntakeAction, readIntakeAction } from "@/app/actions/finance";
import { Notice } from "@/components/forms/form-kit";
import { useToast } from "@/components/layout/toast-provider";
import { Button, Icon } from "@/components/ui";
import { MAX_INTAKE_PDF_PAGES } from "@/lib/finance-intake";
import { formatMoney } from "@/lib/format";
import { shrinkImage } from "@/lib/image-resize";
import { formatQuoteDay } from "@/lib/quotations";
import { StatusBadge } from "./intake-badge";
import { IntakeDrawer } from "./intake-drawer";
import { formatStamp } from "./record-trail";
import { StatTiles, type StatTile } from "./stat-tiles";
import type { FeeRule, IntakeAllowance, IntakeItem, MoneyAccountSummary } from "@/types";

type View = "queue" | "posted" | "discarded";

/** Under the server's 1 MB limit for one action, with room for the request around it. */
const MAX_CHARS = 950_000;
/** A batch is a stack of receipts, not an archive. */
const MAX_BATCH = 20;
/** Small print on a receipt stays legible at this size; the pixel count is what the AI call costs. */
const ATTEMPTS = [
  { maxEdge: 1600, quality: 0.8 },
  { maxEdge: 1400, quality: 0.72 },
  { maxEdge: 1200, quality: 0.65 },
];

async function prepare(file: File): Promise<string> {
  if (file.type === "application/pdf") {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("That PDF could not be read."));
      reader.readAsDataURL(file);
    });
    if (dataUrl.length > MAX_CHARS) throw new Error("PDFs over about 700 KB cannot be uploaded. Photograph it instead.");
    return dataUrl;
  }
  for (const attempt of ATTEMPTS) {
    const { dataUrl } = await shrinkImage(file, { ...attempt, type: "image/jpeg" });
    if (dataUrl.length <= MAX_CHARS) return dataUrl;
  }
  throw new Error("That photo is too detailed to upload. Try a closer, plainer shot.");
}

const TH = {
  padding: "8px 10px",
  fontSize: "var(--text-overline-size)",
  letterSpacing: ".08em",
  textTransform: "uppercase" as const,
  color: "var(--text-muted)",
  fontWeight: 500,
  textAlign: "left" as const,
  whiteSpace: "nowrap" as const,
  borderBottom: "1px solid var(--border-subtle)",
};
const TD = { padding: "9px 10px", fontSize: "12.5px", borderBottom: "1px solid var(--gray-50)", verticalAlign: "top" as const };

/**
 * The Review Queue. Photos and PDFs of invoices and receipts go in, one at a
 * time or as a batch; the AI reads each into proposed fields; a person checks
 * every one against the document and presses Confirm and post. Nothing the AI
 * reads is ever posted on its own.
 */
export function IntakePanel({
  items,
  openRef,
  accounts,
  feeRules,
  allowance,
  isAdmin,
  today,
}: {
  items: IntakeItem[];
  openRef: string | null;
  /** Active accounts, for a document already paid. */
  accounts: MoneyAccountSummary[];
  feeRules: FeeRule[];
  allowance: IntakeAllowance;
  isAdmin: boolean;
  today: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>("queue");
  const [, startNavigation] = useTransition();

  const open = openRef ? items.find((item) => item.ref === openRef) ?? null : null;
  const queue = items.filter((item) => item.status === "unread" || item.status === "review" || item.status === "posting");
  const posted = items.filter((item) => item.status === "posted");
  const discarded = items.filter((item) => item.status === "discarded");
  const shown = view === "queue" ? queue : view === "posted" ? posted : discarded;
  const needsReview = queue.filter((item) => item.status === "unread" || item.reviewReasons.length > 0);

  const select = (ref: string | null) =>
    startNavigation(() => router.replace(ref ? `/finance?tab=intake&item=${encodeURIComponent(ref)}` : "/finance?tab=intake", { scroll: false }));

  const upload = async (list: FileList | null) => {
    const files = list ? [...list] : [];
    if (input.current) input.current.value = "";
    if (files.length === 0) return;
    if (files.length > MAX_BATCH) {
      toast({ tone: "error", title: "Too many files", description: `Upload at most ${MAX_BATCH} at a time.`, key: "finance-intake" });
      return;
    }
    setBusy(true);
    let read = 0;
    let waiting = 0;
    const failed: string[] = [];
    for (const [index, file] of files.entries()) {
      toast({
        tone: "info",
        title: `Reading ${index + 1} of ${files.length}…`,
        description: `${file.name}. This can take up to half a minute each.`,
        key: "finance-intake",
        durationMs: 60_000,
      });
      try {
        const dataUrl = await prepare(file);
        const added = await addIntakeAction(file.name, dataUrl);
        if (!added.ok) {
          failed.push(`${file.name}: ${added.error}`);
          continue;
        }
        if (added.sameFileAs.length > 0) {
          toast({
            tone: "info",
            title: `${file.name} may be a duplicate`,
            description: `The same file was uploaded before: ${added.sameFileAs.join(", ")}. It is in the queue, marked for review.`,
            key: `finance-intake-dup-${added.ref}`,
            durationMs: 12_000,
          });
        }
        const result = await readIntakeAction(added.ref);
        if (result.ok && result.status === "review") read += 1;
        else waiting += 1;
        router.refresh();
      } catch (cause) {
        failed.push(`${file.name}: ${cause instanceof Error ? cause.message : "it could not be read"}`);
      }
    }
    setBusy(false);
    router.refresh();
    toast({
      tone: failed.length > 0 ? "error" : "success",
      title: `${read} read, ${waiting} waiting unread, ${failed.length} not uploaded`,
      description: [
        read > 0 && "Check each one against its document, then confirm and post it. Nothing is posted until you do.",
        waiting > 0 && "Unread uploads can be read again or typed in.",
        ...failed,
      ]
        .filter(Boolean)
        .join(" "),
      key: "finance-intake",
      durationMs: 12_000,
    });
  };

  const tiles: StatTile[] = [
    { label: "Needs review", value: String(needsReview.length), icon: "alert-triangle", tone: needsReview.length > 0 ? "alert" : "plain" },
    { label: "Ready to post", value: String(queue.length - needsReview.length), icon: "check", tone: "accent" },
    { label: "Posted", value: String(posted.length), icon: "file-text" },
    { label: `AI reads today · limit ${allowance.perDay}`, value: String(allowance.readToday), icon: "sparkles" },
  ];

  return (
    <>
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { key: "queue", label: `To review ${queue.length}` },
                { key: "posted", label: `Posted ${posted.length}` },
                { key: "discarded", label: `Discarded ${discarded.length}` },
              ] as const
            ).map((entry) => (
              <Button key={entry.key} size="sm" variant={view === entry.key ? "primary" : "ghost"} onClick={() => setView(entry.key)}>
                {entry.label}
              </Button>
            ))}
          </div>
          <>
            <input ref={input} type="file" accept="image/*,application/pdf" multiple hidden onChange={(event) => void upload(event.target.files)} />
            <Button icon="image" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? "Reading…" : "Upload invoices or receipts"}
            </Button>
          </>
        </div>

        <StatTiles tiles={tiles} />

        <Notice tone="info">
          Upload photos or PDFs (first {MAX_INTAKE_PDF_PAGES} pages are read), one or a batch of up to {MAX_BATCH}. The AI proposes the
          supplier or customer, number, dates, amount, payment and category; doubtful fields are marked. Nothing is posted until you check it
          and press Confirm and post, and the original stays attached to the record.
        </Notice>
        {!allowance.available && <Notice tone="warning">{allowance.note}</Notice>}

        <section style={{ background: "var(--surface-card)", border: "1px solid var(--border-default)", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
              <thead>
                <tr>
                  <th style={TH}>Document</th>
                  <th style={TH}>Kind</th>
                  <th style={TH}>Supplier / customer</th>
                  <th style={TH}>Reference</th>
                  <th style={TH}>Date</th>
                  <th style={{ ...TH, textAlign: "right" }}>Amount</th>
                  <th style={TH}>Status</th>
                  <th style={TH}>{view === "posted" ? "Posted as" : view === "discarded" ? "Why" : "Uploaded"}</th>
                </tr>
              </thead>
              <tbody>
                {shown.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ ...TD, color: "var(--text-muted)", textAlign: "center", padding: 28 }}>
                      {view === "queue" ? "Nothing waiting. Upload a photo or PDF of an invoice or receipt." : "Nothing here."}
                    </td>
                  </tr>
                ) : (
                  shown.map((item) => {
                    const read = item.extraction;
                    return (
                      <tr
                        key={item.ref}
                        tabIndex={0}
                        onClick={() => select(item.ref)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") select(item.ref);
                        }}
                        style={{ cursor: "pointer", background: item.ref === openRef ? "var(--surface-active)" : "transparent" }}
                      >
                        <td style={TD}>
                          <span className="flex items-center gap-2">
                            <Icon name={item.contentType === "application/pdf" ? "file-text" : "image"} size={15} />
                            <span className="flex min-w-0 flex-col leading-tight">
                              <span style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{item.name}</span>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: "10.5px", color: "var(--text-muted)" }}>{item.ref}</span>
                            </span>
                          </span>
                        </td>
                        <td style={TD}>{read ? (read.direction === "out" ? "Bill (money out)" : "Invoice (money in)") : "—"}</td>
                        <td style={TD}>{read?.party || "—"}</td>
                        <td style={TD}>{read?.reference || "—"}</td>
                        <td style={{ ...TD, whiteSpace: "nowrap" }}>{read?.date ? formatQuoteDay(read.date) : "—"}</td>
                        <td style={{ ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                          {read?.amountCents != null ? formatMoney(read.amountCents) : "—"}
                        </td>
                        <td style={TD}>
                          <StatusBadge item={item} />
                        </td>
                        <td style={{ ...TD, fontSize: "11.5px", color: "var(--text-secondary)" }}>
                          {item.posted ? (
                            <Link
                              href={
                                item.posted.kind === "bill"
                                  ? `/finance?tab=payables&bill=${encodeURIComponent(item.posted.ref)}`
                                  : `/finance?tab=receivables&invoice=${encodeURIComponent(item.posted.ref)}`
                              }
                              onClick={(event) => event.stopPropagation()}
                              style={{ color: "var(--text-accent)" }}
                            >
                              {item.posted.ref}
                            </Link>
                          ) : item.status === "discarded" ? (
                            item.discardReason
                          ) : (
                            `${item.uploadedBy} · ${formatStamp(item.uploadedAt)}`
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
        {view === "discarded" && discarded.length > 0 && (
          <span style={{ fontSize: "11px", color: "var(--text-muted)", padding: "0 10px" }}>
            Discarded uploads never became records and are removed 90 days after they were discarded.
          </span>
        )}
      </div>

      {open && (
        <IntakeDrawer
          key={`${open.ref}-${open.status}-${open.extraction ? "read" : "unread"}`}
          item={open}
          accounts={accounts}
          feeRules={feeRules}
          isAdmin={isAdmin}
          today={today}
          onClose={() => select(null)}
        />
      )}
    </>
  );
}
