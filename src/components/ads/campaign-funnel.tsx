"use client";

import Link from "next/link";
import { Modal } from "@/components/forms/form-kit";
import { Badge, Icon } from "@/components/ui";
import type { CampaignFunnel, CampaignFunnelRow } from "@/types";

/**
 * The campaigns table on the Ads screen carries the funnel's columns itself
 * (confirmed bookings, cost per booking). What lives here is what hangs off
 * it: the flagged campaigns shown beside the AI insight, and the list of
 * bookings behind one campaign's number.
 */

/** Campaigns the funnel singled out, for the side column. Nothing when none were. */
export function FunnelSignals({
  funnel,
  onOpen,
}: {
  funnel: CampaignFunnel;
  onOpen: (campaignId: string) => void;
}) {
  const flagged = funnel.rows.filter((row) => row.flag);
  if (flagged.length === 0) return null;

  return (
    <section
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-lg)",
        padding: "14px 14px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "14px", fontWeight: 700 }}>
        Worth a look
      </h3>
      <div className="flex flex-col gap-1.5">
        {flagged.map((row) => {
          const warning = row.flag!.tone === "warning";
          return (
            <button
              key={row.campaignId}
              type="button"
              onClick={() => onOpen(row.campaignId)}
              className="flex items-start gap-2"
              style={{
                border: "none",
                textAlign: "left",
                cursor: "pointer",
                padding: "8px 10px",
                borderRadius: "var(--radius-md)",
                fontFamily: "var(--font-body)",
                fontSize: "12px",
                lineHeight: 1.45,
                color: "var(--text-primary)",
                background: warning ? "var(--status-warning-soft)" : "var(--status-positive-soft)",
              }}
            >
              <span style={{ flex: "0 0 auto", marginTop: 2, display: "inline-flex" }}>
                <Icon
                  name={warning ? "alert-triangle" : "trending-up"}
                  size={13}
                  color={warning ? "var(--status-warning)" : "var(--status-positive)"}
                />
              </span>
              <span style={{ minWidth: 0, textWrap: "pretty" }}>
                <strong>{row.name}</strong> {row.flag!.text}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** The bookings credited to one campaign over the funnel's days, counted and not. */
export function CampaignBookingsModal({
  row,
  funnel,
  money,
  onClose,
}: {
  row: CampaignFunnelRow;
  funnel: CampaignFunnel;
  money: (cents: number | null) => string;
  onClose: () => void;
}) {
  const bookings = funnel.bookings.filter((booking) => booking.campaignId === row.campaignId);
  const counted = bookings.filter((booking) => booking.counted);
  const notCounted = bookings.filter((booking) => !booking.counted);

  return (
    <Modal title={row.name} icon="megaphone" onClose={onClose} width={620}>
      <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{funnel.periodLabel}</span>
      <div className="grid grid-cols-2 gap-2 wide:grid-cols-4">
        {[
          { label: "Spend", value: funnel.missingFigures ? "—" : money(row.spendCents) },
          { label: "Confirmed bookings", value: String(row.confirmedBookings) },
          { label: "Cost per booking", value: money(row.costPerBookingCents) },
          { label: "Conversion", value: row.conversionPercent === null ? "—" : `${row.conversionPercent}%` },
        ].map((tile) => (
          <div key={tile.label} style={{ padding: "9px 10px", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}>
            <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: ".06em", color: "var(--text-muted)" }}>{tile.label}</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "16px", fontWeight: 700 }}>{tile.value}</div>
          </div>
        ))}
      </div>
      <span style={{ fontSize: "11.5px", color: "var(--text-muted)", textWrap: "pretty" }}>
        {funnel.missingFigures ? (
          `${funnel.missingFigures} `
        ) : (
          <>
            {money(row.spendCents)} ÷ {row.confirmedBookings} confirmed {row.confirmedBookings === 1 ? "booking" : "bookings"} ={" "}
            {money(row.costPerBookingCents)}.{" "}
          </>
        )}
        {row.conversations !== null && `Meta reports ${row.conversations} conversations started. `}
        AEGIS received {row.chatsReceived} {row.chatsReceived === 1 ? "chat" : "chats"} from this campaign&apos;s ads.
      </span>

      <BookingList title={`Counted (${counted.length})`} bookings={counted} empty="No confirmed bookings in this period." />
      {notCounted.length > 0 && (
        <BookingList
          title={`Not counted (${notCounted.length})`}
          note="Still a request, or cancelled."
          bookings={notCounted}
          empty=""
        />
      )}
    </Modal>
  );
}

function BookingList({
  title,
  note,
  bookings,
  empty,
}: {
  title: string;
  note?: string;
  bookings: CampaignFunnel["bookings"];
  empty: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span style={{ fontSize: "12px", fontWeight: 700 }}>
        {title}
        {note && <span style={{ fontWeight: 400, color: "var(--text-muted)" }}> · {note}</span>}
      </span>
      {bookings.map((booking) => (
        <Link
          key={booking.ref}
          href={`/bookings?booking=${encodeURIComponent(booking.ref)}`}
          className="flex items-center gap-2"
          style={{ padding: "7px 9px", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", textDecoration: "none", color: "var(--text-primary)", fontSize: "12px" }}
        >
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px" }}>{booking.ref}</span>
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {booking.customer} · {booking.service}
          </span>
          <span style={{ color: "var(--text-muted)" }}>
            {booking.madeDay} · {booking.origin === "messenger" ? "Messenger" : "manual"}
          </span>
          <Badge tone={booking.counted ? "positive" : "neutral"}>{booking.status}</Badge>
        </Link>
      ))}
      {bookings.length === 0 && empty && <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{empty}</span>}
    </div>
  );
}
