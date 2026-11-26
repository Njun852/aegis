"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge, Icon } from "@/components/ui";
import { ColumnLabel } from "@/components/forms/form-kit";
import { activateOnKey } from "@/lib/interaction";
import { JOB_PERIODS, inJobPeriod, jobOrderLabel, type JobPeriod } from "@/lib/job-orders";
import { filterJobOrders, formatPeso } from "@/lib/quotations";
import type { JobOrderStatus, JobOrderSummary } from "@/types";

const GRID =
  "grid gap-3 items-center grid-cols-[92px_minmax(150px,1.3fr)_110px_20px] wide:grid-cols-[92px_minmax(170px,1.4fr)_minmax(0,1fr)_120px_110px_130px_22px]";

/** A job order is recorded or cancelled; it has no progress of its own. */
export function jobStatusTone(status: JobOrderStatus): "positive" | "negative" {
  return status === "Cancelled" ? "negative" : "positive";
}

const LABELS = ["Recorded", "Cancelled"] as const;

/**
 * Every job order, newest activity first, narrowed by status and by the search
 * box above the tabs. They are made from approved quotations, never typed in.
 */
export function JobOrdersPanel({ jobOrders, search }: { jobOrders: JobOrderSummary[]; search: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<(typeof LABELS)[number] | "All">("All");
  const [period, setPeriod] = useState<JobPeriod>("all");
  // One "now" for the whole screen, so the chips and the list agree.
  const [now] = useState(() => new Date());
  const inPeriod = useMemo(() => jobOrders.filter((job) => inJobPeriod(job.createdAt, period, now)), [jobOrders, period, now]);
  const visible = useMemo(
    () => filterJobOrders(inPeriod, { status: "All", search }).filter((job) => status === "All" || jobOrderLabel(job.status) === status),
    [inPeriod, status, search],
  );
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
      <div className="flex flex-wrap items-center gap-2">
        {/* When the job order was made, in Manila time. */}
        <span className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Made">
          <Icon name="calendar" size={14} style={{ color: "var(--text-muted)", marginRight: 2 }} />
          {JOB_PERIODS.map(({ key, label }) => (
            <Chip
              key={key}
              label={label}
              count={key === "all" ? jobOrders.length : jobOrders.filter((job) => inJobPeriod(job.createdAt, key, now)).length}
              active={period === key}
              onClick={() => setPeriod(key)}
            />
          ))}
        </span>
        <span aria-hidden style={{ width: 1, height: 20, background: "var(--border-default)", margin: "0 4px" }} />
        <span className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Status">
          {(["All", ...LABELS] as const).map((filter) => {
            const active = status === filter;
            const count = filter === "All" ? inPeriod.length : inPeriod.filter((job) => jobOrderLabel(job.status) === filter).length;
            // Like the quotation chips: a status with nothing in it is not offered.
            if (filter !== "All" && count === 0 && !active) return null;
            return <Chip key={filter} label={filter} count={count} active={active} onClick={() => setStatus(filter)} />;
          })}
        </span>
        <span className="ml-auto" style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
          {visible.length} of {jobOrders.length} shown · latest first
        </span>
      </div>

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
        {visible.map((job) => {
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
                <Badge tone={jobStatusTone(job.status)}>{jobOrderLabel(job.status)}</Badge>
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
        {visible.length === 0 && (
          <div style={{ padding: "30px 10px", textAlign: "center", fontSize: "12.5px", color: "var(--text-muted)", textWrap: "pretty" }}>
            {jobOrders.length === 0
              ? "No job orders yet. Record a customer’s approval on a quotation, then use “Make job order”."
              : inPeriod.length === 0
                ? `No job orders made ${JOB_PERIODS.find((entry) => entry.key === period)?.label.toLowerCase()}.`
                : "No job orders match this search."}
          </div>
        )}
      </div>
    </section>
  );
}

function Chip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "7px",
        height: 30,
        padding: "0 12px",
        borderRadius: "var(--radius-pill)",
        border: `1px solid ${active ? "var(--blue-200)" : "var(--border-default)"}`,
        cursor: "pointer",
        fontFamily: "var(--font-body)",
        fontSize: "12px",
        fontWeight: active ? 700 : 500,
        color: active ? "var(--blue-600)" : "var(--text-primary)",
        background: active ? "var(--accent-soft)" : "var(--surface-card)",
      }}
    >
      {label}
      <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-muted)" }}>{count}</span>
    </button>
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
