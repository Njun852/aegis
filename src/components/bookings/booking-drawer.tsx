"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  linkBookingCustomerAction,
  rescheduleBookingAction,
  setBookingStatusAction,
  updateBookingDetailsAction,
} from "@/app/actions/bookings";
import { Badge, Avatar, Button, Icon, IconButton, Select } from "@/components/ui";
import { useToast } from "@/components/layout/toast-provider";
import { bookingTimeline, formatMoney, getStatusStyle } from "@/lib/bookings";
import type { Booking, BookingStatus, Customer, RequestMatches, VehicleOption } from "@/types";
import { RequestPanel } from "./request-panel";

const NOT_LINKED = "Not linked";

/** `<input type="datetime-local">` wants local wall-clock, not an ISO Z time. */
function toLocalInput(iso: string) {
  const when = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(
    when.getDate(),
  )}T${pad(when.getHours())}:${pad(when.getMinutes())}`;
}

export interface BookingDrawerProps {
  booking: Booking;
  /** The linked Fleet vehicle, when the booking has one and Fleet is on. */
  vehicle: VehicleOption | null;
  /** CRM customers. Null without CRM, which hides the customer row and link. */
  customers: Customer[] | null;
  fleetEnabled: boolean;
  /** For an online request still being linked: what its mobile and plate match. */
  matches: RequestMatches | null;
  onClose: () => void;
}

/** The right-hand detail panel for one booking. */
export function BookingDrawer({
  booking,
  vehicle,
  customers,
  fleetEnabled,
  matches,
  onClose,
}: BookingDrawerProps) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [rescheduling, setRescheduling] = useState(false);
  const [startsAt, setStartsAt] = useState(() => toLocalInput(booking.startsAt));
  const [minutes, setMinutes] = useState(booking.durationMinutes);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [staff, setStaff] = useState(booking.staff === "Unassigned" ? "" : booking.staff);
  const [value, setValue] = useState((booking.valueCents / 100).toFixed(2));
  const [duration, setDuration] = useState(booking.durationMinutes);

  const linked = customers?.find((entry) => entry.ref === booking.customerRef) ?? null;
  const customerLabels = new Map<string, string>();
  for (const entry of customers ?? []) {
    let label = entry.phone ? `${entry.name} · ${entry.phone}` : entry.name;
    if (customerLabels.has(label)) label = `${label} (${entry.ref})`;
    customerLabels.set(label, entry.ref);
  }
  const linkedLabel =
    [...customerLabels.entries()].find(([, ref]) => ref === booking.customerRef)?.[0] ?? NOT_LINKED;
  const [linkChoice, setLinkChoice] = useState(linkedLabel);

  const status = getStatusStyle(booking.status);

  /**
   * `inline` keeps the message beside the reschedule fields it belongs to;
   * everything else reports through a toast, because the drawer may well be
   * closed by the time the write lands.
   */
  const run = (
    work: () => Promise<void>,
    { done, inline = false }: { done: string; inline?: boolean },
  ) => {
    setError(null);
    startTransition(async () => {
      try {
        await work();
        router.refresh();
        toast({ tone: "success", title: done, key: `booking-${booking.ref}` });
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : "That change did not save.";
        if (inline) setError(message);
        else
          toast({
            tone: "error",
            title: `${booking.ref} did not update`,
            description: message,
            key: `booking-${booking.ref}`,
          });
      }
    });
  };

  const move = (next: BookingStatus) =>
    run(() => setBookingStatusAction(booking.ref, next), {
      done:
        next === "Cancelled"
          ? `${booking.ref} cancelled`
          : `${booking.ref} moved to ${next}`,
    });

  const saveLink = () => {
    const customerRef = customerLabels.get(linkChoice) ?? null;
    run(
      async () => {
        const result = await linkBookingCustomerAction(booking.ref, customerRef);
        if (!result.ok) throw new Error(result.error);
      },
      {
        done: customerRef
          ? `${booking.ref} linked to ${linkChoice.split(" · ")[0]}`
          : `${booking.ref} unlinked from its customer`,
      },
    );
  };

  const saveDetails = () =>
    run(
      async () => {
        const result = await updateBookingDetailsAction(booking.ref, {
          staff,
          value,
          durationMinutes: Number(duration),
        });
        if (!result.ok) throw new Error(result.error);
        setEditing(false);
      },
      { done: `${booking.ref} details saved`, inline: true },
    );

  const saveReschedule = () =>
    run(
      async () => {
        await rescheduleBookingAction(
          booking.ref,
          new Date(startsAt).toISOString(),
          Number(minutes),
        );
        setRescheduling(false);
      },
      { done: `${booking.ref} rescheduled`, inline: true },
    );

  // A cancelled or completed booking is done; only reopening makes sense.
  const closed =
    booking.status === "Cancelled" || booking.status === "Completed";

  /**
   * One primary button that walks the booking through its lifecycle, rather
   * than five competing buttons in a 398px drawer.
   */
  const advance: { label: string; icon: string; next: BookingStatus } = {
    Pending: { label: "Confirm", icon: "check", next: "Confirmed" as const },
    Confirmed: { label: "Start", icon: "arrow-right", next: "In progress" as const },
    "In progress": {
      label: "Complete",
      icon: "check-circle-2",
      next: "Completed" as const,
    },
    Completed: { label: "Reopen", icon: "refresh-cw", next: "Pending" as const },
    Cancelled: { label: "Reopen", icon: "refresh-cw", next: "Pending" as const },
  }[booking.status];

  const fields = [
    { icon: "briefcase", label: "Company", value: booking.company },
    {
      icon: "sparkles",
      label: "Service",
      value: `${booking.service} · ${booking.duration}`,
    },
    {
      icon: "calendar",
      label: "When",
      value: `${booking.day}, ${new Date(booking.startsAt).getFullYear()} · ${booking.time}`,
    },
    ...(linked
      ? [
          {
            icon: "users",
            label: "Customer",
            value: (
              <Link
                href={`/crm?customer=${encodeURIComponent(linked.ref)}`}
                style={{ color: "var(--accent-primary)", textDecoration: "none" }}
              >
                {linked.name} · {linked.ref}
              </Link>
            ) as React.ReactNode,
          },
        ]
      : []),
    ...(vehicle
      ? [{ icon: "car", label: "Vehicle", value: `${vehicle.plate} · ${vehicle.label}` }]
      : []),
    { icon: "user", label: "Assigned to", value: booking.staff },
    { icon: "mail", label: "Contact", value: booking.email || booking.request?.mobile || "—" },
    {
      icon: "wallet",
      label: "Value",
      value: `${formatMoney(booking.valueCents)} · booked via ${booking.channel}`,
    },
  ];

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 70,
          background: "rgba(23,28,37,.18)",
        }}
      />
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 398,
          maxWidth: "92vw",
          zIndex: 71,
          background: "var(--surface-card)",
          borderLeft: "1px solid var(--border-default)",
          boxShadow: "var(--shadow-popover)",
          display: "flex",
          flexDirection: "column",
          fontFamily: "var(--font-body)",
          color: "var(--text-primary)",
        }}
      >
        <div
          style={{
            flex: "0 0 auto",
            display: "flex",
            alignItems: "flex-start",
            gap: "12px",
            padding: "16px 16px 14px",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <Avatar name={booking.customer} size={38} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "16px",
                fontWeight: 700,
                letterSpacing: "-.015em",
                overflowWrap: "anywhere",
              }}
            >
              {booking.customer}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginTop: "3px",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10.5px",
                  color: "var(--text-muted)",
                }}
              >
                {booking.ref}
              </span>
              <Badge tone={status.tone}>{booking.status}</Badge>
            </div>
          </div>
          <IconButton icon="x" size={32} label="Close" onClick={onClose} />
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
          }}
        >
          {booking.request && (
            <RequestPanel
              booking={{ ...booking, request: booking.request }}
              crmEnabled={customers !== null}
              fleetEnabled={fleetEnabled}
              matches={matches}
              pending={pending}
              run={run}
            />
          )}

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              padding: "13px 14px",
              border: "1px solid var(--border-default)",
              borderRadius: "14px",
            }}
          >
            {fields.map((field) => (
              <div
                key={field.label}
                style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}
              >
                <span
                  style={{
                    color: "var(--text-muted)",
                    flex: "0 0 auto",
                    marginTop: 1,
                  }}
                >
                  <Icon name={field.icon} size={14} />
                </span>
                <span
                  style={{
                    width: 86,
                    flex: "0 0 auto",
                    fontSize: "11.5px",
                    color: "var(--text-muted)",
                  }}
                >
                  {field.label}
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: "12.5px",
                    fontWeight: 500,
                    textWrap: "pretty",
                    overflowWrap: "anywhere",
                  }}
                >
                  {field.value}
                </span>
              </div>
            ))}
          </div>

          {customers !== null && !booking.vehicleRef && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <SectionLabel>Customer record</SectionLabel>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Select
                  size="sm"
                  leadingIcon="users"
                  options={[NOT_LINKED, ...customerLabels.keys()]}
                  value={linkChoice}
                  onChange={setLinkChoice}
                  style={{ flex: 1, minWidth: 0 }}
                />
                <Button
                  size="sm"
                  icon="check"
                  onClick={saveLink}
                  disabled={pending || linkChoice === linkedLabel}
                >
                  {linked && linkChoice === NOT_LINKED ? "Unlink" : "Link"}
                </Button>
              </div>
              {customers.length === 0 && (
                <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                  No customers yet. Add them in CRM first.
                </span>
              )}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <SectionLabel>Notes</SectionLabel>
            <p
              style={{
                margin: 0,
                fontSize: "12.5px",
                lineHeight: "19px",
                color: "var(--text-secondary)",
                textWrap: "pretty",
                overflowWrap: "anywhere",
              }}
            >
              {booking.notes}
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <SectionLabel>Activity</SectionLabel>
            {bookingTimeline(booking).map((entry) => (
              <div
                key={entry.label}
                style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "var(--radius-pill)",
                    background: entry.dot,
                    marginTop: 5,
                    flex: "0 0 auto",
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    lineHeight: 1.3,
                  }}
                >
                  <span style={{ fontSize: "12px", fontWeight: 600 }}>
                    {entry.label}
                  </span>
                  <span
                    style={{ fontSize: "11px", color: "var(--text-muted)" }}
                  >
                    {entry.meta}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {(error || rescheduling || editing) && (
          <div
            style={{
              flex: "0 0 auto",
              padding: "12px 16px",
              borderTop: "1px solid var(--border-subtle)",
              background: "var(--gray-25)",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            {error && (
              <div
                role="alert"
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "8px",
                  fontSize: "12px",
                  color: "var(--status-negative)",
                  textWrap: "pretty",
                  overflowWrap: "anywhere",
                }}
              >
                <Icon name="circle-alert" size={14} />
                {error}
              </div>
            )}

            {editing && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <SectionLabel>Edit details</SectionLabel>
                <input
                  value={staff}
                  onChange={(event) => setStaff(event.target.value)}
                  placeholder="Assigned to"
                  aria-label="Assigned to"
                  style={EDITOR_INPUT}
                />
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    inputMode="decimal"
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    aria-label="Value"
                    placeholder="Value"
                    style={EDITOR_INPUT}
                  />
                  <input
                    type="number"
                    min={5}
                    step={5}
                    value={duration}
                    onChange={(event) => setDuration(Number(event.target.value))}
                    aria-label="Duration in minutes"
                    style={{ ...EDITOR_INPUT, width: 84, flex: "0 0 auto" }}
                  />
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <Button size="sm" icon="check" onClick={saveDetails} disabled={pending}>
                    {pending ? "Saving…" : "Save details"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {rescheduling && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <SectionLabel>Move this booking</SectionLabel>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input
                    type="datetime-local"
                    value={startsAt}
                    onChange={(event) => setStartsAt(event.target.value)}
                    aria-label="New date and time"
                    style={EDITOR_INPUT}
                  />
                  <input
                    type="number"
                    min={5}
                    step={5}
                    value={minutes}
                    onChange={(event) => setMinutes(Number(event.target.value))}
                    aria-label="Duration in minutes"
                    style={{ ...EDITOR_INPUT, width: 84, flex: "0 0 auto" }}
                  />
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <Button
                    size="sm"
                    icon="check"
                    onClick={saveReschedule}
                    disabled={pending}
                  >
                    {pending ? "Saving…" : "Save new time"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setRescheduling(false)}
                    disabled={pending}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <div
          style={{
            flex: "0 0 auto",
            display: "flex",
            alignItems: "center",
            gap: "9px",
            padding: "13px 16px",
            borderTop: "1px solid var(--border-subtle)",
            background: "var(--gray-25)",
          }}
        >
          <Button
            icon={advance.icon}
            onClick={() => move(advance.next)}
            disabled={pending}
          >
            {advance.label}
          </Button>
          <Button
            variant="outline"
            icon="clock"
            disabled={pending || closed}
            onClick={() => {
              setEditing(false);
              setRescheduling((open) => !open);
            }}
          >
            Reschedule
          </Button>
          <IconButton
            icon="pen-line"
            size={36}
            label="Edit details"
            disabled={pending}
            onClick={() => {
              setRescheduling(false);
              setEditing((open) => !open);
            }}
          />
          <IconButton
            icon="trash-2"
            size={36}
            label="Cancel booking"
            disabled={pending || booking.status === "Cancelled"}
            onClick={() => move("Cancelled")}
          />
        </div>
      </aside>
    </>
  );
}

const EDITOR_INPUT: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  font: "inherit",
  fontSize: "12.5px",
  color: "var(--text-primary)",
  background: "var(--surface-card)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-sm)",
  padding: "7px 10px",
  outline: "none",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: "var(--text-overline-size)",
        letterSpacing: ".1em",
        textTransform: "uppercase",
        color: "var(--text-muted)",
      }}
    >
      {children}
    </span>
  );
}
