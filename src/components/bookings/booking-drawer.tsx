"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  rescheduleBookingAction,
  setBookingStatusAction,
} from "@/app/actions/bookings";
import { Badge, Avatar, Button, Icon, IconButton } from "@/components/ui";
import { bookingTimeline, formatMoney, getStatusStyle } from "@/lib/bookings";
import type { Booking, BookingStatus } from "@/types";

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
  onClose: () => void;
}

/** The right-hand detail panel for one booking. */
export function BookingDrawer({ booking, onClose }: BookingDrawerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rescheduling, setRescheduling] = useState(false);
  const [startsAt, setStartsAt] = useState(() => toLocalInput(booking.startsAt));
  const [minutes, setMinutes] = useState(booking.durationMinutes);
  const [error, setError] = useState<string | null>(null);

  const status = getStatusStyle(booking.status);

  const run = (work: () => Promise<void>) => {
    setError(null);
    startTransition(async () => {
      try {
        await work();
        router.refresh();
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "That change did not save.",
        );
      }
    });
  };

  const move = (next: BookingStatus) =>
    run(() => setBookingStatusAction(booking.ref, next));

  const saveReschedule = () =>
    run(async () => {
      await rescheduleBookingAction(
        booking.ref,
        new Date(startsAt).toISOString(),
        Number(minutes),
      );
      setRescheduling(false);
    });

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
    { icon: "user", label: "Assigned to", value: booking.staff },
    { icon: "mail", label: "Contact", value: booking.email },
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

        {(error || rescheduling) && (
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
            onClick={() => setRescheduling((open) => !open)}
          >
            Reschedule
          </Button>
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
