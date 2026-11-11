"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CSSProperties } from "react";
import { saveCarAction } from "@/app/actions/cars";
import type { CarInput } from "@/app/actions/cars";
import { Badge, Button, Icon } from "@/components/ui";
import { useToast } from "@/components/layout/toast-provider";
import { SERVICE_DUE_STYLES } from "@/lib/fleet";
import type { Vehicle } from "@/types";

const BLANK: CarInput = { plate: "", make: "", model: "", year: "", colour: "", odometerKm: "", notes: "" };

function inputFor(vehicle: Vehicle): CarInput {
  return {
    plate: vehicle.plate,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year === null ? "" : String(vehicle.year),
    colour: vehicle.colour,
    odometerKm: vehicle.odometerKm === null ? "" : String(vehicle.odometerKm),
    notes: vehicle.notes,
  };
}

/** "Toyota Hilux 2019 · White" */
function describe(vehicle: Vehicle): string {
  const name = [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" ");
  return [name, vehicle.colour].filter(Boolean).join(" · ");
}

/**
 * A customer's cars: the basics staff need at the counter, and when each is
 * next due for service. The due date is worked out from completed bookings;
 * it is what Text Blast reminders and the overdue alert read.
 */
export function CustomerCars({ customerRef, customerName, vehicles }: { customerRef: string; customerName: string; vehicles: Vehicle[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  /** The car being edited, "new" for one being added, or null. */
  const [open, setOpen] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<CarInput>(BLANK);
  const [error, setError] = useState<string | null>(null);

  const start = (target: Vehicle | "new") => {
    setError(null);
    setDraft(target === "new" ? BLANK : inputFor(target));
    setOpen(target === "new" ? "new" : target.ref);
  };

  const save = () => {
    setError(null);
    const ref = open === "new" ? null : open;
    startTransition(async () => {
      try {
        const result = await saveCarAction(customerRef, ref, draft);
        if (!result.ok) {
          setError(result.error);
          toast({ tone: "error", title: "Car not saved", description: result.error, key: `car-${customerRef}` });
          return;
        }
        setOpen(null);
        router.refresh();
        toast({
          tone: "success",
          title: ref === null ? `${draft.plate.toUpperCase()} added to ${customerName}` : `${draft.plate.toUpperCase()} saved`,
          key: `car-${customerRef}`,
        });
      } catch {
        toast({ tone: "error", title: "Car not saved", description: "The change did not save. Please try again.", key: `car-${customerRef}` });
      }
    });
  };

  const form = (
    <div style={FORM}>
      {error && (
        <div role="alert" style={{ display: "flex", gap: "8px", fontSize: "12px", color: "var(--status-negative)", overflowWrap: "anywhere" }}>
          <Icon name="circle-alert" size={14} />
          {error}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
        {(
          [
            ["plate", "Plate", "LAA-1007"],
            ["make", "Make", "Toyota"],
            ["model", "Model", "Hilux"],
            ["year", "Year", "2019"],
            ["colour", "Colour", "White"],
            ["odometerKm", "Odometer (km)", "45200"],
          ] as const
        ).map(([key, label, placeholder]) => (
          <label key={key} style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 }}>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              {label}
              {(key === "plate" || key === "make" || key === "model") && <span style={{ color: "var(--status-negative)" }}> *</span>}
            </span>
            <input
              value={draft[key]}
              placeholder={placeholder}
              inputMode={key === "year" || key === "odometerKm" ? "numeric" : undefined}
              onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
              style={{ ...INPUT, ...(key === "plate" ? { textTransform: "uppercase", fontFamily: "var(--font-mono)" } : {}) }}
            />
          </label>
        ))}
      </div>
      <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Notes</span>
        <input
          value={draft.notes}
          placeholder="Diesel, aftermarket rims…"
          onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
          style={INPUT}
        />
      </label>
      <div style={{ display: "flex", gap: "8px" }}>
        <Button size="sm" icon="check" onClick={save} disabled={pending}>
          {pending ? "Saving…" : open === "new" ? "Add car" : "Save car"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(null)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {vehicles.length === 0 && open !== "new" && (
        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>No cars on file yet.</span>
      )}
      {vehicles.map((vehicle) =>
        open === vehicle.ref ? (
          <div key={vehicle.ref}>{form}</div>
        ) : (
          <div key={vehicle.ref} style={ROW}>
            <span style={{ color: "var(--text-muted)", flex: "0 0 auto", marginTop: 2 }}>
              <Icon name="car" size={14} />
            </span>
            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px", lineHeight: 1.3 }}>
              <span style={{ display: "flex", alignItems: "baseline", gap: "8px", minWidth: 0 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "12.5px", fontWeight: 700, color: "var(--text-primary)" }}>
                  {vehicle.plate}
                </span>
                <span style={{ fontSize: "12px", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {describe(vehicle)}
                </span>
              </span>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                {vehicle.odometerKm !== null ? `${vehicle.odometerKm.toLocaleString("en-US")} km` : "No odometer reading"}
                {vehicle.due.dueDay ? ` · Next service ${vehicle.due.dueDay}` : ""}
              </span>
              {vehicle.notes && (
                <span style={{ fontSize: "11px", color: "var(--text-muted)", overflowWrap: "anywhere" }}>{vehicle.notes}</span>
              )}
            </span>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px", flex: "0 0 auto" }}>
              <Badge tone={SERVICE_DUE_STYLES[vehicle.due.status].tone}>{vehicle.due.status}</Badge>
              <button type="button" onClick={() => start(vehicle)} disabled={pending || open !== null} style={LINK}>
                Edit
              </button>
            </span>
          </div>
        ),
      )}
      {open === "new" ? (
        form
      ) : (
        <div>
          <Button size="sm" variant="outline" icon="plus" onClick={() => start("new")} disabled={pending || open !== null}>
            Add car
          </Button>
        </div>
      )}
    </div>
  );
}

const ROW: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "10px",
  padding: "9px 11px",
  border: "1px solid var(--border-subtle)",
  borderRadius: "10px",
  color: "var(--text-secondary)",
};

const FORM: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  padding: "11px",
  border: "1px solid var(--blue-200)",
  borderRadius: "10px",
  background: "var(--gray-25)",
};

const INPUT: CSSProperties = {
  width: "100%",
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

const LINK: CSSProperties = {
  border: "none",
  background: "transparent",
  padding: 0,
  font: "inherit",
  fontSize: "11.5px",
  fontWeight: 600,
  color: "var(--text-accent)",
  cursor: "pointer",
};
