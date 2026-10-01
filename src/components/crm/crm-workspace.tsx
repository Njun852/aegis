"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Avatar, Button, Icon, SearchInput } from "@/components/ui";
import { useToast } from "@/components/layout/toast-provider";
import { formatMoney } from "@/lib/bookings";
import {
  filterCustomers,
  isNewThisMonth,
  isRecentlyActive,
  sortByActivity,
} from "@/lib/crm";
import { activateOnKey } from "@/lib/interaction";
import { CustomerDrawer } from "./customer-drawer";
import { NewCustomerModal } from "./new-customer-modal";
import type { CustomerProfile, CustomerSummary } from "@/types";

/** Columns collapse to the essentials below the 1240px `wide` breakpoint. */
const GRID =
  "grid gap-3 items-center grid-cols-[minmax(160px,1.4fr)_minmax(0,1.3fr)_110px_20px] wide:grid-cols-[minmax(190px,1.4fr)_minmax(0,1.3fr)_80px_90px_120px_120px_22px]";

export interface CrmWorkspaceProps {
  customers: CustomerSummary[];
  /** The customer named in `?customer=`, loaded on the server. */
  profile: CustomerProfile | null;
  fleetEnabled: boolean;
  businessName: string;
  todayIso: string;
}

export function CrmWorkspace({
  customers,
  profile,
  fleetEnabled,
  businessName,
  todayIso,
}: CrmWorkspaceProps) {
  const router = useRouter();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [opening, startOpening] = useTransition();
  const [openingRef, setOpeningRef] = useState<string | null>(null);

  const today = useMemo(() => new Date(todayIso), [todayIso]);
  const sorted = useMemo(() => sortByActivity(customers), [customers]);
  const visible = useMemo(() => filterCustomers(sorted, search), [sorted, search]);

  // The profile is loaded by the server for the ref in the URL, so opening a
  // customer is a navigation. The row shows it is on its way meanwhile.
  const open = (ref: string | null) => {
    setOpeningRef(ref);
    startOpening(() => {
      router.push(ref ? `/crm?customer=${encodeURIComponent(ref)}` : "/crm", { scroll: false });
    });
  };

  const bookedValue = customers.reduce((sum, customer) => sum + customer.bookedValueCents, 0);

  const stats = [
    {
      label: "Customers",
      value: String(customers.length),
      icon: "users",
      bg: "var(--accent-soft)",
      fg: "var(--accent-primary)",
    },
    {
      label: "Seen in last 90 days",
      value: String(customers.filter((customer) => isRecentlyActive(customer, today)).length),
      icon: "calendar",
      bg: "var(--status-positive-soft)",
      fg: "var(--status-positive)",
    },
    {
      label: "New this month",
      value: String(customers.filter((customer) => isNewThisMonth(customer, today)).length),
      icon: "plus",
      bg: "var(--status-warning-soft)",
      fg: "var(--status-warning)",
    },
    {
      // Named for what it is: bookings made, not money collected.
      label: "Booked value (linked bookings)",
      value: formatMoney(bookedValue, false),
      icon: "wallet",
      bg: "var(--surface-inset)",
      fg: "var(--text-secondary)",
    },
  ];

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
              Customers
            </h2>
            <p style={{ margin: "3px 0 0", fontSize: "12.5px", color: "var(--text-secondary)", textWrap: "pretty" }}>
              {businessName} · {customers.length} {customers.length === 1 ? "customer" : "customers"} ·
              most recently active first
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <SearchInput
              placeholder="Search name, phone, email..."
              value={search}
              onChange={setSearch}
              width={250}
            />
            <Button icon="plus" onClick={() => setAdding(true)}>
              New customer
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
              <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.2, minWidth: 0 }}>
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
          <div className="flex items-center">
            <span className="ml-auto" style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
              {visible.length} of {customers.length} shown
            </span>
          </div>

          <div className={GRID} style={{ padding: "0 10px 8px", borderBottom: "1px solid var(--border-subtle)" }}>
            <ColumnLabel>Customer</ColumnLabel>
            <ColumnLabel>Contact</ColumnLabel>
            <ColumnLabel className="hidden wide:block">Vehicles</ColumnLabel>
            <ColumnLabel className="hidden wide:block">Bookings</ColumnLabel>
            <ColumnLabel className="hidden wide:block">Last visit</ColumnLabel>
            <ColumnLabel className="text-right">Booked value</ColumnLabel>
            <span />
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            {visible.map((customer) => {
              const active = customer.ref === (profile?.customer.ref ?? null) || (opening && customer.ref === openingRef);
              return (
                <div
                  key={customer.ref}
                  role="button"
                  tabIndex={0}
                  aria-label={`${customer.name}, ${customer.bookingCount} bookings`}
                  onClick={() => open(customer.ref)}
                  onKeyDown={activateOnKey(() => open(customer.ref))}
                  className={GRID}
                  style={{
                    padding: "10px",
                    borderRadius: "10px",
                    cursor: opening ? "progress" : "pointer",
                    borderBottom: "1px solid var(--gray-50)",
                    transition: "background var(--dur-fast) var(--ease-standard)",
                    background: active ? "var(--surface-active)" : "transparent",
                  }}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={customer.name} size={30} />
                    <span className="flex min-w-0 flex-col leading-tight">
                      <Strong>{customer.name}</Strong>
                      <Muted>{customer.company || customer.ref}</Muted>
                    </span>
                  </span>
                  <span className="flex min-w-0 flex-col leading-tight">
                    <Strong>{customer.phone || "No phone"}</Strong>
                    <Muted>{customer.email || "No email"}</Muted>
                  </span>
                  <span className="hidden wide:block">
                    <Strong>{fleetEnabled ? String(customer.vehicleCount) : "—"}</Strong>
                  </span>
                  <span className="hidden wide:block">
                    <Strong>{String(customer.bookingCount)}</Strong>
                  </span>
                  <span className="hidden wide:block">
                    <Strong>{customer.lastVisitDay ?? "—"}</Strong>
                  </span>
                  <span style={{ textAlign: "right" }}>
                    <Strong>{formatMoney(customer.bookedValueCents)}</Strong>
                  </span>
                  <span style={{ color: "var(--text-muted)", display: "inline-flex", justifyContent: "flex-end" }}>
                    <Icon name="chevron-right" size={15} />
                  </span>
                </div>
              );
            })}

            {visible.length === 0 && (
              <div style={{ padding: "30px 10px", textAlign: "center", fontSize: "12.5px", color: "var(--text-muted)" }}>
                {customers.length === 0
                  ? "No customers yet. Add one here, or pick “New customer” on a booking."
                  : "No customers match this search."}
              </div>
            )}
          </div>
        </section>
      </div>

      {profile && (
        <CustomerDrawer
          key={profile.customer.ref}
          profile={profile}
          fleetEnabled={fleetEnabled}
          onClose={() => open(null)}
        />
      )}

      {adding && (
        <NewCustomerModal
          onClose={() => setAdding(false)}
          onCreated={(ref, name) => {
            toast({ tone: "success", title: `${name} added`, description: `Saved as ${ref}.` });
            setAdding(false);
            open(ref);
          }}
        />
      )}
    </>
  );
}

function Strong({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "block",
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
      }}
    >
      {children}
    </span>
  );
}

function ColumnLabel({ children, className }: { children?: React.ReactNode; className?: string }) {
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
