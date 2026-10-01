"use client";

import { useState } from "react";
import {
  customerFromRequestAction,
  linkBookingCustomerAction,
  linkBookingVehicleAction,
  vehicleFromRequestAction,
} from "@/app/actions/bookings";
import { Button, Icon } from "@/components/ui";
import { vehicleLabel } from "@/lib/fleet";
import type { Booking, BookingRequest, RequestMatches } from "@/types";

type Result = { ok: true } | { ok: false; error: string };

export interface RequestPanelProps {
  booking: Booking & { request: BookingRequest };
  /** Whether CRM is on; without it there is no customer to make. */
  crmEnabled: boolean;
  fleetEnabled: boolean;
  matches: RequestMatches | null;
  pending: boolean;
  /** The drawer's runner: refreshes and toasts on success, toasts the reason on failure. */
  run: (work: () => Promise<void>, options: { done: string }) => void;
}

/**
 * What the customer sent from the booking page, and the steps that turn it
 * into records: a CRM customer from the name and mobile, then a Fleet vehicle
 * from the car details. Where the mobile or plate already match something on
 * file, linking is offered first so the same person is not added twice.
 */
export function RequestPanel({ booking, crmEnabled, fleetEnabled, matches, pending, run }: RequestPanelProps) {
  const { request } = booking;
  const [plate, setPlate] = useState(request.vehicle.plate);

  const check = async (work: Promise<Result>) => {
    const result = await work;
    if (!result.ok) throw new Error(result.error);
  };

  const plateMatch = matches?.vehicle ?? null;
  const plateMatchIsTheirs = plateMatch && (!booking.customerRef || plateMatch.customerRef === booking.customerRef);

  const rows = [
    { icon: "phone", label: "Mobile", value: request.mobile },
    { icon: "megaphone", label: "Heard from", value: request.heardFrom },
    {
      icon: "car",
      label: "Vehicle",
      value: [vehicleLabel(request.vehicle), request.vehicle.plate].filter(Boolean).join(" · ") || "—",
    },
    { icon: "file-text", label: "Code", value: `${request.code.slice(0, 4)}-${request.code.slice(4)}` },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        padding: "13px 14px",
        border: "1px solid var(--blue-200)",
        background: "var(--accent-soft)",
        borderRadius: "14px",
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: "var(--text-overline-size)",
          letterSpacing: ".1em",
          textTransform: "uppercase",
          color: "var(--accent-primary)",
        }}
      >
        <Icon name="inbox" size={13} /> Online request
      </span>

      {rows.map((row) => (
        <div key={row.label} style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
          <span style={{ color: "var(--text-muted)", flex: "0 0 auto", marginTop: 1 }}>
            <Icon name={row.icon} size={14} />
          </span>
          <span style={{ width: 76, flex: "0 0 auto", fontSize: "11.5px", color: "var(--text-muted)" }}>{row.label}</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: "12.5px", fontWeight: 500, overflowWrap: "anywhere" }}>
            {row.value}
          </span>
        </div>
      ))}

      <p style={{ margin: 0, fontSize: "11.5px", lineHeight: "17px", color: "var(--text-secondary)" }}>
        Sent by a customer from the booking page and not yet checked. Set who takes it and its
        value with <strong>Edit details</strong>, then confirm the time with them.
      </p>

      {crmEnabled && !booking.customerRef && (
        <Step title="Customer">
          {(matches?.customers ?? []).map((match) => (
            <Button
              key={match.ref}
              size="sm"
              variant="outline"
              icon="users"
              disabled={pending}
              onClick={() =>
                run(() => check(linkBookingCustomerAction(booking.ref, match.ref)), {
                  done: `${booking.ref} linked to ${match.name}`,
                })
              }
            >
              Link to {match.name} ({match.ref}, {match.reason})
            </Button>
          ))}
          <Button
            size="sm"
            icon="plus"
            disabled={pending}
            onClick={() =>
              run(() => check(customerFromRequestAction(booking.ref)), {
                done: `${booking.customer} added to CRM`,
              })
            }
          >
            Create customer from request
          </Button>
        </Step>
      )}

      {fleetEnabled && !booking.vehicleRef && plateMatch && plateMatchIsTheirs && (
        <Step title="Vehicle">
          <Button
            size="sm"
            variant="outline"
            icon="car"
            disabled={pending}
            onClick={() =>
              run(() => check(linkBookingVehicleAction(booking.ref, plateMatch.ref)), {
                done: `${booking.ref} linked to ${plateMatch.plate}`,
              })
            }
          >
            Link to {plateMatch.plate} · {plateMatch.label}
            {!booking.customerRef && plateMatch.ownerName ? ` (${plateMatch.ownerName})` : ""}
          </Button>
        </Step>
      )}

      {fleetEnabled && !booking.vehicleRef && plateMatch && !plateMatchIsTheirs && (
        <p style={{ margin: 0, fontSize: "11.5px", color: "var(--status-warning)" }}>
          Plate {plateMatch.plate} is already on file under {plateMatch.ownerName || plateMatch.customerRef}, not
          this booking&apos;s customer. Check with the customer before linking.
        </p>
      )}

      {fleetEnabled && !booking.vehicleRef && booking.customerRef && !plateMatch && (
        <Step title="Vehicle">
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={plate}
              onChange={(event) => setPlate(event.target.value.toUpperCase())}
              placeholder="Plate number"
              aria-label="Plate number for the new vehicle"
              style={{
                flex: 1,
                minWidth: 0,
                font: "inherit",
                fontFamily: "var(--font-mono)",
                fontSize: "12.5px",
                background: "var(--surface-card)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-sm)",
                padding: "6px 9px",
                outline: "none",
              }}
            />
            <Button
              size="sm"
              icon="plus"
              disabled={pending || !plate.trim()}
              onClick={() =>
                run(() => check(vehicleFromRequestAction(booking.ref, plate)), {
                  done: `${plate.trim().toUpperCase()} added to Fleet`,
                })
              }
            >
              Add vehicle to Fleet
            </Button>
          </div>
        </Step>
      )}

      {fleetEnabled && !booking.vehicleRef && !booking.customerRef && !plateMatch && crmEnabled && (
        <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
          Link or create the customer first; the car is added under them.
        </span>
      )}
    </div>
  );
}

function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)" }}>{title}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{children}</div>
    </div>
  );
}
