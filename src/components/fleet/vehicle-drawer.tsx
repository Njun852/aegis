"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  logServiceAction,
  setServiceOdometerAction,
  updateOdometerAction,
  updateVehicleAction,
} from "@/app/actions/fleet";
import type { FleetResult, VehicleDetailsInput } from "@/app/actions/fleet";
import { Badge, Button, Icon, IconButton } from "@/components/ui";
import { useToast } from "@/components/layout/toast-provider";
import {
  SERVICE_DUE_STYLES,
  describeDays,
  describeKm,
  formatKm,
  vehicleLabel,
} from "@/lib/fleet";
import type { ServiceRecord, Vehicle } from "@/types";

/** `<input type="date">` wants the local calendar date, not an ISO Z time. */
function toDateInput(iso: string) {
  const when = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
}

type Panel = "log" | "mileage" | "edit" | null;

export interface VehicleDrawerProps {
  vehicle: Vehicle;
  /** This vehicle's service records, newest first. */
  history: ServiceRecord[];
  /** Whether the owner links through to their CRM profile. */
  crmEnabled: boolean;
  /** With Bookings on, a past service is saved as a completed booking. */
  bookingsEnabled: boolean;
  todayIso: string;
  onClose: () => void;
}

/** The right-hand detail panel for one vehicle. */
export function VehicleDrawer({
  vehicle,
  history,
  crmEnabled,
  bookingsEnabled,
  todayIso,
  onClose,
}: VehicleDrawerProps) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [panel, setPanel] = useState<Panel>(null);
  const [error, setError] = useState<string | null>(null);

  const [performedOn, setPerformedOn] = useState(() => toDateInput(todayIso));
  const [serviceKm, setServiceKm] = useState("");
  const [work, setWork] = useState("");
  const [reading, setReading] = useState("");
  const [details, setDetails] = useState<VehicleDetailsInput>(() => ({
    plate: vehicle.plate,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year === null ? "" : String(vehicle.year),
    colour: vehicle.colour,
    intervalMonths: String(vehicle.intervalMonths),
    intervalKm: String(vehicle.intervalKm),
    notes: vehicle.notes,
  }));

  const { due } = vehicle;
  const style = SERVICE_DUE_STYLES[due.status];

  const open = (next: Panel) => {
    setError(null);
    setPanel((current) => (current === next ? null : next));
  };

  /**
   * A refusal the person can fix stays beside the fields it is about; a fault
   * goes to a toast, because the drawer may be closed by the time it lands.
   */
  const run = (work: () => Promise<FleetResult>, done: string, after?: () => void) => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await work();
        if (!result.ok) {
          setError(result.error);
          toast({
            tone: "error",
            title: `${vehicle.plate} did not update`,
            description: result.error,
            key: `vehicle-${vehicle.ref}`,
          });
          return;
        }
        after?.();
        router.refresh();
        toast({
          tone: "success",
          title: done,
          description: result.note,
          key: `vehicle-${vehicle.ref}`,
        });
      } catch {
        toast({
          tone: "error",
          title: `${vehicle.plate} did not update`,
          description: "The change did not save. Please try again.",
          key: `vehicle-${vehicle.ref}`,
        });
      }
    });
  };

  const saveLog = () =>
    run(
      () => logServiceAction(vehicle.ref, { performedOn, odometerKm: serviceKm, work }),
      `Service logged for ${vehicle.plate}`,
      () => {
        setPanel(null);
        setServiceKm("");
        setWork("");
      },
    );

  const saveReading = () =>
    run(
      () => updateOdometerAction(vehicle.ref, reading),
      `${vehicle.plate} mileage updated`,
      () => {
        setPanel(null);
        setReading("");
      },
    );

  const saveDetails = () =>
    run(
      () => updateVehicleAction(vehicle.ref, details),
      `${vehicle.plate} details saved`,
      () => setPanel(null),
    );

  const addRecordReading = (record: ServiceRecord, km: string) =>
    run(
      () => setServiceOdometerAction(record.ref, km),
      `Reading added to the ${record.day} service`,
    );

  const fields: { icon: string; label: string; value: ReactNode }[] = [
    {
      icon: "user",
      label: "Owner",
      value:
        vehicle.owner && crmEnabled ? (
          <Link
            href={`/crm?customer=${encodeURIComponent(vehicle.owner.ref)}`}
            style={{ color: "var(--accent-primary)", textDecoration: "none" }}
          >
            {vehicle.owner.name}
          </Link>
        ) : (
          (vehicle.owner?.name ?? "Not on file")
        ),
    },
    { icon: "phone", label: "Phone", value: vehicle.owner?.phone || "—" },
    { icon: "mail", label: "Email", value: vehicle.owner?.email || "—" },
    {
      icon: "car",
      label: "Vehicle",
      value: [vehicleLabel(vehicle), vehicle.colour].filter(Boolean).join(" · "),
    },
    {
      icon: "gauge",
      label: "Odometer",
      value:
        vehicle.odometerKm === null
          ? "No reading yet"
          : `${formatKm(vehicle.odometerKm)}${vehicle.odometerDay ? ` · read ${vehicle.odometerDay}` : ""}`,
    },
    {
      icon: "clock",
      label: "Schedule",
      value: `Every ${vehicle.intervalMonths} months or ${formatKm(vehicle.intervalKm)}, whichever first`,
    },
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
          width: 420,
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
          <span
            style={{
              width: 38,
              height: 38,
              flex: "0 0 auto",
              borderRadius: "11px",
              background: "var(--surface-inset)",
              color: "var(--text-secondary)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="car" size={18} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "16px",
                fontWeight: 700,
                letterSpacing: ".02em",
                overflowWrap: "anywhere",
              }}
            >
              {vehicle.plate}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "3px" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "10.5px", color: "var(--text-muted)" }}>
                {vehicle.ref}
              </span>
              <Badge tone={style.tone}>{due.status}</Badge>
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
              gap: "6px",
              padding: "13px 14px",
              border: "1px solid var(--border-default)",
              borderRadius: "14px",
              background: due.status === "Overdue" ? "var(--status-negative-soft)" : "transparent",
            }}
          >
            <SectionLabel>Next service</SectionLabel>
            {due.dueDay && due.daysLeft !== null ? (
              <>
                <DueLine
                  icon="calendar"
                  text={`By date: ${due.dueDay}, ${describeDays(due.daysLeft)}`}
                />
                <DueLine
                  icon="gauge"
                  text={
                    due.kmLeft !== null && due.dueKm !== null
                      ? `By km: at ${formatKm(due.dueKm)}, ${describeKm(due.kmLeft)}`
                      : due.dueKm !== null
                        ? `By km: at ${formatKm(due.dueKm)}. Add a current reading to see how close it is.`
                        : "By km: unknown. The last service has no odometer reading."
                  }
                />
              </>
            ) : (
              <span style={{ fontSize: "12.5px", color: "var(--text-secondary)", textWrap: "pretty" }}>
                No service on record yet. Log the last one, or complete a booking for
                this car, and the next due date is worked out from it.
              </span>
            )}
          </div>

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
              <div key={field.label} style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                <span style={{ color: "var(--text-muted)", flex: "0 0 auto", marginTop: 1 }}>
                  <Icon name={field.icon} size={14} />
                </span>
                <span style={{ width: 74, flex: "0 0 auto", fontSize: "11.5px", color: "var(--text-muted)" }}>
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

          {vehicle.notes && (
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
                {vehicle.notes}
              </p>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <SectionLabel>Service history · {history.length}</SectionLabel>
            {history.length === 0 && (
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Nothing recorded yet.</span>
            )}
            {history.map((record) => (
              <HistoryRow
                key={record.ref}
                record={record}
                disabled={pending}
                onAddReading={(km) => addRecordReading(record, km)}
              />
            ))}
          </div>
        </div>

        {(error || panel) && (
          <div
            style={{
              flex: "0 0 auto",
              padding: "12px 16px",
              borderTop: "1px solid var(--border-subtle)",
              background: "var(--gray-25)",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              maxHeight: "55vh",
              overflowY: "auto",
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

            {panel === "log" && (
              <PanelForm title={bookingsEnabled ? "Add a past service" : "Log a service"} onSave={saveLog} onCancel={() => setPanel(null)} pending={pending} saveLabel="Save service">
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="date"
                    value={performedOn}
                    max={toDateInput(todayIso)}
                    onChange={(event) => setPerformedOn(event.target.value)}
                    aria-label="Date of the service"
                    style={EDITOR_INPUT}
                  />
                  <input
                    inputMode="numeric"
                    value={serviceKm}
                    onChange={(event) => setServiceKm(event.target.value)}
                    placeholder="Odometer km"
                    aria-label="Odometer reading at the service, in km"
                    style={{ ...EDITOR_INPUT, width: 130, flex: "0 0 auto" }}
                  />
                </div>
                <input
                  value={work}
                  onChange={(event) => setWork(event.target.value)}
                  placeholder="Work done, e.g. Oil and filter change, brake check"
                  aria-label="Work done"
                  style={EDITOR_INPUT}
                />
                {bookingsEnabled && (
                  <span style={{ fontSize: "11.5px", color: "var(--text-muted)", textWrap: "pretty" }}>
                    Saved as a completed booking, so the job is in Bookings too. For work still
                    to come, make a booking instead.
                  </span>
                )}
              </PanelForm>
            )}

            {panel === "mileage" && (
              <PanelForm title="Update mileage" onSave={saveReading} onCancel={() => setPanel(null)} pending={pending} saveLabel="Save reading">
                <input
                  inputMode="numeric"
                  value={reading}
                  onChange={(event) => setReading(event.target.value)}
                  placeholder={vehicle.odometerKm === null ? "Odometer km" : `Last: ${formatKm(vehicle.odometerKm)}`}
                  aria-label="Current odometer reading, in km"
                  style={EDITOR_INPUT}
                />
              </PanelForm>
            )}

            {panel === "edit" && (
              <PanelForm title="Edit details" onSave={saveDetails} onCancel={() => setPanel(null)} pending={pending} saveLabel="Save details">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  {(
                    [
                      ["plate", "Plate"],
                      ["make", "Make"],
                      ["model", "Model"],
                      ["year", "Year"],
                      ["colour", "Colour"],
                      ["intervalMonths", "Every … months"],
                      ["intervalKm", "Or every … km"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 }}>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{label}</span>
                      <input
                        value={details[key]}
                        onChange={(event) => setDetails((current) => ({ ...current, [key]: event.target.value }))}
                        style={EDITOR_INPUT}
                      />
                    </label>
                  ))}
                </div>
                <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Notes</span>
                  <textarea
                    rows={2}
                    value={details.notes}
                    onChange={(event) => setDetails((current) => ({ ...current, notes: event.target.value }))}
                    style={{ ...EDITOR_INPUT, resize: "vertical" }}
                  />
                </label>
              </PanelForm>
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
          <Button icon="wrench" onClick={() => open("log")} disabled={pending}>
            {bookingsEnabled ? "Past service" : "Log service"}
          </Button>
          <Button variant="outline" icon="gauge" onClick={() => open("mileage")} disabled={pending}>
            Update mileage
          </Button>
          <IconButton icon="pen-line" size={36} label="Edit details" disabled={pending} onClick={() => open("edit")} />
        </div>
      </aside>
    </>
  );
}

function HistoryRow({
  record,
  disabled,
  onAddReading,
}: {
  record: ServiceRecord;
  disabled: boolean;
  onAddReading: (km: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [km, setKm] = useState("");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        padding: "10px 12px",
        border: "1px solid var(--border-subtle)",
        borderRadius: "10px",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
        <span style={{ fontSize: "12px", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{record.day}</span>
        <span style={{ fontSize: "11px", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
          {record.odometerKm !== null ? formatKm(record.odometerKm) : "km not recorded"}
        </span>
        <span style={{ marginLeft: "auto" }}>
          <Badge tone={record.source === "booking" ? "accent" : "neutral"}>
            {record.source === "booking" ? `Booking ${record.bookingRef}` : "Logged"}
          </Badge>
        </span>
      </div>
      <span style={{ fontSize: "12.5px", color: "var(--text-secondary)", overflowWrap: "anywhere" }}>
        {record.work}
      </span>
      {record.odometerKm === null &&
        (adding ? (
          <div style={{ display: "flex", gap: "6px" }}>
            <input
              inputMode="numeric"
              value={km}
              onChange={(event) => setKm(event.target.value)}
              placeholder="Odometer km at this service"
              aria-label={`Odometer reading at the ${record.day} service`}
              style={EDITOR_INPUT}
            />
            <Button size="sm" icon="check" disabled={disabled} onClick={() => onAddReading(km)}>
              Save
            </Button>
            <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <span>
            <Button size="sm" variant="ghost" icon="gauge" onClick={() => setAdding(true)}>
              Add reading
            </Button>
          </span>
        ))}
    </div>
  );
}

function PanelForm({
  title,
  saveLabel,
  pending,
  onSave,
  onCancel,
  children,
}: {
  title: string;
  saveLabel: string;
  pending: boolean;
  onSave: () => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <SectionLabel>{title}</SectionLabel>
      {children}
      <div style={{ display: "flex", gap: "8px" }}>
        <Button size="sm" icon="check" onClick={onSave} disabled={pending}>
          {pending ? "Saving…" : saveLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function DueLine({ icon, text }: { icon: string; text: string }) {
  return (
    <span style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "12.5px", fontWeight: 500 }}>
      <span style={{ color: "var(--text-muted)", marginTop: 1, flex: "0 0 auto" }}>
        <Icon name={icon} size={14} />
      </span>
      <span style={{ textWrap: "pretty" }}>{text}</span>
    </span>
  );
}

const EDITOR_INPUT: CSSProperties = {
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

function SectionLabel({ children }: { children: ReactNode }) {
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
