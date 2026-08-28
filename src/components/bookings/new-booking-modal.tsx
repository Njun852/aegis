"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import type { CSSProperties, ReactNode } from "react";
import { createBookingAction } from "@/app/actions/bookings";
import type { BookingFormState } from "@/app/actions/bookings";
import { Button, Icon, IconButton, Select } from "@/components/ui";
import { BOOKING_CHANNELS } from "@/lib/data/bookings";

const INITIAL: BookingFormState = { error: null };

export interface NewBookingModalProps {
  onClose: () => void;
  /** Fired once the server confirms the write, so the list can refresh. */
  onCreated: (ref: string) => void;
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
 */
export function NewBookingModal({ onClose, onCreated }: NewBookingModalProps) {
  const [state, formAction] = useActionState(createBookingAction, INITIAL);
  const [channel, setChannel] = useState(BOOKING_CHANNELS[0]);
  const [startsAt, setStartsAt] = useState(nextHourLocal);

  useEffect(() => {
    if (state.createdRef) {
      onCreated(state.createdRef);
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

          <div className="grid grid-cols-1 gap-3.5 wide:grid-cols-2">
            <Field label="Customer" required>
              <input name="customer" style={INPUT} placeholder="Sofia Alvarez" />
            </Field>
            <Field label="Company">
              <input name="company" style={INPUT} placeholder="Kestrel Haulage" />
            </Field>
          </div>

          <Field label="Email">
            <input
              name="email"
              type="email"
              style={INPUT}
              placeholder="sofia@kestrelhaulage.com"
            />
          </Field>

          <div className="grid grid-cols-1 gap-3.5 wide:grid-cols-2">
            <Field label="Service" required>
              <input
                name="service"
                style={INPUT}
                placeholder="Full service & MOT"
              />
            </Field>
            <Field label="Assigned to" required>
              <input name="staff" style={INPUT} placeholder="Ahmed Ben" />
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
                defaultValue={60}
                style={INPUT}
              />
            </Field>
            <Field label="Value ($)">
              <input
                name="valueCents"
                inputMode="decimal"
                defaultValue="0.00"
                style={INPUT}
              />
            </Field>
          </div>

          <Field label="Booked via">
            {/* The design system's Select is a button, not a form control, so a
                hidden input carries its value into the submission. */}
            <input type="hidden" name="channel" value={channel} />
            <Select
              size="md"
              leadingIcon="inbox"
              options={BOOKING_CHANNELS}
              value={channel}
              onChange={setChannel}
            />
          </Field>

          <Field label="Notes">
            <textarea
              name="notes"
              rows={3}
              style={{ ...INPUT, resize: "vertical", padding: "10px 13px" }}
              placeholder="Anything the technician should know before the vehicle arrives."
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
