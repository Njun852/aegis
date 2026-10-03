"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CSSProperties, ReactNode } from "react";
import { setCustomerSmsOptOutAction, updateCustomerAction } from "@/app/actions/crm";
import { Avatar, Badge, Button, Icon, IconButton, Switch } from "@/components/ui";
import { useToast } from "@/components/layout/toast-provider";
import { formatMoney, getStatusStyle } from "@/lib/bookings";
import { SERVICE_DUE_STYLES, vehicleLabel } from "@/lib/fleet";
import type { CustomerInput, CustomerProfile, MonthValue } from "@/types";

export interface CustomerDrawerProps {
  profile: CustomerProfile;
  fleetEnabled: boolean;
  /** Whether the business has Text Blast, which is what the Text reminders switch governs. */
  smsEnabled: boolean;
  onClose: () => void;
}

/** The right-hand profile for one customer: contact, cars, bookings, value, mail. */
export function CustomerDrawer({ profile, fleetEnabled, smsEnabled, onClose }: CustomerDrawerProps) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { customer, bookings, vehicles, emails, months } = profile;
  const [draft, setDraft] = useState<CustomerInput>(() => ({
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    company: customer.company,
    notes: customer.notes,
  }));

  const save = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateCustomerAction(customer.ref, draft);
        if (!result.ok) {
          setError(result.error);
          toast({
            tone: "error",
            title: `${customer.name} did not update`,
            description: result.error,
            key: `customer-${customer.ref}`,
          });
          return;
        }
        setEditing(false);
        router.refresh();
        toast({ tone: "success", title: `${draft.name} saved`, key: `customer-${customer.ref}` });
      } catch {
        toast({
          tone: "error",
          title: `${customer.name} did not update`,
          description: "The change did not save. Please try again.",
          key: `customer-${customer.ref}`,
        });
      }
    });
  };

  const setReminders = (on: boolean) => {
    const optOut = !on;
    startTransition(async () => {
      try {
        const result = await setCustomerSmsOptOutAction(customer.ref, optOut);
        if (!result.ok) {
          toast({ tone: "error", title: `${customer.name} did not update`, description: result.error, key: `customer-sms-${customer.ref}` });
          return;
        }
        router.refresh();
        toast({
          tone: "success",
          title: on ? `Reminders on for ${customer.name}` : `Reminders off for ${customer.name}`,
          key: `customer-sms-${customer.ref}`,
        });
      } catch {
        toast({ tone: "error", title: `${customer.name} did not update`, description: "The change did not save. Please try again.", key: `customer-sms-${customer.ref}` });
      }
    });
  };

  const fields = [
    { icon: "phone", label: "Phone", value: customer.phone || "—" },
    { icon: "mail", label: "Email", value: customer.email || "—" },
    { icon: "briefcase", label: "Company", value: customer.company || "—" },
  ];

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(23,28,37,.18)" }}
      />
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 440,
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
          <Avatar name={customer.name} size={38} />
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
              {customer.name}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "10.5px", color: "var(--text-muted)", marginTop: 3 }}>
              {customer.ref}
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
            gap: "16px",
          }}
        >
          <Box>
            {fields.map((field) => (
              <div key={field.label} style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                <span style={{ color: "var(--text-muted)", flex: "0 0 auto", marginTop: 1 }}>
                  <Icon name={field.icon} size={14} />
                </span>
                <span style={{ width: 70, flex: "0 0 auto", fontSize: "11.5px", color: "var(--text-muted)" }}>
                  {field.label}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: "12.5px", fontWeight: 500, overflowWrap: "anywhere" }}>
                  {field.value}
                </span>
              </div>
            ))}
            {smsEnabled && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ color: "var(--text-muted)", flex: "0 0 auto" }}>
                  <Icon name="send" size={14} />
                </span>
                <span style={{ width: 70, flex: "0 0 auto", fontSize: "11.5px", color: "var(--text-muted)" }}>
                  Reminders
                </span>
                <Switch
                  checked={!customer.smsOptOut}
                  disabled={pending}
                  label={`Text reminders for ${customer.name}`}
                  onChange={setReminders}
                />
                <span style={{ flex: 1, minWidth: 0, fontSize: "12.5px", fontWeight: 500 }}>
                  {customer.smsOptOut ? "Off. Not texted; the customer opted out" : "On. Texted when a car is due"}
                </span>
              </div>
            )}
            {customer.notes && (
              <p style={{ margin: "4px 0 0", fontSize: "12px", lineHeight: "18px", color: "var(--text-secondary)", overflowWrap: "anywhere" }}>
                {customer.notes}
              </p>
            )}
          </Box>

          <Section title="Booked value · last 12 months">
            <MonthlyBars months={months} />
          </Section>

          {fleetEnabled && (
            <Section title={`Vehicles · ${vehicles.length}`}>
              {vehicles.length === 0 && <Empty>No cars on file. Add one in Fleet.</Empty>}
              {vehicles.map((vehicle) => (
                <Link
                  key={vehicle.ref}
                  href="/fleet"
                  style={{ ...ROW, textDecoration: "none", color: "inherit" }}
                >
                  <Icon name="car" size={14} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 700 }}>{vehicle.plate}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: "12px", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {vehicleLabel(vehicle)}
                  </span>
                  <Badge tone={SERVICE_DUE_STYLES[vehicle.due.status].tone}>{vehicle.due.status}</Badge>
                </Link>
              ))}
            </Section>
          )}

          <Section title={`Bookings · ${bookings.length}`}>
            {bookings.length === 0 && (
              <Empty>No bookings linked yet. Link one from its booking, or pick this customer on a new booking.</Empty>
            )}
            {bookings.map((booking) => (
              <div key={booking.ref} style={ROW}>
                <span style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, lineHeight: 1.3 }}>
                  <span style={{ fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {booking.service}
                  </span>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                    {booking.ref} · {booking.day}, {new Date(booking.startsAt).getFullYear()}
                  </span>
                </span>
                <span style={{ fontSize: "12px", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  {formatMoney(booking.valueCents)}
                </span>
                <Badge tone={getStatusStyle(booking.status).tone}>{booking.status}</Badge>
              </div>
            ))}
          </Section>

          <Section title="Recent emails from this address">
            {!customer.email && <Empty>No email address on file.</Empty>}
            {customer.email && emails.length === 0 && (
              <Empty>Nothing in the synced inbox from {customer.email}.</Empty>
            )}
            {emails.map((email) => (
              <Link key={email.id} href="/mail" style={{ ...ROW, textDecoration: "none", color: "inherit" }}>
                <Icon name="mail" size={14} />
                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
                  <span style={{ fontSize: "12px", fontWeight: email.unread ? 700 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {email.subject}
                  </span>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{email.date}</span>
                </span>
              </Link>
            ))}
          </Section>
        </div>

        {(editing || error) && (
          <div
            style={{
              flex: "0 0 auto",
              padding: "12px 16px",
              borderTop: "1px solid var(--border-subtle)",
              background: "var(--gray-25)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              maxHeight: "55vh",
              overflowY: "auto",
            }}
          >
            {error && (
              <div role="alert" style={{ display: "flex", gap: "8px", fontSize: "12px", color: "var(--status-negative)", overflowWrap: "anywhere" }}>
                <Icon name="circle-alert" size={14} />
                {error}
              </div>
            )}
            {editing && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  {(
                    [
                      ["name", "Name"],
                      ["phone", "Phone"],
                      ["email", "Email"],
                      ["company", "Company"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 }}>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{label}</span>
                      <input
                        value={draft[key]}
                        onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
                        style={INPUT}
                      />
                    </label>
                  ))}
                </div>
                <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Notes</span>
                  <textarea
                    rows={2}
                    value={draft.notes}
                    onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                    style={{ ...INPUT, resize: "vertical" }}
                  />
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <Button size="sm" icon="check" onClick={save} disabled={pending}>
                    {pending ? "Saving…" : "Save customer"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
                    Cancel
                  </Button>
                </div>
              </>
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
            variant="outline"
            icon="pen-line"
            disabled={pending}
            onClick={() => {
              setError(null);
              setEditing((open) => !open);
            }}
          >
            Edit details
          </Button>
        </div>
      </aside>
    </>
  );
}

/**
 * Twelve thin bars, one per month, scaled to this customer's own busiest
 * month. The readout above names the hovered month's value in text, so the
 * figure never depends on judging a bar's height; with nothing hovered it
 * gives the twelve-month total.
 */
function MonthlyBars({ months }: { months: MonthValue[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(...months.map((month) => month.valueCents), 0);
  const total = months.reduce((sum, month) => sum + month.valueCents, 0);
  const focus = hovered === null ? null : months[hovered];

  if (max === 0) {
    return <Empty>Nothing booked in the last 12 months.</Empty>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "8px", fontVariantNumeric: "tabular-nums" }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: "18px", fontWeight: 700, letterSpacing: "-.02em" }}>
          {formatMoney(focus ? focus.valueCents : total)}
        </span>
        <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
          {focus ? `booked in ${focus.label} ${focus.key.slice(0, 4)}` : "booked over 12 months, cancellations left out"}
        </span>
      </div>
      <div
        role="img"
        aria-label={`Booked value by month: ${months.map((month) => `${month.label} ${formatMoney(month.valueCents, false)}`).join(", ")}`}
        style={{ display: "flex", alignItems: "stretch", height: 72, gap: 2 }}
        onMouseLeave={() => setHovered(null)}
      >
        {months.map((month, index) => (
          <div
            key={month.key}
            onMouseEnter={() => setHovered(index)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
              cursor: "default",
              borderRadius: 4,
              background: hovered === index ? "var(--surface-inset)" : "transparent",
            }}
          >
            <div
              style={{
                height: month.valueCents === 0 ? 0 : `${Math.max(4, (month.valueCents / max) * 100)}%`,
                margin: "0 3px",
                borderRadius: "4px 4px 0 0",
                background: "var(--accent-primary)",
                opacity: hovered === null || hovered === index ? 1 : 0.45,
                transition: "opacity var(--dur-fast) var(--ease-standard)",
              }}
            />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 2, borderTop: "1px solid var(--border-subtle)", paddingTop: 4 }}>
        {months.map((month, index) => (
          <span
            key={month.key}
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: "9.5px",
              color: hovered === index ? "var(--text-primary)" : "var(--text-muted)",
            }}
          >
            {month.label.slice(0, 1)}
          </span>
        ))}
      </div>
    </div>
  );
}

const ROW: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "9px 11px",
  border: "1px solid var(--border-subtle)",
  borderRadius: "10px",
  color: "var(--text-secondary)",
};

const INPUT: CSSProperties = {
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

function Box({ children }: { children: ReactNode }) {
  return (
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
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <span
        style={{
          fontSize: "var(--text-overline-size)",
          letterSpacing: ".1em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
        }}
      >
        {title}
      </span>
      {children}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <span style={{ fontSize: "12px", color: "var(--text-muted)", textWrap: "pretty" }}>{children}</span>;
}
