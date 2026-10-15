"use client";

import Link from "next/link";
import { useState } from "react";
import { Modal } from "@/components/forms/form-kit";
import { Badge, Icon } from "@/components/ui";
import { formatMoneyIn } from "@/lib/format";
import { activateOnKey } from "@/lib/interaction";
import type { CampaignFunnel, CampaignFunnelRow } from "@/types";

const GRID =
  "grid gap-3 items-center grid-cols-[minmax(150px,1.5fr)_96px_96px_96px_20px] wide:grid-cols-[minmax(190px,1.6fr)_104px_104px_104px_104px_110px_96px_22px]";

/**
 * The owner's view of each campaign: what it cost, how many chats Meta says it
 * started, how many of those became bookings staff confirmed, and what one
 * booking cost. All over the same days, which are printed. Clicking a
 * campaign lists the bookings behind its number.
 */
export function CampaignFunnelPanel({ funnel, currency }: { funnel: CampaignFunnel; currency: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const money = (cents: number | null) => (cents === null ? "—" : formatMoneyIn(cents, currency, false));
  const open = funnel.rows.find((row) => row.campaignId === openId) ?? null;
  const flagged = funnel.rows.filter((row) => row.flag);
  const ordered = [...funnel.rows].sort((a, b) => b.spendCents - a.spendCents);

  return (
    <>
      <section
        style={{
          background: "var(--surface-card)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-card)",
          padding: "14px 12px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          minWidth: 0,
        }}
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1" style={{ padding: "0 4px" }}>
          <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "15px", fontWeight: 700 }}>
            Ads to bookings
          </h3>
          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>{funnel.periodLabel}</span>
          <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
            Spend, conversations and bookings all over these days. Bookings count once staff confirm them; cancelled
            ones drop out.
          </span>
        </div>

        {flagged.length > 0 && (
          <div className="flex flex-col gap-1.5" style={{ padding: "0 4px" }}>
            {flagged.map((row) => (
              <button
                key={row.campaignId}
                type="button"
                onClick={() => setOpenId(row.campaignId)}
                className="flex items-center gap-2"
                style={{
                  border: "none",
                  textAlign: "left",
                  cursor: "pointer",
                  padding: "7px 10px",
                  borderRadius: "var(--radius-md)",
                  fontFamily: "var(--font-body)",
                  fontSize: "12px",
                  color: "var(--text-primary)",
                  background: row.flag!.tone === "warning" ? "var(--status-warning-soft)" : "var(--status-positive-soft)",
                }}
              >
                <Icon
                  name={row.flag!.tone === "warning" ? "alert-triangle" : "trending-up"}
                  size={13}
                  color={row.flag!.tone === "warning" ? "var(--status-warning)" : "var(--status-positive)"}
                />
                <strong>{row.name}</strong>
                <span>{row.flag!.text}</span>
              </button>
            ))}
          </div>
        )}

        <div className={GRID} style={{ padding: "0 10px 8px", borderBottom: "1px solid var(--border-subtle)" }}>
          <Label>Campaign</Label>
          <Label right>Spend</Label>
          <Label right className="hidden wide:block">
            Conversations
          </Label>
          <Label right className="hidden wide:block">
            Cost / conv.
          </Label>
          <Label right>Confirmed bookings</Label>
          <Label right>Cost / booking</Label>
          <Label right className="hidden wide:block">
            Conv. → booking
          </Label>
          <span />
        </div>

        {ordered.map((row) => (
          <FunnelRow key={row.campaignId} row={row} money={money} onOpen={() => setOpenId(row.campaignId)} />
        ))}
        {ordered.length === 0 && (
          <div style={{ padding: "20px 10px", textAlign: "center", fontSize: "12.5px", color: "var(--text-muted)" }}>
            No campaigns in this period.
          </div>
        )}

        {ordered.length > 0 && (
          <div className={GRID} style={{ padding: "10px", borderTop: "1px solid var(--border-subtle)", fontWeight: 700 }}>
            <span style={{ fontSize: "12.5px" }}>All campaigns</span>
            <Num>{money(funnel.totals.spendCents)}</Num>
            <Num className="hidden wide:block">{funnel.totals.conversations ?? "—"}</Num>
            <Num className="hidden wide:block">{money(funnel.totals.conversations ? Math.round(funnel.totals.spendCents / funnel.totals.conversations) : null)}</Num>
            <Num>{funnel.totals.confirmedBookings}</Num>
            <Num>{money(funnel.totals.costPerBookingCents)}</Num>
            <Num className="hidden wide:block">{funnel.totals.conversionPercent === null ? "—" : `${funnel.totals.conversionPercent}%`}</Num>
            <span />
          </div>
        )}

        <span style={{ fontSize: "11px", color: "var(--text-muted)", padding: "0 4px", textWrap: "pretty" }}>
          Conversations are Meta&apos;s count of Messenger conversations started, shown only for campaigns optimised for
          them. Confirmed bookings are AEGIS&apos;s own records, counted on the day each was made.
          {funnel.uncreditedConfirmed > 0 &&
            ` ${funnel.uncreditedConfirmed} confirmed ${funnel.uncreditedConfirmed === 1 ? "booking" : "bookings"} in this period came from no ad (walk-ins, calls, organic chats) and ${funnel.uncreditedConfirmed === 1 ? "is" : "are"} not counted against any campaign.`}
        </span>
      </section>

      {open && (
        <Drilldown
          row={open}
          funnel={funnel}
          money={money}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}

function FunnelRow({
  row,
  money,
  onOpen,
}: {
  row: CampaignFunnelRow;
  money: (cents: number | null) => string;
  onOpen: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${row.name}: ${row.confirmedBookings} confirmed bookings`}
      onClick={onOpen}
      onKeyDown={activateOnKey(onOpen)}
      className={GRID}
      style={{ padding: "10px", borderRadius: 10, cursor: "pointer", borderBottom: "1px solid var(--gray-50)" }}
    >
      <span className="flex min-w-0 flex-col leading-tight">
        <span style={{ fontSize: "12.5px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.name}
        </span>
        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{row.enabled ? "On" : "Off"}</span>
      </span>
      <Num>{money(row.spendCents)}</Num>
      <Num className="hidden wide:block">{row.conversations ?? "—"}</Num>
      <Num className="hidden wide:block">{money(row.costPerConversationCents)}</Num>
      <Num strong>{row.confirmedBookings}</Num>
      <Num strong>{money(row.costPerBookingCents)}</Num>
      <Num className="hidden wide:block">{row.conversionPercent === null ? "—" : `${row.conversionPercent}%`}</Num>
      <span style={{ color: "var(--text-muted)", display: "inline-flex", justifyContent: "flex-end" }}>
        <Icon name="chevron-right" size={15} />
      </span>
    </div>
  );
}

function Drilldown({
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
          { label: "Spend", value: money(row.spendCents) },
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
        {money(row.spendCents)} ÷ {row.confirmedBookings} confirmed {row.confirmedBookings === 1 ? "booking" : "bookings"} ={" "}
        {money(row.costPerBookingCents)}.{" "}
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

function Label({ children, right, className }: { children: React.ReactNode; right?: boolean; className?: string }) {
  return (
    <span
      className={className}
      style={{
        fontSize: "var(--text-overline-size)",
        letterSpacing: ".08em",
        textTransform: "uppercase",
        color: "var(--text-muted)",
        textAlign: right ? "right" : undefined,
      }}
    >
      {children}
    </span>
  );
}

function Num({ children, strong, className }: { children: React.ReactNode; strong?: boolean; className?: string }) {
  return (
    <span
      className={className}
      style={{ fontSize: "12.5px", fontWeight: strong ? 700 : 500, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
    >
      {children}
    </span>
  );
}
