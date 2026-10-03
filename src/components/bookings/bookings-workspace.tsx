"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Avatar, Badge, Button, Icon, SearchInput, Select } from "@/components/ui";
import {
  countByStatus,
  filterBookings,
  formatDay,
  formatMoney,
  getStatusStyle,
  rangeBounds,
  recognisedRevenueCents,
} from "@/lib/bookings";
import {
  BOOKING_RANGES,
  BOOKING_STATUSES,
  DEFAULT_BOOKING_RANGE,
} from "@/lib/data/bookings";
import { useToast } from "@/components/layout/toast-provider";
import { monthLabel, monthOfKey, monthPrefix } from "@/lib/booking-calendar";
import type { CalendarMonth } from "@/lib/booking-calendar";
import { activateOnKey } from "@/lib/interaction";
import { BookingDrawer } from "./booking-drawer";
import { BookingsCalendar } from "./bookings-calendar";
import { NewBookingModal } from "./new-booking-modal";
import type {
  Booking,
  BookingRange,
  BookingStatusFilter,
  Customer,
  RequestMatches,
  VehicleOption,
} from "@/types";

/** Columns collapse to the essentials below the 1240px `wide` breakpoint. */
const GRID =
  "grid gap-3 items-center grid-cols-[minmax(150px,1.7fr)_minmax(0,1.2fr)_112px_112px_20px] wide:grid-cols-[minmax(190px,1.6fr)_minmax(0,1.25fr)_130px_130px_96px_118px_22px]";

export interface BookingsWorkspaceProps {
  bookings: Booking[];
  /** Fleet vehicles for the Vehicle field. Empty without Fleet, which hides it. */
  vehicles: VehicleOption[];
  /** CRM customers for linking. Null without CRM, which hides both controls. */
  customers: Customer[] | null;
  fleetEnabled: boolean;
  /** What each unlinked online request matches on file, by booking ref. */
  requestMatches: Record<string, RequestMatches>;
  businessName: string;
  /**
   * "Now" as the server saw it. Passed in rather than read from the client
   * clock so the date maths that runs during SSR and after hydration agree.
   */
  todayIso: string;
  /** The same "now" as a calendar day, "2026-10-01", for the calendar view. */
  todayKey: string;
}

type BookingsView = "List" | "Calendar";
const VIEWS: BookingsView[] = ["List", "Calendar"];

export function BookingsWorkspace({
  bookings,
  vehicles,
  customers,
  fleetEnabled,
  requestMatches,
  businessName,
  todayIso,
  todayKey,
}: BookingsWorkspaceProps) {
  const router = useRouter();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<BookingStatusFilter>("All");
  const [range, setRange] = useState<BookingRange>(DEFAULT_BOOKING_RANGE);
  const [openRef, setOpenRef] = useState<string | null>(null);
  // Null while closed; a date key while open from a calendar day, which the
  // form then starts on; "" while open from the New Booking button.
  const [composing, setComposing] = useState<string | null>(null);
  const [view, setView] = useState<BookingsView>("List");
  const [month, setMonth] = useState<CalendarMonth>(() => monthOfKey(todayKey));
  const [selectedDay, setSelectedDay] = useState(todayKey);

  const today = useMemo(() => new Date(todayIso), [todayIso]);
  const calendar = view === "Calendar";

  // Everything in the current date window, before the status and search
  // filters. The stat tiles and the chip counts both read off this. The list
  // takes its window from the range picker; the calendar from the month shown.
  const inWindow = useMemo(
    () =>
      calendar
        ? bookings.filter((booking) => booking.dateKey.startsWith(monthPrefix(month)))
        : filterBookings(bookings, { range, today }),
    [bookings, calendar, month, range, today],
  );

  // The calendar is given every date, so stepping to another month needs no
  // re-filtering; only status and search narrow it.
  const matching = useMemo(
    () => filterBookings(bookings, { range: "All time", today, status, search }),
    [bookings, today, status, search],
  );

  const visible = useMemo(
    () =>
      calendar
        ? matching.filter((booking) => booking.dateKey.startsWith(monthPrefix(month)))
        : filterBookings(bookings, { range, today, status, search }),
    [bookings, calendar, matching, month, range, today, status, search],
  );

  const selected = bookings.find((booking) => booking.ref === openRef) ?? null;

  // Null bounds mean "All time", which has no window to name.
  const bounds = rangeBounds(range, today);
  const windowLabel = calendar
    ? monthLabel(month)
    : bounds
      ? `${formatDay(bounds.from)} – ${formatDay(
          new Date(bounds.to.getTime() - 86_400_000),
        )}`
      : null;

  const stats = [
    {
      label: `Today · ${formatDay(today)}`,
      // By the server's calendar day, so the tile and the calendar's "today"
      // cell can never disagree.
      value: String(inWindow.filter((booking) => booking.dateKey === todayKey).length),
      icon: "calendar",
      bg: "var(--accent-soft)",
      fg: "var(--accent-primary)",
    },
    {
      label: "Awaiting confirmation",
      value: String(countByStatus(inWindow, "Pending")),
      icon: "clock",
      bg: "var(--status-warning-soft)",
      fg: "var(--status-warning)",
    },
    {
      label: calendar ? "Confirmed this month" : "Confirmed this range",
      value: String(countByStatus(inWindow, "Confirmed")),
      icon: "check-circle-2",
      bg: "var(--status-positive-soft)",
      fg: "var(--status-positive)",
    },
    {
      label: "Booked value",
      value: formatMoney(recognisedRevenueCents(inWindow), false),
      icon: "wallet",
      bg: "var(--surface-inset)",
      fg: "var(--text-secondary)",
    },
  ];

  const filters: BookingStatusFilter[] = ["All", ...BOOKING_STATUSES];

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
              Bookings
            </h2>
            <p
              style={{
                margin: "3px 0 0",
                fontSize: "12.5px",
                color: "var(--text-secondary)",
                textWrap: "pretty",
              }}
            >
              {businessName} · {inWindow.length}{" "}
              {inWindow.length === 1 ? "appointment" : "appointments"}
              {windowLabel ? ` in ${windowLabel}` : " in total"} · times shown in
              local time
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <SearchInput
              placeholder="Search customer, service, ref..."
              value={search}
              onChange={setSearch}
              width={250}
            />
            <div
              role="group"
              aria-label="View"
              style={{
                display: "inline-flex",
                padding: 3,
                gap: 2,
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md)",
                background: "var(--surface-card)",
              }}
            >
              {VIEWS.map((option) => {
                const active = option === view;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setView(option)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      height: 30,
                      padding: "0 11px",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                      fontFamily: "var(--font-body)",
                      fontSize: "12px",
                      fontWeight: active ? 700 : 500,
                      color: active ? "var(--blue-600)" : "var(--text-secondary)",
                      background: active ? "var(--accent-soft)" : "transparent",
                    }}
                  >
                    <Icon name={option === "List" ? "layers" : "calendar"} size={13} />
                    {option}
                  </button>
                );
              })}
            </div>
            <Button icon="plus" onClick={() => setComposing("")}>
              New Booking
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
                filter === "All"
                  ? "var(--gray-400)"
                  : getStatusStyle(filter).dot;
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
                    background: active
                      ? "var(--accent-soft)"
                      : "var(--surface-card)",
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
                    {countByStatus(inWindow, filter)}
                  </span>
                </button>
              );
            })}
            <span className="ml-auto flex items-center gap-2.5">
              <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                {visible.length} of {inWindow.length} shown
              </span>
              {/* The calendar has its own month controls; a range would fight them. */}
              {!calendar && (
                <Select
                  size="sm"
                  leadingIcon="calendar"
                  options={BOOKING_RANGES}
                  value={range}
                  onChange={(value) => setRange(value as BookingRange)}
                />
              )}
            </span>
          </div>

          {calendar && (
            <BookingsCalendar
              bookings={matching}
              month={month}
              onMonthChange={setMonth}
              todayKey={todayKey}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
              openRef={openRef}
              onOpen={setOpenRef}
              onNewBooking={setComposing}
            />
          )}

          {!calendar && (
          <>
          <div
            className={GRID}
            style={{
              padding: "0 10px 8px",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <ColumnLabel>Customer</ColumnLabel>
            <ColumnLabel>Service</ColumnLabel>
            <ColumnLabel>When</ColumnLabel>
            <ColumnLabel className="hidden wide:block">Assigned to</ColumnLabel>
            <ColumnLabel className="hidden text-right wide:block">
              Value
            </ColumnLabel>
            <ColumnLabel>Status</ColumnLabel>
            <span />
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            {visible.map((booking) => {
              const tone = getStatusStyle(booking.status).tone;
              return (
                <div
                  key={booking.ref}
                  role="button"
                  tabIndex={0}
                  aria-label={`${booking.customer} — ${booking.service}, ${booking.day}`}
                  onClick={() => setOpenRef(booking.ref)}
                  onKeyDown={activateOnKey(() => setOpenRef(booking.ref))}
                  className={GRID}
                  style={{
                    padding: "10px",
                    borderRadius: "10px",
                    cursor: "pointer",
                    borderBottom: "1px solid var(--gray-50)",
                    transition:
                      "background var(--dur-fast) var(--ease-standard)",
                    background:
                      booking.ref === openRef
                        ? "var(--surface-active)"
                        : "transparent",
                  }}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={booking.customer} size={30} />
                    <span className="flex min-w-0 flex-col leading-tight">
                      <span
                        style={{
                          fontSize: "13px",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {booking.customer}
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "10px",
                          color: "var(--text-muted)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {booking.ref}
                        {booking.request && (
                          <span
                            style={{
                              marginLeft: 6,
                              padding: "1px 6px",
                              borderRadius: "var(--radius-pill)",
                              background: "var(--accent-soft)",
                              color: "var(--accent-primary)",
                              fontFamily: "var(--font-body)",
                              fontWeight: 600,
                            }}
                          >
                            Online
                          </span>
                        )}
                        <span className="wide:hidden"> · {booking.staff}</span>
                      </span>
                    </span>
                  </div>

                  <span className="flex min-w-0 flex-col leading-tight">
                    <span
                      style={{
                        fontSize: "12.5px",
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {booking.service}
                    </span>
                    <span
                      style={{
                        fontSize: "11px",
                        color: "var(--text-muted)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {booking.duration}
                      <span className="wide:hidden">
                        {" "}
                        · {formatMoney(booking.valueCents)}
                      </span>
                    </span>
                  </span>

                  <span className="flex flex-col leading-tight">
                    <span
                      style={{
                        fontSize: "12.5px",
                        fontWeight: 500,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {booking.day}
                    </span>
                    <span
                      style={{
                        fontSize: "11px",
                        color: "var(--text-muted)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {booking.time}
                    </span>
                  </span>

                  <span className="hidden min-w-0 items-center gap-1.5 wide:flex">
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "var(--radius-pill)",
                        background: "var(--gray-300)",
                        flex: "0 0 auto",
                      }}
                    />
                    <span
                      style={{
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {booking.staff}
                    </span>
                  </span>

                  <span
                    className="hidden wide:block"
                    style={{
                      fontSize: "12.5px",
                      fontWeight: 600,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatMoney(booking.valueCents)}
                  </span>

                  <span>
                    <Badge tone={tone}>{booking.status}</Badge>
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
            })}

            {visible.length === 0 && (
              <div
                style={{
                  padding: "30px 10px",
                  textAlign: "center",
                  fontSize: "12.5px",
                  color: "var(--text-muted)",
                }}
              >
                {bookings.length === 0
                  ? "No bookings yet. Create the first one to get started."
                  : "No bookings match this filter."}
              </div>
            )}
          </div>
          </>
          )}
        </section>
      </div>

      {selected && (
        <BookingDrawer
          key={selected.ref}
          booking={selected}
          vehicle={vehicles.find((vehicle) => vehicle.ref === selected.vehicleRef) ?? null}
          customers={customers}
          fleetEnabled={fleetEnabled}
          matches={requestMatches[selected.ref] ?? null}
          onClose={() => setOpenRef(null)}
        />
      )}

      {composing !== null && (
        <NewBookingModal
          vehicles={vehicles}
          fleetEnabled={fleetEnabled}
          customers={customers}
          initialDate={composing || null}
          onClose={() => setComposing(null)}
          onCreated={(ref, note) => {
            toast({
              tone: "success",
              title: `Booking ${ref} created`,
              description: [note, "Saved as Pending — confirm it from the booking."]
                .filter(Boolean)
                .join(". "),
            });
            setComposing(null);
            // Pull the newly written row back from the server, then open it.
            router.refresh();
            setOpenRef(ref);
          }}
        />
      )}
    </>
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
