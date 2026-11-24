"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { cancelJobOrderAction, returnJobStockAction, takeJobStockAction } from "@/app/actions/quotations";
import { useToast } from "@/components/layout/toast-provider";
import { Badge, Button, Icon } from "@/components/ui";
import { Notice } from "@/components/forms/form-kit";
import { jobOrderLabel } from "@/lib/job-orders";
import { formatPeso } from "@/lib/quotations";
import { jobStatusTone } from "./job-orders-panel";
import { ScanBeside, ScanPane, SideBySideToggle, useSideBySide } from "./scan-beside";
import type { BookingStatus, JobOrder, JobOrderEvent, JobOrderLineView, QuotePhotoView } from "@/types";

const CARD = {
  background: "var(--surface-card)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-card)",
} as const;

export function JobOrderView({
  jobOrder,
  booking,
  inventoryEnabled,
  photo,
  events,
}: {
  jobOrder: JobOrder;
  /** The linked booking and its status. Null with no booking or with Bookings off. */
  booking: { ref: string; status: BookingStatus } | null;
  /** The business keeps Inventory, so linked parts can be taken from stock. */
  inventoryEnabled: boolean;
  /** The scanned paper job order (or photo) the work was read from. */
  photo: QuotePhotoView | null;
  /** The job order's history, newest first. */
  events: JobOrderEvent[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [sideBySide, setSideBySide] = useSideBySide();
  const cancelled = jobOrder.status === "Cancelled";
  const holding = jobOrder.lines.filter((line) => line.stockState === "taken").length;

  // A job order is a record of the agreed work: nothing to start or complete. Cancelling is its one change.
  const cancel = () => {
    const giveBack =
      holding === 1
        ? " The part taken from stock goes back to Inventory."
        : holding > 1
          ? ` The ${holding} parts taken from stock go back to Inventory.`
          : "";
    if (!window.confirm(`Cancel ${jobOrder.ref}? This cannot be undone.${giveBack}`)) return;
    startTransition(async () => {
      const result = await cancelJobOrderAction(jobOrder.ref);
      if (!result.ok) {
        toast({ tone: "error", title: "Not cancelled", description: result.error, key: "job-status" });
        return;
      }
      toast({
        tone: "success",
        title: `${jobOrder.ref} cancelled`,
        description: result.stockNote ?? undefined,
        key: "job-status",
      });
      router.refresh();
    });
  };

  const takeStock = () => {
    startTransition(async () => {
      const result = await takeJobStockAction(jobOrder.ref);
      if (!result.ok) {
        toast({ tone: "error", title: "No stock taken", description: result.error, key: "job-stock" });
        return;
      }
      toast({
        tone: result.taken ? "success" : "error",
        title: result.taken ? `Parts taken from Inventory` : "No stock taken",
        description: result.stockNote ?? "Nothing was waiting for stock.",
        key: "job-stock",
      });
      router.refresh();
    });
  };

  const giveBackStock = () => {
    startTransition(async () => {
      const result = await returnJobStockAction(jobOrder.ref);
      if (!result.ok) {
        toast({ tone: "error", title: "Nothing put back", description: result.error, key: "job-stock" });
        return;
      }
      toast({
        tone: result.failed.length ? "error" : "success",
        title: `${result.returned} ${result.returned === 1 ? "part" : "parts"} put back in Inventory`,
        description: result.failed.length ? `Not put back: ${result.failed.join(" ")}` : undefined,
        key: "job-stock",
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
        <Badge tone={jobStatusTone(jobOrder.status)}>{jobOrderLabel(jobOrder.status)}</Badge>
        {photo && <SideBySideToggle on={sideBySide} onChange={setSideBySide} />}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!cancelled && (
            <Link
              href={`/quotations/${encodeURIComponent(jobOrder.quotationRef)}`}
              className="inline-flex items-center gap-1.5"
              style={{ fontSize: "12.5px", color: "var(--accent-primary)", textDecoration: "none", fontWeight: 600, marginRight: 4 }}
            >
              <Icon name="pen-line" size={14} />
              Change on {jobOrder.quotationRef}
            </Link>
          )}
          {!cancelled && (
            <Button variant="ghost" disabled={pending} onClick={cancel}>
              Cancel job
            </Button>
          )}
        </div>
      </div>

      {inventoryEnabled && !cancelled && jobOrder.waitingLines > 0 && (
        <Notice tone="warning">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span style={{ flex: "1 1 260px" }}>
              {jobOrder.waitingLines === 1 ? "1 part has" : `${jobOrder.waitingLines} parts have`} not been taken from
              Inventory yet, so {jobOrder.waitingLines === 1 ? "its" : "their"} quoted cost stands in for the actual
              one. Take them once the stock is in.
            </span>
            <Button variant="secondary" icon="package" disabled={pending} onClick={takeStock}>
              Take from stock
            </Button>
          </span>
        </Notice>
      )}

      {cancelled && holding > 0 && (
        <Notice tone="warning">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span style={{ flex: "1 1 260px" }}>
              This job order was cancelled but still holds {holding === 1 ? "1 part" : `${holding} parts`} taken from
              Inventory.
            </span>
            <Button variant="secondary" icon="arrow-left" disabled={pending} onClick={giveBackStock}>
              Put back in stock
            </Button>
          </span>
        </Notice>
      )}

      <ScanBeside photoRef={photo?.ref ?? null} note={photo?.note} on={sideBySide}>
      <section
        className={photo && sideBySide ? "grid grid-cols-2 gap-x-6 gap-y-3" : "grid grid-cols-2 gap-x-6 gap-y-3 wide:grid-cols-4"}
        style={{ ...CARD, padding: "14px 16px" }}
      >
        <Fact label="Customer" value={jobOrder.billTo.name || jobOrder.billTo.company || "—"} sub={jobOrder.billTo.phone} />
        <Fact label="Vehicle" value={vehicle || "—"} />
        <Fact label="Approved" value={formatPeso(jobOrder.approvedTotalCents)} sub={`${jobOrder.poNumber ? `PO ${jobOrder.poNumber} · ` : ""}${jobOrder.approvedByCustomer} · ${jobOrder.approvedAt}`} />
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
              <th style={{ padding: "8px 0", fontWeight: 600, textAlign: "right", width: 48 }}>Qty</th>
              <th style={{ padding: "8px 0 8px 8px", fontWeight: 600, textAlign: "right", width: 104 }} title="Internal, never printed">
                Cost
              </th>
              <th style={{ padding: "8px 0 8px 8px", fontWeight: 600, textAlign: "right", width: 104 }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {jobOrder.lines.map((line) => (
              <tr key={line.id} style={{ borderTop: "1px solid var(--border-subtle)", verticalAlign: "top" }}>
                <td style={{ padding: "8px 0" }}>
                  {line.description}
                  {line.section === "labor" && <span style={{ color: "var(--text-muted)" }}> · labor</span>}
                  <StockLine line={line} />
                </td>
                <td style={{ padding: "8px 0", textAlign: "right" }}>{line.qty}</td>
                <td style={{ padding: "8px 0 8px 8px", textAlign: "right" }}>
                  <LineCost line={line} />
                </td>
                <td style={{ padding: "8px 0 8px 8px", textAlign: "right" }}>{formatPeso(Math.round(line.qty * line.unitPriceCents))}</td>
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
        </div>

        <div
          className="ml-auto flex flex-col gap-1"
          style={{
            maxWidth: 320,
            marginTop: 10,
            padding: "8px 10px",
            borderRadius: "var(--radius-md)",
            background: "var(--surface-inset)",
            fontSize: "11.5px",
          }}
        >
          <CostRow
            label="Quoted"
            cost={jobOrder.costedLines ? jobOrder.quotedCostCents : null}
            profit={jobOrder.costedLines ? jobOrder.quotedMarginCents : null}
            percent={jobOrder.quotedMarginPercent}
          />
          <CostRow
            label="Actual"
            cost={jobOrder.stockLines || jobOrder.costedLines ? jobOrder.actualCostCents : null}
            profit={jobOrder.stockLines || jobOrder.costedLines ? jobOrder.actualMarginCents : null}
            percent={jobOrder.actualMarginPercent}
            strong
          />
        </div>
      </section>

      {booking && (
        <span style={{ fontSize: "11.5px", color: "var(--text-muted)", textWrap: "pretty" }}>
          Booking {booking.ref} follows this job order, and its sale is counted once, at the approved amount.
        </span>
      )}
      <JobHistory events={events} created={`${jobOrder.created} · ${jobOrder.createdBy}`} quotationRef={jobOrder.quotationRef} />
      </ScanBeside>

      {photo && !sideBySide && <ScanPane photoRef={photo.ref} note={photo.note} />}
    </div>
  );
}

/** Where a line stands with Inventory, under its description. */
function StockLine({ line }: { line: JobOrderLineView }) {
  if (line.stockState === "none") return null;
  const tone = {
    taken: { text: `From stock · ${line.stockNote}`, color: "var(--text-muted)" },
    returned: { text: line.stockNote ?? "Put back in stock", color: "var(--text-muted)" },
    waiting: { text: "Not taken from stock yet", color: "var(--text-secondary)" },
  }[line.stockState];
  return (
    <span
      style={{
        display: "block",
        fontSize: "11px",
        color: tone.color,
        fontWeight: line.stockState === "waiting" ? 600 : 400,
        marginTop: 2,
      }}
    >
      {tone.text}
    </span>
  );
}

/**
 * The line's cost: what its stock cost when taken, otherwise the quoted cost,
 * labelled so the two are never mistaken for each other.
 */
function LineCost({ line }: { line: JobOrderLineView }) {
  const quoted = line.quotedCostCents === null ? null : Math.round(line.qty * line.quotedCostCents);
  if (line.actualCostCents !== null) {
    const diff = quoted === null ? 0 : line.actualCostCents - quoted;
    return (
      <span className="flex flex-col items-end" style={{ gap: 1 }}>
        <span style={{ fontWeight: 600 }}>{formatPeso(line.actualCostCents)}</span>
        {quoted !== null && diff !== 0 && (
          <span style={{ fontSize: "11px", color: diff > 0 ? "var(--status-negative-ink)" : "var(--text-muted)" }}>
            {diff > 0 ? "+" : "−"}
            {formatPeso(Math.abs(diff))} vs quoted
          </span>
        )}
      </span>
    );
  }
  if (quoted === null) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  return (
    <span className="flex flex-col items-end" style={{ gap: 1, color: "var(--text-secondary)" }}>
      {formatPeso(quoted)}
      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>quoted</span>
    </span>
  );
}

function CostRow({
  label,
  cost,
  profit,
  percent,
  strong,
}: {
  label: string;
  cost: number | null;
  profit: number | null;
  percent: number | null;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3" style={{ fontVariantNumeric: "tabular-nums" }}>
      <span style={{ color: strong ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: strong ? 600 : 400 }}>{label}</span>
      <span style={{ fontWeight: strong ? 600 : 400, textAlign: "right" }}>
        cost {cost === null ? "—" : formatPeso(cost)} · profit {profit === null ? "—" : formatPeso(profit)}
        {percent === null ? "" : ` (${percent.toFixed(1)}%)`}
      </span>
    </div>
  );
}

/**
 * What happened to the job order since it was made, newest first: changes
 * made on its quotation, stock taken and put back, cancelling. Job orders
 * made before the history was kept show only when they were made.
 */
function JobHistory({ events, created, quotationRef }: { events: JobOrderEvent[]; created: string; quotationRef: string }) {
  // Job orders made before the history was kept still show where they began.
  const made = { kind: "created" as const, detail: `Made from ${quotationRef}.`, by: created.split(" · ").pop() ?? "", at: created.split(" · ").slice(0, 2).join(" · ") };
  const rows = events.some((event) => event.kind === "created") ? events : [...events, made];
  return (
    <section style={{ ...CARD, padding: "12px 16px" }}>
      <h3 className="flex items-center gap-2" style={{ margin: "0 0 10px", fontSize: "13px", fontWeight: 700 }}>
        <Icon name="clock" size={14} />
        History
      </h3>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 9 }}>
        {rows.map((event, index) => (
          <li key={index} className="flex gap-2.5" style={{ fontSize: "12.5px" }}>
            <span aria-hidden style={{ width: 7, height: 7, marginTop: 6, flex: "0 0 auto", borderRadius: "var(--radius-pill)", background: "var(--gray-400)" }} />
            <span className="flex min-w-0 flex-col">
              <span style={{ textWrap: "pretty" }}>{event.detail}</span>
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                {event.at} · {event.by}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
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
