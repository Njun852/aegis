"use client";

import { useRouter } from "next/navigation";
import { Badge, Icon } from "@/components/ui";
import { ColumnLabel } from "@/components/forms/form-kit";
import { activateOnKey } from "@/lib/interaction";
import { formatPeso } from "@/lib/quotations";
import type { JobOrderStatus, JobOrderSummary } from "@/types";

const GRID =
  "grid gap-3 items-center grid-cols-[92px_minmax(150px,1.3fr)_110px_20px] wide:grid-cols-[92px_minmax(170px,1.4fr)_minmax(0,1fr)_120px_110px_130px_22px]";

export function jobStatusTone(status: JobOrderStatus): "positive" | "warning" | "accent" | "neutral" | "negative" {
  switch (status) {
    case "Completed":
      return "positive";
    case "In progress":
      return "accent";
    case "Cancelled":
      return "negative";
    default:
      return "warning";
  }
}

/** Every job order, newest activity first. They are made from approved quotations, never typed in. */
export function JobOrdersPanel({ jobOrders }: { jobOrders: JobOrderSummary[] }) {
  const router = useRouter();
  return (
    <section
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-card)",
        padding: "12px 12px 10px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        minWidth: 0,
      }}
    >
      <div className={GRID} style={{ padding: "0 10px 8px", borderBottom: "1px solid var(--border-subtle)" }}>
        <ColumnLabel>Job no</ColumnLabel>
        <ColumnLabel>Customer</ColumnLabel>
        <ColumnLabel className="hidden wide:block">Vehicle</ColumnLabel>
        <ColumnLabel className="hidden wide:block">From</ColumnLabel>
        <ColumnLabel className="hidden wide:block">Status</ColumnLabel>
        <ColumnLabel align="right">Approved</ColumnLabel>
        <span />
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {jobOrders.map((job) => {
          const open = () => router.push(`/quotations/jobs/${encodeURIComponent(job.ref)}`);
          return (
            <div
              key={job.ref}
              role="link"
              tabIndex={0}
              aria-label={`${job.ref}, ${job.customer}, ${job.status}`}
              onClick={open}
              onKeyDown={activateOnKey(open)}
              className={GRID}
              style={{ padding: "10px", borderRadius: "10px", cursor: "pointer", borderBottom: "1px solid var(--gray-50)" }}
            >
              <Cell mono strong>
                {job.ref}
              </Cell>
              <span className="flex min-w-0 flex-col leading-tight">
                <Cell strong>{job.customer || "No name"}</Cell>
                <Cell muted>{job.created}</Cell>
              </span>
              <span className="hidden min-w-0 flex-col leading-tight wide:flex">
                <Cell mono strong>
                  {job.plate || "—"}
                </Cell>
                <Cell muted>{job.makeModel || " "}</Cell>
              </span>
              <span className="hidden min-w-0 flex-col leading-tight wide:flex">
                <Cell mono>{`${job.quotationRef} r${job.quotationRevision}`}</Cell>
                <Cell muted>{job.bookingRef ?? "No booking"}</Cell>
              </span>
              <span className="hidden wide:block">
                <Badge tone={jobStatusTone(job.status)}>{job.status}</Badge>
              </span>
              <span className="flex justify-end">
                <Cell strong>{formatPeso(job.approvedTotalCents)}</Cell>
              </span>
              <span style={{ color: "var(--text-muted)", display: "inline-flex", justifyContent: "flex-end" }}>
                <Icon name="chevron-right" size={15} />
              </span>
            </div>
          );
        })}
        {jobOrders.length === 0 && (
          <div style={{ padding: "30px 10px", textAlign: "center", fontSize: "12.5px", color: "var(--text-muted)", textWrap: "pretty" }}>
            No job orders yet. Record a customer&apos;s approval on a quotation, then use “Make job order”.
          </div>
        )}
      </div>
    </section>
  );
}

function Cell({ children, mono, strong, muted }: { children: React.ReactNode; mono?: boolean; strong?: boolean; muted?: boolean }) {
  return (
    <span
      style={{
        display: "block",
        fontSize: muted ? "11px" : "12.5px",
        fontWeight: strong ? 500 : 400,
        color: muted ? "var(--text-muted)" : "var(--text-primary)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        fontVariantNumeric: "tabular-nums",
        fontFamily: mono ? "var(--font-mono)" : undefined,
      }}
    >
      {children}
    </span>
  );
}
