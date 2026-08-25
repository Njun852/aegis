"use client";

import { Badge, Avatar, Button, Icon, IconButton } from "@/components/ui";
import { bookingTimeline, formatMoney, getStatusStyle } from "@/lib/bookings";
import type { Booking } from "@/types";

export interface BookingDrawerProps {
  booking: Booking;
  onClose: () => void;
}

/** The right-hand detail panel for one booking. */
export function BookingDrawer({ booking, onClose }: BookingDrawerProps) {
  const status = getStatusStyle(booking.status);

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
      value: `${booking.day}, 2026 · ${booking.time}`,
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
          <Button icon="check">Confirm</Button>
          <Button variant="outline" icon="clock">
            Reschedule
          </Button>
          <IconButton icon="trash-2" size={36} label="Cancel booking" />
        </div>
      </aside>
    </>
  );
}

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
