"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { createBookingAction } from "@/app/actions/bookings";
import type { BookingFormState } from "@/app/actions/bookings";
import { Button, Icon, IconButton } from "@/components/ui";
import { phoneKey } from "@/lib/crm";
import { BOOKING_CHANNELS, DEFAULT_STAFF_CHANNEL } from "@/lib/data/bookings";
import { plateKey } from "@/lib/fleet";
import type { Customer, VehicleOption } from "@/types";

const INITIAL: BookingFormState = { error: null };

/** How many CRM matches are offered while a name or number is typed. */
const MAX_MATCHES = 6;

export interface NewBookingModalProps {
  /**
   * Fleet vehicles on file, to recognise a typed plate. Completing a booking
   * with a vehicle adds to its service history.
   */
  vehicles: VehicleOption[];
  /** Whether Fleet is on; without it the form does not ask about the car. */
  fleetEnabled: boolean;
  /**
   * CRM customers, offered as matches while the name is typed. Null without
   * CRM; the booking then keeps only the typed name and number.
   */
  customers: Customer[] | null;
  /** "2026-10-01" to start the form on that day, as from a calendar cell. */
  initialDate?: string | null;
  onClose: () => void;
  /** Fired once the server confirms the write, so the list can refresh. */
  onCreated: (ref: string, note?: string) => void;
}

/** Defaults the date picker to the next whole hour rather than midnight. */
function nextHourLocal() {
  const when = new Date();
  when.setMinutes(0, 0, 0);
  when.setHours(when.getHours() + 1);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(
    when.getDate(),
  )}T${pad(when.getHours())}:${pad(when.getMinutes())}`;
}

/**
 * Mounted only while open, so every opening starts from fresh state — no reset
 * effect, and no stale date left over from the last booking.
 *
 * The form asks for what the public booking page asks for. Every field is
 * controlled, because React resets a form after its action runs and a refused
 * booking would otherwise come back empty.
 */
export function NewBookingModal({
  vehicles,
  fleetEnabled,
  customers,
  initialDate,
  onClose,
  onCreated,
}: NewBookingModalProps) {
  const [state, formAction] = useActionState(createBookingAction, INITIAL);
  const [channel, setChannel] = useState(DEFAULT_STAFF_CHANNEL);
  // From the calendar the day is already chosen; 9am is a starting point the
  // person then adjusts.
  const [startsAt, setStartsAt] = useState(() =>
    initialDate ? `${initialDate}T09:00` : nextHourLocal(),
  );

  const [customer, setCustomer] = useState("");
  const [mobile, setMobile] = useState("");
  const [picked, setPicked] = useState<Customer | null>(null);
  const [matching, setMatching] = useState(false);
  const [active, setActive] = useState(-1);

  const [plate, setPlate] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");

  const [service, setService] = useState("");
  const [staff, setStaff] = useState("");
  const [duration, setDuration] = useState("60");
  const [value, setValue] = useState("0.00");
  const [notes, setNotes] = useState("");

  // Customers on file with the name or the number being typed. Nothing is
  // offered once one is picked, or before there is enough to match on.
  const nameQuery = customer.trim().toLowerCase();
  const numberQuery = phoneKey(mobile);
  const matches =
    picked || !customers
      ? []
      : customers
          .filter(
            (entry) =>
              (nameQuery.length >= 2 && entry.name.toLowerCase().includes(nameQuery)) ||
              (numberQuery.length >= 4 && phoneKey(entry.phone).includes(numberQuery)),
          )
          .slice(0, MAX_MATCHES);
  const offering = matching && matches.length > 0;

  const pick = (entry: Customer) => {
    setPicked(entry);
    setCustomer(entry.name);
    if (entry.phone) setMobile(entry.phone);
    setMatching(false);
    setActive(-1);
  };

  const typeName = (next: string) => {
    setCustomer(next);
    // A changed name is someone else; the link no longer holds.
    if (picked && next !== picked.name) setPicked(null);
    setMatching(true);
    setActive(-1);
  };

  const onMatchKeys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!offering) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % matches.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index <= 0 ? matches.length - 1 : index - 1));
    } else if (event.key === "Enter" && active >= 0) {
      // Enter would otherwise submit the half-filled form.
      event.preventDefault();
      pick(matches[active]);
    } else if (event.key === "Escape") {
      setMatching(false);
    }
  };

  // The car already on file with the typed plate, however it was spelled.
  const typedPlate = plateKey(plate);
  const onFile = typedPlate
    ? (vehicles.find((entry) => plateKey(entry.plate) === typedPlate) ?? null)
    : null;
  const notTheirs = onFile !== null && picked !== null && onFile.customerRef !== picked.ref;
  const theirCars = picked ? vehicles.filter((entry) => entry.customerRef === picked.ref) : [];

  useEffect(() => {
    if (state.createdRef) {
      onCreated(state.createdRef, state.createdNote);
    }
    // `onCreated` is stable enough here; re-running on every render would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.createdRef]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      <div
        onClick={onClose}
        className="absolute inset-0"
        style={{ background: "rgba(23,28,37,.28)" }}
      />
      <form
        action={formAction}
        className="relative flex max-h-full w-full max-w-[640px] flex-col overflow-hidden"
        style={{
          background: "var(--surface-card)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-popover)",
        }}
      >
        <div
          className="flex flex-none items-center gap-3"
          style={{
            padding: "16px 18px",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <span
            style={{
              width: 30,
              height: 30,
              flex: "0 0 auto",
              borderRadius: "var(--radius-sm)",
              background: "var(--accent-soft)",
              color: "var(--accent-primary)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="calendar" size={15} />
          </span>
          <span
            style={{
              flex: 1,
              fontFamily: "var(--font-display)",
              fontSize: "15px",
              fontWeight: 700,
              letterSpacing: "-.01em",
            }}
          >
            New booking
          </span>
          <IconButton icon="x" size={32} label="Close" onClick={onClose} />
        </div>

        <div
          className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto"
          style={{ padding: "18px" }}
        >
          {state.error && (
            <div
              role="alert"
              className="flex items-start gap-2.5"
              style={{
                padding: "11px 13px",
                border: "1px solid #F5C6C1",
                background: "#FEF3F2",
                borderRadius: "var(--radius-md)",
              }}
            >
              <span style={{ color: "#D92D20", flex: "0 0 auto", marginTop: 1 }}>
                <Icon name="circle-alert" size={15} />
              </span>
              <span
                style={{
                  fontSize: "12px",
                  color: "#912018",
                  textWrap: "pretty",
                  overflowWrap: "anywhere",
                }}
              >
                {state.error}
              </span>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <input type="hidden" name="customerRef" value={picked?.ref ?? ""} />
            {/* The matches hang off this row, so they sit under both fields. */}
            <div className="relative">
              <div className="grid grid-cols-1 gap-3.5 wide:grid-cols-2">
                <Field label="Customer" required>
                  <input
                    name="customer"
                    style={INPUT}
                    placeholder="Juan Dela Cruz"
                    autoComplete="off"
                    maxLength={80}
                    role="combobox"
                    aria-expanded={offering}
                    aria-controls="booking-customer-matches"
                    aria-autocomplete="list"
                    value={customer}
                    onChange={(event) => typeName(event.target.value)}
                    onFocus={() => setMatching(true)}
                    onBlur={() => setMatching(false)}
                    onKeyDown={onMatchKeys}
                  />
                </Field>
                <Field label="Mobile number" required>
                  <input
                    name="mobile"
                    type="tel"
                    inputMode="tel"
                    style={INPUT}
                    placeholder="0917 123 4567"
                    autoComplete="off"
                    maxLength={20}
                    value={mobile}
                    onChange={(event) => {
                      setMobile(event.target.value);
                      setMatching(true);
                      setActive(-1);
                    }}
                    onFocus={() => setMatching(true)}
                    onBlur={() => setMatching(false)}
                    onKeyDown={onMatchKeys}
                  />
                </Field>
              </div>

              {offering && (
                <div
                  id="booking-customer-matches"
                  role="listbox"
                  aria-label="Customers on file"
                  style={{
                    position: "absolute",
                    top: "calc(100% + 4px)",
                    left: 0,
                    right: 0,
                    zIndex: 5,
                    padding: "4px",
                    background: "var(--surface-card)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-md)",
                    boxShadow: "var(--shadow-popover)",
                  }}
                >
                  {matches.map((entry, index) => (
                    <div
                      key={entry.ref}
                      role="option"
                      aria-selected={index === active}
                      // Before blur, so the click lands while the list is still open.
                      onMouseDown={(event) => {
                        event.preventDefault();
                        pick(entry);
                      }}
                      onMouseEnter={() => setActive(index)}
                      className="flex items-center gap-2.5"
                      style={{
                        padding: "7px 9px",
                        borderRadius: "var(--radius-sm)",
                        cursor: "pointer",
                        background: index === active ? "var(--surface-hover)" : "transparent",
                      }}
                    >
                      <span style={{ color: "var(--text-muted)", flex: "0 0 auto" }}>
                        <Icon name="users" size={14} />
                      </span>
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: "12.5px",
                          fontWeight: 600,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {entry.name}
                        <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>
                          {entry.phone ? ` · ${entry.phone}` : ""}
                          {entry.company ? ` · ${entry.company}` : ""}
                        </span>
                      </span>
                      <span
                        style={{
                          flex: "0 0 auto",
                          fontFamily: "var(--font-mono)",
                          fontSize: "10.5px",
                          color: "var(--text-muted)",
                        }}
                      >
                        {entry.ref}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {customers !== null && (picked || customer.trim()) && (
              <span
                className="flex items-center gap-1.5"
                style={{ fontSize: "11.5px", color: "var(--text-muted)" }}
              >
                {picked ? (
                  <>
                    <Icon name="check" size={12} />
                    Linked to {picked.name} · {picked.ref} in CRM.
                    <button
                      type="button"
                      onClick={() => setPicked(null)}
                      style={{
                        font: "inherit",
                        color: "var(--accent-primary)",
                        background: "none",
                        border: 0,
                        padding: 0,
                        cursor: "pointer",
                      }}
                    >
                      Not them
                    </button>
                  </>
                ) : matches.length > 0 ? (
                  "On file already? Pick the match to link it. Otherwise this is saved as a new customer."
                ) : (
                  "Not on file yet, so this is saved as a new customer in CRM."
                )}
              </span>
            )}
          </div>

          {/* How the customer reached the shop sits with the customer, rather
              than at the foot of the form. */}
          <Field label="Booked via">
            {/* A native select, sized and styled like the inputs around it, so
                it submits its own value and opens the platform's picker instead
                of a menu the scrolling form could clip. */}
            <select
              name="channel"
              style={SELECT}
              value={channel}
              onChange={(event) => setChannel(event.target.value)}
            >
              {BOOKING_CHANNELS.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </Field>

          {fleetEnabled && (
            <div className="flex flex-col gap-1.5">
              <div className="grid grid-cols-2 gap-3.5 wide:grid-cols-4">
                <Field label="Plate number">
                  <input
                    name="plate"
                    style={{ ...INPUT, fontFamily: "var(--font-mono)" }}
                    placeholder="ABC 1234"
                    autoComplete="off"
                    maxLength={12}
                    value={plate}
                    onChange={(event) => setPlate(event.target.value.toUpperCase())}
                  />
                </Field>
                <Field label="Make">
                  <input
                    name="make"
                    style={onFile ? ON_FILE_INPUT : INPUT}
                    placeholder="Toyota"
                    maxLength={40}
                    disabled={onFile !== null}
                    value={make}
                    onChange={(event) => setMake(event.target.value)}
                  />
                </Field>
                <Field label="Model">
                  <input
                    name="model"
                    style={onFile ? ON_FILE_INPUT : INPUT}
                    placeholder="Vios"
                    maxLength={40}
                    disabled={onFile !== null}
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                  />
                </Field>
                <Field label="Year">
                  <input
                    name="year"
                    inputMode="numeric"
                    style={onFile ? ON_FILE_INPUT : INPUT}
                    placeholder="2019"
                    maxLength={4}
                    disabled={onFile !== null}
                    value={year}
                    onChange={(event) => setYear(event.target.value)}
                  />
                </Field>
              </div>

              {onFile ? (
                <span
                  style={{
                    fontSize: "11.5px",
                    color: notTheirs ? "var(--status-warning)" : "var(--text-muted)",
                  }}
                >
                  {notTheirs
                    ? `${onFile.plate} is on file under ${onFile.ownerName || onFile.customerRef}, not ${picked?.name}. Check the plate or the customer.`
                    : `On file: ${onFile.label}${onFile.ownerName ? ` · ${onFile.ownerName}` : ""}. The booking is linked to this car and its owner.`}
                </span>
              ) : theirCars.length > 0 && !typedPlate ? (
                <span
                  className="flex flex-wrap items-center gap-1.5"
                  style={{ fontSize: "11.5px", color: "var(--text-muted)" }}
                >
                  On file for {picked?.name}:
                  {theirCars.map((entry) => (
                    <button
                      key={entry.ref}
                      type="button"
                      onClick={() => setPlate(entry.plate)}
                      style={{
                        font: "inherit",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        background: "var(--surface-card)",
                        border: "1px solid var(--border-default)",
                        borderRadius: "var(--radius-pill)",
                        padding: "2px 9px",
                        cursor: "pointer",
                      }}
                    >
                      {entry.plate} · {entry.label}
                    </button>
                  ))}
                </span>
              ) : (
                <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                  {typedPlate
                    ? "A new plate is added to Fleet under this customer. Completing the booking writes its service history."
                    : "With a plate, the car is kept in Fleet and completing the booking writes its service history."}
                </span>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3.5 wide:grid-cols-2">
            <Field label="Service" required>
              <input
                name="service"
                style={INPUT}
                placeholder="Full service & MOT"
                maxLength={120}
                value={service}
                onChange={(event) => setService(event.target.value)}
              />
            </Field>
            <Field label="Assigned to" required>
              <input
                name="staff"
                style={INPUT}
                placeholder="Ahmed Ben"
                value={staff}
                onChange={(event) => setStaff(event.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3.5 wide:grid-cols-3">
            <Field label="Date & time" required>
              <input
                name="startsAt"
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                style={INPUT}
              />
            </Field>
            <Field label="Duration (min)" required>
              <input
                name="durationMinutes"
                type="number"
                min={5}
                step={5}
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                style={INPUT}
              />
            </Field>
            <Field label="Value ($)">
              <input
                name="valueCents"
                inputMode="decimal"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                style={INPUT}
              />
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              name="notes"
              rows={3}
              style={{ ...INPUT, resize: "vertical", padding: "10px 13px" }}
              placeholder="Anything the technician should know before the vehicle arrives."
              maxLength={1000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
        </div>

        <div
          className="flex flex-none items-center justify-between gap-3"
          style={{
            padding: "13px 18px",
            borderTop: "1px solid var(--border-subtle)",
            background: "var(--gray-25)",
          }}
        >
          <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
            Saved as <strong>Pending</strong> — confirm it from the booking.
          </span>
          <span className="flex items-center gap-2.5">
            <Button variant="ghost" onClick={onClose} type="button">
              Cancel
            </Button>
            <SubmitButton />
          </span>
        </div>
      </form>
    </div>
  );
}

const INPUT: CSSProperties = {
  width: "100%",
  minWidth: 0,
  font: "inherit",
  fontSize: "13.5px",
  color: "var(--text-primary)",
  background: "var(--surface-card)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-md)",
  padding: "10px 13px",
  outline: "none",
};

/** The same box as an input, with the chevron a dropdown needs. */
const SELECT: CSSProperties = {
  ...INPUT,
  background: undefined,
  backgroundColor: "var(--surface-card)",
  appearance: "none",
  paddingRight: "36px",
  cursor: "pointer",
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2378839A' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 13px center",
};

/** Make, model and year once the plate is a car on file: its record decides them. */
const ON_FILE_INPUT: CSSProperties = { ...INPUT, opacity: 0.55 };

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span
        style={{
          fontSize: "12px",
          fontWeight: 600,
          color: "var(--text-primary)",
        }}
      >
        {label}
        {required && (
          <span style={{ color: "var(--status-negative)" }}> *</span>
        )}
      </span>
      {children}
    </label>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button icon="check" type="submit" disabled={pending}>
      {pending ? "Saving…" : "Create booking"}
    </Button>
  );
}
