"use client";

import { useMemo } from "react";
import { Badge, Button, Icon, IconButton } from "@/components/ui";
import {
  WEEKDAY_LABELS,
  bookingsByDay,
  longDayLabel,
  monthGrid,
  monthLabel,
  shiftMonth,
  startTime,
  type CalendarMonth,
} from "@/lib/booking-calendar";
import { formatMoney, getStatusStyle } from "@/lib/bookings";
import { activateOnKey } from "@/lib/interaction";
import type { Booking } from "@/types";

/** Bookings named in a day cell before the rest fold into "+N more". */
const CHIPS_PER_DAY = 3;

export interface BookingsCalendarProps {
  /** Already narrowed by the status filter and search; every date. */
  bookings: Booking[];
  month: CalendarMonth;
  onMonthChange: (month: CalendarMonth) => void;
  /** The server's "today", as a key. */
  todayKey: string;
  selectedDay: string;
  onSelectDay: (dateKey: string) => void;
  /** The booking whose drawer is open, to mark its chip. */
  openRef: string | null;
  onOpen: (ref: string) => void;
  onNewBooking: (dateKey: string) => void;
}

/**
 * A month of bookings, a week to a row. Each day names its first few bookings
 * by start time; choosing a day lists all of them beside the grid, and any
 * booking opens the same drawer the list view uses.
 */
export function BookingsCalendar({
  bookings,
  month,
  onMonthChange,
  todayKey,
  selectedDay,
  onSelectDay,
  openRef,
  onOpen,
  onNewBooking,
}: BookingsCalendarProps) {
  const weeks = useMemo(() => monthGrid(month), [month]);
  const byDay = useMemo(() => bookingsByDay(bookings), [bookings]);
  const agenda = byDay.get(selectedDay) ?? [];

  return (
    <div className="grid gap-3 wide:grid-cols-[minmax(0,1fr)_300px]">
      <div style={{ minWidth: 0 }}>
        <div className="flex flex-wrap items-center gap-2" style={{ padding: "2px 2px 10px" }}>
          <IconButton
            icon="arrow-left"
            size={30}
            label="Previous month"
            onClick={() => onMonthChange(shiftMonth(month, -1))}
          />
          <IconButton
            icon="arrow-right"
            size={30}
            label="Next month"
            onClick={() => onMonthChange(shiftMonth(month, 1))}
          />
          <h3
            aria-live="polite"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "15px",
              fontWeight: 700,
              letterSpacing: "-.01em",
              marginLeft: 4,
            }}
          >
            {monthLabel(month)}
          </h3>
          <span className="ml-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const [year, monthNumber] = todayKey.split("-").map(Number);
                onMonthChange({ year, month: monthNumber - 1 });
                onSelectDay(todayKey);
              }}
            >
              Today
            </Button>
          </span>
        </div>

        <div
          role="grid"
          aria-label={`Bookings in ${monthLabel(month)}`}
          style={{
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-md)",
            overflow: "hidden",
          }}
        >
          <div role="row" className="grid grid-cols-7" style={{ background: "var(--surface-inset)" }}>
            {WEEKDAY_LABELS.map((label) => (
              <span
                key={label}
                role="columnheader"
                style={{
                  padding: "7px 8px",
                  fontSize: "var(--text-overline-size)",
                  fontWeight: 600,
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                  color: "var(--text-muted)",
                }}
              >
                {label}
              </span>
            ))}
          </div>

          {weeks.map((week) => (
            <div key={week[0].dateKey} role="row" className="grid grid-cols-7">
              {week.map((day, column) => {
                const items = byDay.get(day.dateKey) ?? [];
                const selected = day.dateKey === selectedDay;
                const isToday = day.dateKey === todayKey;
                const hidden = items.length - CHIPS_PER_DAY;

                return (
                  <div
                    key={day.dateKey}
                    role="gridcell"
                    tabIndex={0}
                    aria-selected={selected}
                    aria-label={`${longDayLabel(day.dateKey)}, ${items.length} ${items.length === 1 ? "booking" : "bookings"}`}
                    onClick={() => onSelectDay(day.dateKey)}
                    onKeyDown={activateOnKey(() => onSelectDay(day.dateKey))}
                    style={{
                      minWidth: 0,
                      minHeight: 104,
                      padding: "6px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      cursor: "pointer",
                      borderTop: "1px solid var(--border-subtle)",
                      borderLeft: column === 0 ? "none" : "1px solid var(--border-subtle)",
                      background: selected
                        ? "var(--surface-active)"
                        : day.inMonth
                          ? "var(--surface-card)"
                          : "var(--gray-25)",
                      boxShadow: selected ? "inset 0 0 0 1.5px var(--accent-primary)" : "none",
                      transition: "background var(--dur-fast) var(--ease-standard)",
                    }}
                  >
                    <span
                      style={{
                        alignSelf: "flex-start",
                        minWidth: 22,
                        height: 22,
                        padding: "0 6px",
                        borderRadius: "var(--radius-pill)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "11.5px",
                        fontWeight: isToday ? 700 : 500,
                        fontVariantNumeric: "tabular-nums",
                        color: isToday ? "#fff" : day.inMonth ? "var(--text-primary)" : "var(--text-muted)",
                        background: isToday ? "var(--accent-primary)" : "transparent",
                      }}
                    >
                      {day.day}
                    </span>

                    {items.slice(0, CHIPS_PER_DAY).map((booking) => (
                      <Chip
                        key={booking.ref}
                        booking={booking}
                        open={booking.ref === openRef}
                        onOpen={() => {
                          onSelectDay(day.dateKey);
                          onOpen(booking.ref);
                        }}
                      />
                    ))}

                    {hidden > 0 && (
                      <span style={{ fontSize: "10.5px", fontWeight: 600, color: "var(--text-accent)", padding: "0 4px" }}>
                        +{hidden} more
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3" style={{ paddingTop: 10 }}>
          {(["Pending", "Confirmed", "In progress", "Completed", "Cancelled"] as const).map((status) => (
            <span key={status} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "11px", color: "var(--text-muted)" }}>
              <span style={{ width: 7, height: 7, borderRadius: "var(--radius-pill)", background: getStatusStyle(status).dot }} />
              {status}
            </span>
          ))}
        </div>
      </div>

      <aside
        aria-label={`Bookings on ${longDayLabel(selectedDay)}`}
        style={{
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: "12px",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-md)",
          alignSelf: "start",
        }}
      >
        <div>
          <span
            style={{
              fontSize: "var(--text-overline-size)",
              fontWeight: 600,
              letterSpacing: ".1em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
            }}
          >
            {selectedDay === todayKey ? "Today" : "Selected day"}
          </span>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "14px", fontWeight: 700, marginTop: 2 }}>
            {longDayLabel(selectedDay)}
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--text-muted)", marginTop: 2 }}>
            {agenda.length} {agenda.length === 1 ? "booking" : "bookings"}
          </div>
        </div>

        {agenda.length === 0 && (
          <p style={{ margin: 0, fontSize: "12.5px", color: "var(--text-muted)" }}>
            Nothing booked on this day{bookings.length === 0 ? "" : " that matches the filter"}.
          </p>
        )}

        {agenda.map((booking) => (
          <div
            key={booking.ref}
            role="button"
            tabIndex={0}
            aria-label={`${startTime(booking)}, ${booking.customer}, ${booking.service}, ${booking.status}`}
            onClick={() => onOpen(booking.ref)}
            onKeyDown={activateOnKey(() => onOpen(booking.ref))}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              padding: "9px 10px",
              borderRadius: "10px",
              border: "1px solid var(--border-subtle)",
              cursor: "pointer",
              background: booking.ref === openRef ? "var(--surface-active)" : "transparent",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: "12px", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{booking.time}</span>
              <span style={{ marginLeft: "auto" }}>
                <Badge tone={getStatusStyle(booking.status).tone}>{booking.status}</Badge>
              </span>
            </span>
            <span style={{ fontSize: "12.5px", fontWeight: 600, overflowWrap: "anywhere" }}>{booking.customer}</span>
            <span style={{ fontSize: "11.5px", color: "var(--text-secondary)", overflowWrap: "anywhere" }}>
              {booking.service} · {booking.staff} · {formatMoney(booking.valueCents)}
            </span>
          </div>
        ))}

        <Button size="sm" variant="outline" icon="plus" onClick={() => onNewBooking(selectedDay)}>
          New booking on this day
        </Button>
      </aside>
    </div>
  );
}

function Chip({ booking, open, onOpen }: { booking: Booking; open: boolean; onOpen: () => void }) {
  const cancelled = booking.status === "Cancelled";
  return (
    <button
      type="button"
      title={`${booking.time} · ${booking.customer} · ${booking.service} · ${booking.status}`}
      onClick={(event) => {
        // The cell behind it selects the day; the chip opens the booking.
        event.stopPropagation();
        onOpen();
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        width: "100%",
        minWidth: 0,
        padding: "3px 6px",
        border: `1px solid ${open ? "var(--blue-200)" : "transparent"}`,
        borderRadius: 6,
        background: open ? "var(--accent-soft)" : "var(--surface-inset)",
        cursor: "pointer",
        font: "inherit",
        fontSize: "11px",
        lineHeight: "15px",
        textAlign: "left",
        color: cancelled ? "var(--text-muted)" : "var(--text-primary)",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          flex: "0 0 auto",
          borderRadius: "var(--radius-pill)",
          background: getStatusStyle(booking.status).dot,
        }}
      />
      <span style={{ flex: "0 0 auto", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{startTime(booking)}</span>
      <span
        style={{
          minWidth: 0,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          textDecoration: cancelled ? "line-through" : "none",
        }}
      >
        {booking.customer}
      </span>
      {booking.request && <Icon name="inbox" size={10} style={{ flex: "0 0 auto", color: "var(--accent-primary)" }} />}
    </button>
  );
}
