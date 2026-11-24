"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Icon } from "@/components/ui";
import { formatPeso, quoteStatusTone } from "@/lib/quotations";
import { jobOrderLabel } from "@/lib/job-orders";
import { jobStatusTone } from "./job-orders-panel";
import type { ScanRecord } from "@/types";

/**
 * The scan history: every document scanned, newest first. Each row shows the
 * scan, who scanned it and when, what the AI read, and the quotation and job
 * order it became; opening a row shows the whole trail from the scan to now.
 */

const LINK = { color: "var(--accent-primary)", textDecoration: "none", fontWeight: 600 } as const;

function photoUrl(ref: string) {
  return `/api/quotations/photos/${encodeURIComponent(ref)}`;
}

export function filterScans(scans: ScanRecord[], search: string): ScanRecord[] {
  const term = search.trim().toLowerCase();
  if (!term) return scans;
  return scans.filter((scan) =>
    [scan.ref, scan.by, scan.note, scan.quotation?.ref, scan.quotation?.customer, scan.quotation?.plate, scan.jobOrder?.ref]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLowerCase().includes(term)),
  );
}

export function ScansPanel({ scans, search }: { scans: ScanRecord[]; search: string }) {
  const visible = useMemo(() => filterScans(scans, search), [scans, search]);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-card)",
        padding: "6px 12px",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
      }}
    >
      {visible.map((scan) => {
        const expanded = open === scan.ref;
        return (
          <div key={scan.ref} style={{ borderBottom: "1px solid var(--border-subtle)", padding: "10px 0" }}>
            <div className="flex items-start gap-3">
              <a href={photoUrl(scan.ref)} target="_blank" rel="noreferrer" style={{ flex: "0 0 auto" }} aria-label={`Open scan ${scan.ref}`}>
                {/* Served by the app with the session; next/image would only re-encode it. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoUrl(scan.ref)}
                  alt=""
                  loading="lazy"
                  style={{
                    width: 56,
                    height: 56,
                    objectFit: "cover",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-default)",
                    background: "var(--surface-inset)",
                  }}
                />
              </a>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : scan.ref)}
                className="flex min-w-0 flex-1 flex-col items-start text-left"
                style={{ border: "none", background: "none", padding: 0, cursor: "pointer", font: "inherit", color: "inherit", gap: 3 }}
              >
                <span className="flex flex-wrap items-center gap-2" style={{ fontSize: "13px" }}>
                  <strong>{scan.ref}</strong>
                  <span style={{ color: "var(--text-secondary)", fontSize: "12px" }}>
                    {scan.when} · scanned by {scan.by}
                  </span>
                </span>
                <span style={{ fontSize: "12px", color: "var(--text-secondary)", textWrap: "pretty" }}>
                  {scan.readAs ? scan.note : `Not read. ${scan.note}`}
                </span>
              </button>
              <span className="hidden flex-col items-end gap-1 wide:flex" style={{ flex: "0 0 auto", fontSize: "12px" }}>
                {scan.quotation ? (
                  <span className="flex items-center gap-1.5">
                    <Link href={`/quotations/${encodeURIComponent(scan.quotation.ref)}`} style={LINK}>
                      {scan.quotation.ref}
                    </Link>
                    <Badge tone={quoteStatusTone(scan.quotation.status)}>{scan.quotation.status}</Badge>
                  </span>
                ) : (
                  <span style={{ color: "var(--text-muted)" }}>No quotation</span>
                )}
                {scan.jobOrder ? (
                  <span className="flex items-center gap-1.5">
                    <Link href={`/quotations/jobs/${encodeURIComponent(scan.jobOrder.ref)}`} style={LINK}>
                      {scan.jobOrder.ref}
                    </Link>
                    <Badge tone={jobStatusTone(scan.jobOrder.status)}>{jobOrderLabel(scan.jobOrder.status)}</Badge>
                  </span>
                ) : (
                  scan.quotation && <span style={{ color: "var(--text-muted)" }}>Job order not recorded yet</span>
                )}
              </span>
              <Icon name={expanded ? "chevron-down" : "chevron-right"} size={15} style={{ marginTop: 4, color: "var(--text-muted)" }} />
            </div>

            {expanded && <ScanTrail scan={scan} />}
          </div>
        );
      })}

      {visible.length === 0 && (
        <div style={{ padding: "30px 10px", textAlign: "center", fontSize: "12.5px", color: "var(--text-muted)" }}>
          {scans.length === 0
            ? "Nothing scanned yet. Scan a paper job order from New quotation."
            : "No scans match this search."}
        </div>
      )}
    </section>
  );
}

/** From the scan to now: who scanned it, what the AI read, then every change to its quotation and the job order. */
function ScanTrail({ scan }: { scan: ScanRecord }) {
  const steps: { at: string; by: string; detail: string }[] = [
    { at: scan.when, by: scan.by, detail: `Scanned (${scan.ref}).` },
    { at: scan.when, by: "AI", detail: scan.readAs ? scan.note : "Could not be read." },
    ...scan.events.map((event) => ({
      at: event.at,
      by: event.by,
      detail: event.revision > 1 ? `Rev ${event.revision}: ${event.detail}` : event.detail,
    })),
  ];
  return (
    <div className="flex flex-col gap-2" style={{ margin: "10px 0 2px 68px" }}>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {steps.map((step, index) => (
          <li key={index} className="flex gap-2.5" style={{ fontSize: "12px" }}>
            <span
              aria-hidden
              style={{ width: 7, height: 7, marginTop: 5, flex: "0 0 auto", borderRadius: "var(--radius-pill)", background: "var(--border-strong, var(--gray-400))" }}
            />
            <span className="flex min-w-0 flex-col">
              <span style={{ textWrap: "pretty" }}>{step.detail}</span>
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                {step.at} · {step.by}
              </span>
            </span>
          </li>
        ))}
      </ol>
      <span className="flex flex-wrap gap-3 wide:hidden" style={{ fontSize: "12px" }}>
        {scan.quotation && (
          <Link href={`/quotations/${encodeURIComponent(scan.quotation.ref)}`} style={LINK}>
            {scan.quotation.ref} · {scan.quotation.status} · {formatPeso(scan.quotation.totalCents)}
          </Link>
        )}
        {scan.jobOrder && (
          <Link href={`/quotations/jobs/${encodeURIComponent(scan.jobOrder.ref)}`} style={LINK}>
            {scan.jobOrder.ref} · {jobOrderLabel(scan.jobOrder.status)}
          </Link>
        )}
      </span>
    </div>
  );
}
