"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { setJobOrderStatusAction } from "@/app/actions/quotations";
import { useToast } from "@/components/layout/toast-provider";
import { Badge, Button, Icon } from "@/components/ui";
import { Notice } from "@/components/forms/form-kit";
import { jobStartRefusal } from "@/lib/job-orders";
import { formatPeso } from "@/lib/quotations";
import { jobStatusTone } from "./job-orders-panel";
import type { BookingStatus, JobOrder, JobOrderStatus } from "@/types";

/** The one next step for each status, plus a way back where it makes sense. Cancelled is final. */
const NEXT: Record<JobOrderStatus, { status: JobOrderStatus; label: string; icon: string; quiet?: boolean }[]> = {
  Open: [{ status: "In progress", label: "Start work", icon: "wrench" }],
  "In progress": [
    { status: "Open", label: "Back to open", icon: "arrow-left", quiet: true },
    { status: "Completed", label: "Mark completed", icon: "check" },
  ],
  Completed: [{ status: "In progress", label: "Reopen", icon: "refresh-cw", quiet: true }],
  Cancelled: [],
};

const CARD = {
  background: "var(--surface-card)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-card)",
} as const;

export function JobOrderView({
  jobOrder,
  booking,
}: {
  jobOrder: JobOrder;
  /** The linked booking and its status. Null with no booking or with Bookings off. */
  booking: { ref: string; status: BookingStatus } | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const startBlocked = jobOrder.status === "Open" ? jobStartRefusal("In progress", booking) : null;

  const move = (status: JobOrderStatus) => {
    if (status === "Cancelled" && !window.confirm(`Cancel ${jobOrder.ref}? This cannot be undone.`)) return;
    startTransition(async () => {
      const result = await setJobOrderStatusAction(jobOrder.ref, status);
      if (!result.ok) {
        toast({ tone: "error", title: "Status not changed", description: result.error, key: "job-status" });
        return;
      }
      toast({
        tone: "success",
        title: `${jobOrder.ref}: ${status}`,
        description: result.bookingNote ?? undefined,
        key: "job-status",
      });
      router.refresh();
    });
  };

  const subtotal = jobOrder.lines.reduce((sum, line) => sum + Math.round(line.qty * line.unitPriceCents), 0);
  const vehicle = [jobOrder.vehicle.plate, jobOrder.vehicle.makeModel].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/quotations?tab=jobs"
          className="inline-flex items-center gap-1.5"
          style={{ fontSize: "12.5px", color: "var(--text-secondary)", textDecoration: "none" }}
        >
          <Icon name="arrow-left" size={14} />
          Job orders
        </Link>
        <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "22px", lineHeight: "28px", fontWeight: 700, letterSpacing: "-.02em" }}>
          {jobOrder.ref}
        </h2>
        <Badge tone={jobStatusTone(jobOrder.status)}>{jobOrder.status}</Badge>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {jobOrder.status !== "Cancelled" && jobOrder.status !== "Completed" && (
            <Button variant="ghost" disabled={pending} onClick={() => move("Cancelled")}>
              Cancel job
            </Button>
          )}
          {NEXT[jobOrder.status].map((step) => (
            <Button
              key={step.status}
              variant={step.quiet ? "secondary" : "primary"}
              icon={step.icon}
              disabled={pending || (step.status === "In progress" && startBlocked !== null)}
              title={step.status === "In progress" ? (startBlocked ?? undefined) : undefined}
              onClick={() => move(step.status)}
            >
              {step.label}
            </Button>
          ))}
        </div>
      </div>

      {startBlocked && <Notice tone="warning">{startBlocked}</Notice>}

      <section className="grid grid-cols-2 gap-x-6 gap-y-3 wide:grid-cols-4" style={{ ...CARD, padding: "14px 16px" }}>
        <Fact label="Customer" value={jobOrder.billTo.name || jobOrder.billTo.company || "—"} sub={jobOrder.billTo.phone} />
        <Fact label="Vehicle" value={vehicle || "—"} />
        <Fact label="Approved" value={formatPeso(jobOrder.approvedTotalCents)} sub={`${jobOrder.approvedByCustomer} · ${jobOrder.approvedAt}`} />
        <Fact
          label="From"
          value={
            <Link href={`/quotations/${encodeURIComponent(jobOrder.quotationRef)}`} style={{ color: "var(--accent-primary)", textDecoration: "none" }}>
              {jobOrder.quotationRef} rev {jobOrder.quotationRevision}
            </Link>
          }
          sub={
            booking ? (
              <Link href={`/bookings?booking=${encodeURIComponent(booking.ref)}`} style={{ color: "var(--accent-primary)", textDecoration: "none" }}>
                {booking.ref} · {booking.status}
              </Link>
            ) : (
              (jobOrder.bookingRef ?? "No booking")
            )
          }
        />
      </section>

      <section style={{ ...CARD, padding: "6px 16px 14px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px", fontVariantNumeric: "tabular-nums" }}>
          <thead>
            <tr style={{ color: "var(--text-muted)", fontSize: "11px", textAlign: "left" }}>
              <th style={{ padding: "8px 0", fontWeight: 600 }}>Work</th>
              <th style={{ padding: "8px 0", fontWeight: 600, textAlign: "right", width: 60 }}>Qty</th>
              <th style={{ padding: "8px 0", fontWeight: 600, textAlign: "right", width: 120 }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {jobOrder.lines.map((line) => (
              <tr key={line.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <td style={{ padding: "8px 0" }}>
                  {line.description}
                  {line.section === "labor" && <span style={{ color: "var(--text-muted)" }}> · labor</span>}
                </td>
                <td style={{ padding: "8px 0", textAlign: "right" }}>{line.qty}</td>
                <td style={{ padding: "8px 0", textAlign: "right" }}>{formatPeso(Math.round(line.qty * line.unitPriceCents))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto flex flex-col gap-1" style={{ maxWidth: 320, paddingTop: 10, borderTop: "1px solid var(--border-default)" }}>
          {jobOrder.discountCents > 0 && (
            <>
              <Total label="Subtotal" value={formatPeso(subtotal)} />
              <Total label="Discount" value={`− ${formatPeso(jobOrder.discountCents)}`} />
            </>
          )}
          <Total label="Total" value={formatPeso(jobOrder.approvedTotalCents)} strong />
          <span style={{ fontSize: "11px", color: "var(--text-muted)", textAlign: "right" }}>
            Internal: cost {jobOrder.costedLines ? formatPeso(jobOrder.quotedCostCents) : "—"} · profit{" "}
            {jobOrder.costedLines ? formatPeso(jobOrder.quotedMarginCents) : "—"}
            {jobOrder.quotedMarginPercent === null ? "" : ` (${jobOrder.quotedMarginPercent.toFixed(1)}%)`}
          </span>
        </div>
      </section>

      <span style={{ fontSize: "11.5px", color: "var(--text-muted)", textWrap: "pretty" }}>
        {booking
          ? `Booking ${booking.ref} follows this job order, and its sale is counted once, at the approved amount.`
          : "Not linked to a booking, so no sale is recorded from it yet."}
      </span>
    </div>
  );
}

function Fact({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col" style={{ gap: 2 }}>
      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontSize: "13px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{value}</span>
      {sub ? <span style={{ fontSize: "11.5px", color: "var(--text-secondary)" }}>{sub}</span> : null}
    </div>
  );
}

function Total({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span style={{ fontSize: "12.5px", color: strong ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: strong ? 700 : 400 }}>
        {label}
      </span>
      <span style={{ fontSize: strong ? "16px" : "12.5px", fontWeight: strong ? 700 : 500, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
    </div>
  );
}
