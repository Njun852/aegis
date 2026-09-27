"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createVehicleAction } from "@/app/actions/fleet";
import type { VehicleFormState } from "@/app/actions/fleet";
import { Button, Icon, IconButton, Select } from "@/components/ui";
import { DEFAULT_INTERVAL_KM, DEFAULT_INTERVAL_MONTHS } from "@/lib/fleet";
import type { Customer } from "@/types";

const INITIAL: VehicleFormState = { error: null };

const NEW_OWNER = "New customer…";

export interface NewVehicleModalProps {
  customers: Customer[];
  onClose: () => void;
  /** Fired once the server confirms the write, so the list can refresh. */
  onCreated: (ref: string) => void;
}

/**
 * Mounted only while open, so every opening starts from fresh state. The owner
 * is picked from customers already on file, or typed in as a new one; the
 * server writes the new customer only once it knows the plate is free.
 */
export function NewVehicleModal({ customers, onClose, onCreated }: NewVehicleModalProps) {
  const [state, formAction, pending] = useActionState(createVehicleAction, INITIAL);

  // Names repeat ("Juan Dela Cruz"), so each label carries the phone, and a
  // label that still collides gets the customer ref.
  const ownerLabels = new Map<string, string>();
  for (const customer of customers) {
    let label = customer.phone ? `${customer.name} · ${customer.phone}` : customer.name;
    if (ownerLabels.has(label)) label = `${label} (${customer.ref})`;
    ownerLabels.set(label, customer.ref);
  }
  const [owner, setOwner] = useState(NEW_OWNER);
  const newOwner = owner === NEW_OWNER;

  useEffect(() => {
    if (state.createdRef) onCreated(state.createdRef);
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
      {/* Submitted by hand rather than through `action`: React resets a form
          after its action runs, which would wipe everything typed whenever the
          server refuses it, such as for a plate already on file. */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          startTransition(() => formAction(data));
        }}
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
            <Icon name="car" size={15} />
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
            New vehicle
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

          <Group title="Owner">
            <input type="hidden" name="ownerMode" value={newOwner ? "new" : "existing"} />
            <input type="hidden" name="customerRef" value={ownerLabels.get(owner) ?? ""} />
            {customers.length > 0 && (
              <Select
                size="md"
                leadingIcon="user"
                options={[NEW_OWNER, ...ownerLabels.keys()]}
                value={owner}
                onChange={setOwner}
              />
            )}
            {newOwner && (
              <div className="grid grid-cols-1 gap-3.5 wide:grid-cols-3">
                <Field label="Name" required>
                  <input name="ownerName" style={INPUT} placeholder="Juan Dela Cruz" />
                </Field>
                <Field label="Phone" required>
                  <input
                    name="ownerPhone"
                    type="tel"
                    style={INPUT}
                    placeholder="0917 123 4567"
                  />
                </Field>
                <Field label="Email">
                  <input
                    name="ownerEmail"
                    type="email"
                    style={INPUT}
                    placeholder="juan@example.com"
                  />
                </Field>
              </div>
            )}
          </Group>

          <Group title="Vehicle">
            <div className="grid grid-cols-1 gap-3.5 wide:grid-cols-3">
              <Field label="Plate" required>
                <input
                  name="plate"
                  style={{ ...INPUT, fontFamily: "var(--font-mono)", textTransform: "uppercase" }}
                  placeholder="ABC 1234"
                />
              </Field>
              <Field label="Make" required>
                <input name="make" style={INPUT} placeholder="Toyota" />
              </Field>
              <Field label="Model" required>
                <input name="model" style={INPUT} placeholder="Vios" />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3.5 wide:grid-cols-3">
              <Field label="Year">
                <input name="year" inputMode="numeric" style={INPUT} placeholder="2019" />
              </Field>
              <Field label="Colour">
                <input name="colour" style={INPUT} placeholder="Silver" />
              </Field>
              <Field label="Current odometer (km)">
                <input name="odometerKm" inputMode="numeric" style={INPUT} placeholder="45200" />
              </Field>
            </div>
          </Group>

          <Group title="Service schedule">
            <div className="grid grid-cols-1 gap-3.5 wide:grid-cols-2">
              <Field label="Every … months">
                <input
                  name="intervalMonths"
                  inputMode="numeric"
                  defaultValue={DEFAULT_INTERVAL_MONTHS}
                  style={INPUT}
                />
              </Field>
              <Field label="Or every … km">
                <input
                  name="intervalKm"
                  inputMode="numeric"
                  defaultValue={DEFAULT_INTERVAL_KM}
                  style={INPUT}
                />
              </Field>
            </div>
            <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
              Whichever comes first. Change it to match the manufacturer&apos;s
              schedule for this car.
            </span>
          </Group>

          <Field label="Notes">
            <textarea
              name="notes"
              rows={2}
              style={{ ...INPUT, resize: "vertical", padding: "10px 13px" }}
              placeholder="Anything worth knowing about this car."
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
            Log its last service next, so the due date can be worked out.
          </span>
          <span className="flex items-center gap-2.5">
            <Button variant="ghost" onClick={onClose} type="button">
              Cancel
            </Button>
            <Button icon="check" type="submit" disabled={pending}>
              {pending ? "Saving…" : "Add vehicle"}
            </Button>
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

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
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
      <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
        {label}
        {required && <span style={{ color: "var(--status-negative)" }}> *</span>}
      </span>
      {children}
    </label>
  );
}
