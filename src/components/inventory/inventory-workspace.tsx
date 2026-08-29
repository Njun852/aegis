"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Icon,
  IconButton,
  SearchInput,
  Select,
} from "@/components/ui";
import { formatDay, formatMoney } from "@/lib/format";
import {
  belowReorder,
  countByStatus,
  fillPercent,
  filterInventory,
  getStatusStyle,
  movesInPeriod,
  periodBounds,
  totalValueCents,
} from "@/lib/inventory";
import {
  DEFAULT_INVENTORY_PERIOD,
  INVENTORY_PERIODS,
  INVENTORY_STATUSES,
} from "@/lib/data/inventory";
import { activateOnKey } from "@/lib/interaction";
import { ItemDrawer } from "./item-drawer";
import { StockMoveModal } from "./stock-move-modal";
import type {
  InventoryItem,
  InventoryPeriod,
  InventoryStatusFilter,
  StockMove,
  StockMoveKind,
} from "@/types";

/** Unit cost and value drop below the 1240px `wide` breakpoint. */
const GRID =
  "grid gap-3 items-center grid-cols-[minmax(120px,1.35fr)_minmax(0,1fr)_104px_64px] wide:grid-cols-[minmax(200px,1.7fr)_minmax(0,1.2fr)_92px_96px_118px_64px]";

export interface InventoryWorkspaceProps {
  items: InventoryItem[];
  /** Movement history, newest first. Feeds the counts and the drawer's trail. */
  moves: StockMove[];
  businessName: string;
  /**
   * "Now" as the server saw it. Passed in rather than read from the client
   * clock so the date maths that runs during SSR and after hydration agree.
   */
  todayIso: string;
}

export function InventoryWorkspace({
  items,
  moves,
  businessName,
  todayIso,
}: InventoryWorkspaceProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<InventoryStatusFilter>("All");
  const [period, setPeriod] = useState<InventoryPeriod>(
    DEFAULT_INVENTORY_PERIOD,
  );
  const [openSku, setOpenSku] = useState<string | null>(null);
  const [move, setMove] = useState<{
    kind: StockMoveKind;
    sku?: string;
  } | null>(null);

  const today = useMemo(() => new Date(todayIso), [todayIso]);

  const visible = useMemo(
    () => filterInventory(items, { status, search }),
    [items, status, search],
  );

  const windowMoves = useMemo(
    () => movesInPeriod(moves, period, today),
    [moves, period, today],
  );

  const selected = items.find((item) => item.sku === openSku) ?? null;

  const bounds = periodBounds(period, today);
  const windowLabel = `${formatDay(bounds.from)} – ${formatDay(
    new Date(bounds.to.getTime() - 86_400_000),
  )}`;

  const stats = [
    {
      label: "Tracked SKUs",
      value: String(items.length),
      icon: "package",
      bg: "var(--accent-soft)",
      fg: "var(--accent-primary)",
    },
    {
      label: "Below reorder point",
      value: String(belowReorder(items).length),
      icon: "trending-up",
      bg: "var(--status-warning-soft)",
      fg: "var(--status-warning)",
    },
    {
      label: "Movements this range",
      value: String(windowMoves.length),
      icon: "arrow-left-right",
      bg: "var(--status-positive-soft)",
      fg: "var(--status-positive)",
    },
    {
      label: "Stock on hand",
      value: formatMoney(totalValueCents(items), false),
      icon: "wallet",
      bg: "var(--surface-inset)",
      fg: "var(--text-secondary)",
    },
  ];

  const filters: InventoryStatusFilter[] = ["All", ...INVENTORY_STATUSES];

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
              Inventory
            </h2>
            <p
              style={{
                margin: "3px 0 0",
                fontSize: "12.5px",
                color: "var(--text-secondary)",
                textWrap: "pretty",
              }}
            >
              {businessName} · {items.length} tracked{" "}
              {items.length === 1 ? "SKU" : "SKUs"} · stock in/out for{" "}
              {windowLabel} · {windowMoves.length}{" "}
              {windowMoves.length === 1 ? "movement" : "movements"} logged
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <SearchInput
              placeholder="Search item, SKU, supplier..."
              value={search}
              onChange={setSearch}
              width={250}
            />
            <Button icon="arrow-down" onClick={() => setMove({ kind: "in" })}>
              Stock In
            </Button>
            <Button
              variant="outline"
              icon="arrow-up"
              onClick={() => setMove({ kind: "out" })}
            >
              Stock Out
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
                    {countByStatus(items, filter)}
                  </span>
                </button>
              );
            })}
            <span className="ml-auto flex items-center gap-2.5">
              <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                {visible.length} of {items.length} shown
              </span>
              <Select
                size="sm"
                leadingIcon="calendar"
                options={INVENTORY_PERIODS}
                value={period}
                onChange={(value) => setPeriod(value as InventoryPeriod)}
              />
            </span>
          </div>

          <div
            className={GRID}
            style={{
              padding: "0 10px 8px",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <ColumnLabel>Item</ColumnLabel>
            <ColumnLabel>Stock level</ColumnLabel>
            <ColumnLabel className="hidden text-right wide:block">
              Unit cost
            </ColumnLabel>
            <ColumnLabel className="hidden text-right wide:block">
              Value
            </ColumnLabel>
            <ColumnLabel>Status</ColumnLabel>
            <span />
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            {visible.map((item) => {
              const style = getStatusStyle(item.status);
              return (
                <div
                  key={item.sku}
                  role="button"
                  tabIndex={0}
                  aria-label={`${item.name} — ${item.onHand} ${item.unit} on hand, ${item.status}`}
                  onClick={() => setOpenSku(item.sku)}
                  onKeyDown={activateOnKey(() => setOpenSku(item.sku))}
                  className={GRID}
                  style={{
                    padding: "10px",
                    borderRadius: "10px",
                    cursor: "pointer",
                    borderBottom: "1px solid var(--gray-50)",
                    transition:
                      "background var(--dur-fast) var(--ease-standard)",
                    background:
                      item.sku === openSku
                        ? "var(--surface-active)"
                        : "transparent",
                  }}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      style={{
                        width: 30,
                        height: 30,
                        flex: "0 0 auto",
                        borderRadius: "8px",
                        background: "var(--surface-inset)",
                        color: "var(--text-secondary)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon name={item.icon} size={15} />
                    </span>
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
                        {item.name}
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
                        {item.sku} · {item.category}
                      </span>
                    </span>
                  </div>

                  <span className="flex min-w-0 flex-col gap-1.5">
                    <span
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: "5px",
                        fontSize: "12.5px",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{item.onHand}</span>
                      <span
                        style={{
                          fontSize: "11px",
                          color: "var(--text-muted)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {item.unit}
                        <span className="hidden wide:inline">
                          {" "}
                          · target {item.target}
                        </span>
                        <span className="wide:hidden">
                          {" "}
                          · {formatMoney(item.valueCents, false)}
                        </span>
                      </span>
                    </span>
                    <span
                      style={{
                        height: 4,
                        borderRadius: "var(--radius-pill)",
                        background: "var(--surface-inset)",
                        overflow: "hidden",
                      }}
                    >
                      <span
                        style={{
                          display: "block",
                          height: "100%",
                          borderRadius: "var(--radius-pill)",
                          background: style.bar,
                          width: `${fillPercent(item)}%`,
                        }}
                      />
                    </span>
                  </span>

                  <span
                    className="hidden wide:block"
                    style={{
                      fontSize: "12.5px",
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {formatMoney(item.unitCostCents)}
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
                    {formatMoney(item.valueCents, false)}
                  </span>

                  <span>
                    <Badge tone={style.tone}>{item.status}</Badge>
                  </span>

                  <span className="inline-flex items-center justify-end gap-1">
                    <IconButton
                      icon="arrow-down"
                      size={28}
                      label={`Stock in ${item.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setMove({ kind: "in", sku: item.sku });
                      }}
                    />
                    <IconButton
                      icon="arrow-up"
                      size={28}
                      label={`Stock out ${item.name}`}
                      disabled={item.onHand <= 0}
                      onClick={(event) => {
                        event.stopPropagation();
                        setMove({ kind: "out", sku: item.sku });
                      }}
                    />
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
                {items.length === 0
                  ? "Nothing tracked yet. Record a stock in to create the first item."
                  : "No items match this filter."}
              </div>
            )}
          </div>
        </section>
      </div>

      {selected && (
        <ItemDrawer
          key={selected.sku}
          item={selected}
          moves={moves.filter((entry) => entry.sku === selected.sku)}
          onClose={() => setOpenSku(null)}
          onStockIn={() => setMove({ kind: "in", sku: selected.sku })}
          onStockOut={() => setMove({ kind: "out", sku: selected.sku })}
        />
      )}

      {move && (
        <StockMoveModal
          kind={move.kind}
          items={items}
          moves={moves}
          startSku={move.sku}
          onClose={() => setMove(null)}
          onRecorded={(sku) => {
            setMove(null);
            // Pull the new level and the new movement back from the server,
            // then show the item it landed on.
            router.refresh();
            setOpenSku(sku);
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
