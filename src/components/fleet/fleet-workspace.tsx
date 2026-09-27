"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge, Button, Icon, SearchInput } from "@/components/ui";
import { useToast } from "@/components/layout/toast-provider";
import {
  SERVICE_DUE_STATUSES,
  SERVICE_DUE_STYLES,
  countByDue,
  describeDays,
  describeKm,
  filterVehicles,
  formatKm,
  sortByUrgency,
  vehicleLabel,
} from "@/lib/fleet";
import { activateOnKey } from "@/lib/interaction";
import { NewVehicleModal } from "./new-vehicle-modal";
import { VehicleDrawer } from "./vehicle-drawer";
import type { Customer, ServiceDueFilter, ServiceRecord, Vehicle } from "@/types";

/** Columns collapse to the essentials below the 1240px `wide` breakpoint. */
const GRID =
  "grid gap-3 items-center grid-cols-[minmax(150px,1.3fr)_minmax(0,1.2fr)_128px_20px] wide:grid-cols-[minmax(170px,1.3fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_150px_22px]";

export interface FleetWorkspaceProps {
  vehicles: Vehicle[];
  customers: Customer[];
  /** Every service record for the business, newest first. */
  history: ServiceRecord[];
  businessName: string;
  /** "Now" as the server saw it, for the date a new service log defaults to. */
  todayIso: string;
}

export function FleetWorkspace({
  vehicles,
  customers,
  history,
  businessName,
  todayIso,
}: FleetWorkspaceProps) {
  const router = useRouter();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ServiceDueFilter>("All");
  const [openRef, setOpenRef] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const sorted = useMemo(() => sortByUrgency(vehicles), [vehicles]);
  const visible = useMemo(
    () => filterVehicles(sorted, { status, search }),
    [sorted, status, search],
  );

  const selected = vehicles.find((vehicle) => vehicle.ref === openRef) ?? null;
  const selectedHistory = useMemo(
    () => (openRef ? history.filter((record) => record.vehicleRef === openRef) : []),
    [history, openRef],
  );

  const stats = [
    {
      label: "Vehicles on file",
      value: String(vehicles.length),
      icon: "car",
      bg: "var(--accent-soft)",
      fg: "var(--accent-primary)",
    },
    {
      label: "Overdue for service",
      value: String(countByDue(vehicles, "Overdue")),
      icon: "alert-triangle",
      bg: "var(--status-negative-soft)",
      fg: "var(--status-negative)",
    },
    {
      label: "Due in 30 days",
      value: String(countByDue(vehicles, "Due soon")),
      icon: "clock",
      bg: "var(--status-warning-soft)",
      fg: "var(--status-warning)",
    },
    {
      label: "No service on record",
      value: String(countByDue(vehicles, "No service on record")),
      icon: "wrench",
      bg: "var(--surface-inset)",
      fg: "var(--text-secondary)",
    },
  ];

  const filters: ServiceDueFilter[] = ["All", ...SERVICE_DUE_STATUSES];

  return (
    <>
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--font-display)",
                fontSize: "22px",
                lineHeight: "28px",
                fontWeight: 700,
                letterSpacing: "-.02em",
              }}
            >
              Fleet
            </h2>
            <p
              style={{
                margin: "3px 0 0",
                fontSize: "12.5px",
                color: "var(--text-secondary)",
                textWrap: "pretty",
              }}
            >
              {businessName} · {vehicles.length}{" "}
              {vehicles.length === 1 ? "customer vehicle" : "customer vehicles"} ·
              most urgent first
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <SearchInput
              placeholder="Search plate, owner, model..."
              value={search}
              onChange={setSearch}
              width={250}
            />
            <Button icon="plus" onClick={() => setAdding(true)}>
              New vehicle
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 wide:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              style={{
                background: "var(--surface-card)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md)",
                boxShadow: "var(--shadow-card)",
                padding: "12px 14px",
                display: "flex",
                alignItems: "center",
                gap: "11px",
                minWidth: 0,
              }}
            >
              <span
                style={{
                  width: 32,
                  height: 32,
                  flex: "0 0 auto",
                  borderRadius: "9px",
                  background: stat.bg,
                  color: stat.fg,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name={stat.icon} size={15} />
              </span>
              <span
                style={{
                  display: "flex",
                  flexDirection: "column",
                  lineHeight: 1.2,
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "19px",
                    fontWeight: 700,
                    letterSpacing: "-.02em",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {stat.value}
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    color: "var(--text-muted)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {stat.label}
                </span>
              </span>
            </div>
          ))}
        </div>

        <section
          style={{
            background: "var(--surface-card)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-card)",
            padding: "12px 12px 10px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            minWidth: 0,
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            {filters.map((filter) => {
              const active = status === filter;
              const dot =
                filter === "All" ? "var(--gray-400)" : SERVICE_DUE_STYLES[filter].dot;
              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setStatus(filter)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "7px",
                    height: 30,
                    padding: "0 12px",
                    borderRadius: "var(--radius-pill)",
                    border: `1px solid ${active ? "var(--blue-200)" : "var(--border-default)"}`,
                    cursor: "pointer",
                    fontFamily: "var(--font-body)",
                    fontSize: "12px",
                    fontWeight: active ? 700 : 500,
                    color: active ? "var(--blue-600)" : "var(--text-primary)",
                    background: active ? "var(--accent-soft)" : "var(--surface-card)",
                    transition: "background var(--dur-fast) var(--ease-standard)",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "var(--radius-pill)",
                      background: dot,
                    }}
                  />
                  {filter}
                  <span
                    style={{
                      fontVariantNumeric: "tabular-nums",
                      color: "var(--text-muted)",
                    }}
                  >
                    {countByDue(vehicles, filter)}
                  </span>
                </button>
              );
            })}
            <span
              className="ml-auto"
              style={{ fontSize: "11.5px", color: "var(--text-muted)" }}
            >
              {visible.length} of {vehicles.length} shown
            </span>
          </div>

          <div
            className={GRID}
            style={{
              padding: "0 10px 8px",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <ColumnLabel>Vehicle</ColumnLabel>
            <ColumnLabel>Owner</ColumnLabel>
            <ColumnLabel className="hidden wide:block">Last service</ColumnLabel>
            <ColumnLabel className="hidden wide:block">Next due</ColumnLabel>
            <ColumnLabel>Status</ColumnLabel>
            <span />
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            {visible.map((vehicle) => (
              <VehicleRow
                key={vehicle.ref}
                vehicle={vehicle}
                active={vehicle.ref === openRef}
                onOpen={() => setOpenRef(vehicle.ref)}
              />
            ))}

            {visible.length === 0 && (
              <div
                style={{
                  padding: "30px 10px",
                  textAlign: "center",
                  fontSize: "12.5px",
                  color: "var(--text-muted)",
                }}
              >
                {vehicles.length === 0
                  ? "No vehicles yet. Add the first customer car to start tracking its service."
                  : "No vehicles match this filter."}
              </div>
            )}
          </div>
        </section>
      </div>

      {selected && (
        <VehicleDrawer
          key={selected.ref}
          vehicle={selected}
          history={selectedHistory}
          todayIso={todayIso}
          onClose={() => setOpenRef(null)}
        />
      )}

      {adding && (
        <NewVehicleModal
          customers={customers}
          onClose={() => setAdding(false)}
          onCreated={(ref) => {
            toast({
              tone: "success",
              title: `Vehicle ${ref} added`,
              description: "Log its last service so AEGIS can tell when the next one is due.",
            });
            setAdding(false);
            router.refresh();
            setOpenRef(ref);
          }}
        />
      )}
    </>
  );
}

function VehicleRow({
  vehicle,
  active,
  onOpen,
}: {
  vehicle: Vehicle;
  active: boolean;
  onOpen: () => void;
}) {
  const style = SERVICE_DUE_STYLES[vehicle.due.status];
  const { due } = vehicle;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${vehicle.plate}, ${vehicleLabel(vehicle)}: ${due.status}`}
      onClick={onOpen}
      onKeyDown={activateOnKey(onOpen)}
      className={GRID}
      style={{
        padding: "10px",
        borderRadius: "10px",
        cursor: "pointer",
        borderBottom: "1px solid var(--gray-50)",
        transition: "background var(--dur-fast) var(--ease-standard)",
        background: active ? "var(--surface-active)" : "transparent",
      }}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          style={{
            width: 30,
            height: 30,
            flex: "0 0 auto",
            borderRadius: "9px",
            background: "var(--surface-inset)",
            color: "var(--text-secondary)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="car" size={15} />
        </span>
        <span className="flex min-w-0 flex-col leading-tight">
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "12.5px",
              fontWeight: 700,
              letterSpacing: ".02em",
              whiteSpace: "nowrap",
            }}
          >
            {vehicle.plate}
          </span>
          <Muted>{vehicleLabel(vehicle)}</Muted>
        </span>
      </span>

      <span className="flex min-w-0 flex-col leading-tight">
        <Ellipsis>{vehicle.owner?.name ?? "Owner not on file"}</Ellipsis>
        <Muted>{vehicle.owner?.phone || "No phone"}</Muted>
      </span>

      <span className="hidden min-w-0 flex-col leading-tight wide:flex">
        <Ellipsis>{vehicle.lastService?.day ?? "None recorded"}</Ellipsis>
        <Muted>
          {vehicle.lastService
            ? vehicle.lastService.odometerKm !== null
              ? formatKm(vehicle.lastService.odometerKm)
              : "km not recorded"
            : " "}
        </Muted>
      </span>

      <span className="hidden min-w-0 flex-col leading-tight wide:flex">
        <Ellipsis>
          {due.dueDay && due.daysLeft !== null
            ? `${due.dueDay} · ${describeDays(due.daysLeft)}`
            : "Log a service to schedule"}
        </Ellipsis>
        <Muted>
          {due.kmLeft !== null
            ? `${formatKm(due.dueKm ?? 0)} · ${describeKm(due.kmLeft)}`
            : due.dueDay
              ? "km basis unknown"
              : " "}
        </Muted>
      </span>

      <span>
        <Badge tone={style.tone}>{due.status}</Badge>
      </span>

      <span
        style={{
          color: "var(--text-muted)",
          display: "inline-flex",
          justifyContent: "flex-end",
        }}
      >
        <Icon name="chevron-right" size={15} />
      </span>
    </div>
  );
}

function Ellipsis({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: "12.5px",
        fontWeight: 500,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {children}
    </span>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: "11px",
        color: "var(--text-muted)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {children}
    </span>
  );
}

function ColumnLabel({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={className}
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
