"use client";

import { Badge, Icon } from "@/components/ui";
import { formatPeso, quoteStatusTone } from "@/lib/quotations";
import type { Quotation, QuotationRevisionSummary, QuoteEvent } from "@/types";

export interface QuoteHistoryProps {
  quotation: Quotation;
  revisions: QuotationRevisionSummary[];
  events: QuoteEvent[];
}

function revisionPdf(ref: string, revision: number) {
  return `/api/quotations/${encodeURIComponent(ref)}/pdf?rev=${revision}`;
}

/**
 * Every version the customer could have held, each with its own PDF, and the
 * log of what was done and by whom. Folded away by default: it is the record,
 * read when someone asks, not part of writing the quotation.
 */
export function QuoteHistory({ quotation, revisions, events }: QuoteHistoryProps) {
  const versions = [
    {
      revision: quotation.revision,
      status: quotation.status,
      totalCents: quotation.totals.totalCents,
      when: quotation.sent ? `Sent ${quotation.sent}` : "Not sent",
      current: true,
    },
    ...revisions.map((entry) => ({
      revision: entry.revision,
      status: entry.response ?? entry.status,
      totalCents: entry.totalCents,
      when: `Replaced ${entry.superseded}`,
      current: false,
    })),
  ];

  return (
    <details
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <summary
        className="flex cursor-pointer items-center gap-2"
        style={{ padding: "12px 14px", fontSize: "13px", fontWeight: 700, listStyle: "none" }}
      >
        <Icon name="clock" size={14} />
        History
        <span style={{ fontWeight: 400, fontSize: "12px", color: "var(--text-muted)" }}>
          {versions.length} {versions.length === 1 ? "version" : "versions"} · {events.length}{" "}
          {events.length === 1 ? "change" : "changes"}
        </span>
        <span className="ml-auto" style={{ color: "var(--text-muted)" }}>
          <Icon name="chevron-down" size={14} />
        </span>
      </summary>

      <div className="grid gap-4 wide:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" style={{ padding: "0 14px 14px" }}>
        <div className="flex flex-col">
          {versions.map((entry) => (
            <div
              key={entry.revision}
              className="flex items-center justify-between gap-3"
              style={{ padding: "8px 0", borderBottom: "1px solid var(--border-subtle)" }}
            >
              <span className="flex min-w-0 flex-col" style={{ gap: 2 }}>
                <span className="flex items-center gap-1.5" style={{ fontSize: "12.5px", fontWeight: 600 }}>
                  Rev {entry.revision}
                  <Badge tone={quoteStatusTone(entry.status)}>{entry.status}</Badge>
                </span>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  {formatPeso(entry.totalCents)} · {entry.when}
                </span>
              </span>
              <a
                href={revisionPdf(quotation.ref, entry.revision)}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: "11.5px", color: "var(--accent-primary)", textDecoration: "none", flex: "0 0 auto" }}
              >
                PDF
              </a>
            </div>
          ))}
        </div>

        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {events.map((event, index) => (
            <li key={index} className="flex flex-col" style={{ fontSize: "12px", lineHeight: 1.4 }}>
              <span style={{ textWrap: "pretty" }}>{event.detail}</span>
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                {event.at} · {event.by}
              </span>
            </li>
          ))}
          {events.length === 0 && <li style={{ fontSize: "12px", color: "var(--text-muted)" }}>Nothing logged yet.</li>}
        </ol>
      </div>
    </details>
  );
}
