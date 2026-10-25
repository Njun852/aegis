"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { attachFileAction } from "@/app/actions/finance";
import { useToast } from "@/components/layout/toast-provider";
import { Button, Icon } from "@/components/ui";
import { shrinkImage } from "@/lib/image-resize";
import type { FinanceAttachment, RecordAudit, RecordTrail } from "@/types";

const HEADING = { margin: 0, fontFamily: "var(--font-display)", fontSize: "13.5px", fontWeight: 700 };
const LABEL = { width: 104, flex: "0 0 auto", fontSize: "11.5px", color: "var(--text-muted)" };

/** Under the server's 1 MB limit for one action, with room for the request around it. */
const MAX_CHARS = 950_000;

/** As for a quotation photo: legible print, and small enough to store. */
const ATTEMPTS = [
  { maxEdge: 1800, quality: 0.82 },
  { maxEdge: 1600, quality: 0.72 },
  { maxEdge: 1400, quality: 0.65 },
  { maxEdge: 1200, quality: 0.6 },
];

export function formatStamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function prepare(file: File): Promise<string> {
  if (file.type === "application/pdf") {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("That PDF could not be read."));
      reader.readAsDataURL(file);
    });
    if (dataUrl.length > MAX_CHARS) throw new Error("That PDF is too large. Attach one under about 700 KB, or a photo of it.");
    return dataUrl;
  }
  for (const attempt of ATTEMPTS) {
    const { dataUrl } = await shrinkImage(file, { ...attempt, type: "image/jpeg" });
    if (dataUrl.length <= MAX_CHARS) return dataUrl;
  }
  throw new Error("That photo is too detailed to attach. Try a closer, plainer shot.");
}

/** Who made a record, who last changed it, and where it came from. */
export function AuditLines({ audit, reference }: { audit: RecordAudit; reference?: string }) {
  const rows = [
    { label: "Created by", value: `${audit.createdBy} · ${formatStamp(audit.createdAt)}` },
    {
      label: "Updated by",
      value: audit.updatedBy && audit.updatedAt ? `${audit.updatedBy} · ${formatStamp(audit.updatedAt)}` : "Not changed since",
    },
    { label: "Source", value: audit.source },
    ...(reference !== undefined ? [{ label: "Reference no.", value: reference || "None given" }] : []),
  ];
  return (
    <div className="flex flex-col gap-2" style={{ padding: "12px 14px", border: "1px solid var(--border-default)", borderRadius: 14 }}>
      {rows.map((row) => (
        <div key={row.label} className="flex items-start gap-2.5">
          <span style={LABEL}>{row.label}</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: "12.5px", fontWeight: 500, overflowWrap: "anywhere" }}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * The documents behind a record and everything that has happened to it. Any
 * file attached is kept; a correction shows its reason and each field's old
 * and new value, so the record as first entered can always be read back.
 */
export function RecordTrailPanel({
  recordRef,
  trail,
  canAttach,
}: {
  recordRef: string;
  trail: RecordTrail;
  canAttach: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const attach = async (file: File | undefined) => {
    if (input.current) input.current.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await prepare(file);
      const result = await attachFileAction(recordRef, file.name, dataUrl);
      if (!result.ok) {
        toast({ tone: "error", title: "Not attached", description: result.error, key: "finance-attach" });
        return;
      }
      toast(
        result.alsoOn.length > 0
          ? {
              tone: "info",
              title: `Attached to ${recordRef}, but it may be a duplicate`,
              description: `The same file is already attached to ${result.alsoOn.join(", ")}. Check the document is not entered twice.`,
              key: "finance-attach",
              durationMs: 12_000,
            }
          : { tone: "success", title: `Attached to ${recordRef}`, description: `${file.name} (${result.ref}).`, key: "finance-attach" },
      );
      router.refresh();
    } catch (cause) {
      toast({
        tone: "error",
        title: "Not attached",
        description: cause instanceof Error ? cause.message : "The file could not be read.",
        key: "finance-attach",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 style={HEADING}>Supporting documents</h3>
          {canAttach && (
            <>
              <input ref={input} type="file" accept="image/*,application/pdf" hidden onChange={(event) => void attach(event.target.files?.[0])} />
              <Button size="sm" variant="secondary" icon="paperclip" disabled={busy} onClick={() => input.current?.click()}>
                {busy ? "Attaching…" : "Attach photo or PDF"}
              </Button>
            </>
          )}
        </div>
        {trail.attachments.length === 0 ? (
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>No document attached yet.</span>
        ) : (
          <div style={{ border: "1px solid var(--border-default)", borderRadius: 12, overflow: "hidden" }}>
            {trail.attachments.map((file) => (
              <AttachmentRow key={file.ref} file={file} own={file.recordRef === recordRef} />
            ))}
          </div>
        )}
      </section>

      {trail.history.length > 0 && (
        <details>
          <summary style={{ ...HEADING, cursor: "pointer" }}>History ({trail.history.length})</summary>
          <div className="flex flex-col gap-2" style={{ marginTop: 8 }}>
            {trail.history.map((line, index) => (
              <div key={`${line.at}-${index}`} style={{ fontSize: "11.5px", color: "var(--text-secondary)", overflowWrap: "anywhere" }}>
                <span style={{ color: "var(--text-muted)" }}>
                  {formatStamp(line.at)} · {line.actor}
                  {line.ref !== recordRef ? ` · ${line.ref}` : ""} ·{" "}
                </span>
                {line.changes.length > 0 ? (
                  <span className="flex flex-col gap-0.5" style={{ marginTop: 2 }}>
                    <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>Corrected: {line.reason}</span>
                    {line.changes.map((change) => (
                      <span key={change.field}>
                        {change.field}: <span style={{ textDecoration: "line-through" }}>{change.from || "(empty)"}</span> → {change.to || "(empty)"}
                      </span>
                    ))}
                  </span>
                ) : (
                  line.detail
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </>
  );
}

function AttachmentRow({ file, own }: { file: FinanceAttachment; own: boolean }) {
  const href = `/api/finance/attachments/${encodeURIComponent(file.ref)}`;
  return (
    <div className="flex items-center gap-3" style={{ borderBottom: "1px solid var(--gray-50)", padding: "8px 12px" }}>
      <span style={{ color: "var(--text-muted)" }}>
        <Icon name={file.contentType === "application/pdf" ? "file-text" : "image"} size={16} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <a href={href} target="_blank" rel="noreferrer" style={{ fontSize: "12.5px", color: "var(--text-accent)", overflowWrap: "anywhere" }}>
          {file.name}
        </a>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "10.5px", color: "var(--text-muted)" }}>
          {file.ref}
          {!own ? ` · on ${file.recordRef}` : ""} · {file.uploadedBy} · {formatStamp(file.uploadedAt)} · {Math.max(1, Math.round(file.bytes / 1024))} KB
        </span>
      </span>
    </div>
  );
}
