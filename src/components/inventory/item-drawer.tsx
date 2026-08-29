"use client";

import { Badge, Button, Icon, IconButton } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { getStatusStyle, moveReasonMeta } from "@/lib/inventory";
import type { InventoryItem, StockMove } from "@/types";

export interface ItemDrawerProps {
  item: InventoryItem;
  /** This item's movements, newest first. */
  moves: StockMove[];
  onClose: () => void;
  onStockIn: () => void;
  onStockOut: () => void;
}

/**
 * How a movement reads in the trail. An internal move is neither a gain nor a
 * loss to the business, so it stays neutral rather than borrowing the green and
 * red that mean money.
 */
function movementStyle(move: StockMove) {
  if (!moveReasonMeta(move.reason).transaction) {
    return { icon: "arrow-left-right", fg: "var(--text-secondary)" };
  }
  return move.kind === "in"
    ? { icon: "arrow-down", fg: "var(--status-positive)" }
    : { icon: "arrow-up", fg: "var(--status-negative)" };
}

/** The right-hand detail panel for one stocked item. */
export function ItemDrawer({
  item,
  moves,
  onClose,
  onStockIn,
  onStockOut,
}: ItemDrawerProps) {
  const status = getStatusStyle(item.status);

  const counts = [
    { label: "On hand", value: String(item.onHand) },
    { label: "Reorder at", value: String(item.reorder) },
  ];

  const fields = [
    { icon: "package", label: "Category", value: item.category },
    {
      icon: "wallet",
      label: "Unit cost",
      value: `${formatMoney(item.unitCostCents)} · ${formatMoney(item.valueCents, false)} on hand`,
    },
    {
      icon: "trending-up",
      label: "Target",
      value: `${item.target} ${item.unit} · reorder at ${item.reorder}`,
    },
    { icon: "clock", label: "Last count", value: item.updated },
  ];

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 70,
          background: "rgba(23,28,37,.18)",
        }}
      />
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 398,
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
              borderRadius: "10px",
              background: "var(--surface-inset)",
              color: "var(--text-secondary)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name={item.icon} size={18} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "16px",
                fontWeight: 700,
                letterSpacing: "-.015em",
                overflowWrap: "anywhere",
              }}
            >
              {item.name}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginTop: "3px",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10.5px",
                  color: "var(--text-muted)",
                }}
              >
                {item.sku}
              </span>
              <Badge tone={status.tone}>{item.status}</Badge>
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
          <div className="grid grid-cols-2 gap-2">
            {counts.map((count) => (
              <div
                key={count.label}
                style={{
                  padding: "11px 12px",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-md)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "1px",
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontSize: "10px",
                    letterSpacing: ".08em",
                    textTransform: "uppercase",
                    color: "var(--text-muted)",
                  }}
                >
                  {count.label}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "17px",
                    fontWeight: 700,
                    letterSpacing: "-.02em",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {count.value}
                </span>
              </div>
            ))}
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
              <div
                key={field.label}
                style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}
              >
                <span
                  style={{
                    color: "var(--text-muted)",
                    flex: "0 0 auto",
                    marginTop: 1,
                  }}
                >
                  <Icon name={field.icon} size={14} />
                </span>
                <span
                  style={{
                    width: 86,
                    flex: "0 0 auto",
                    fontSize: "11.5px",
                    color: "var(--text-muted)",
                  }}
                >
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

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span
              style={{
                fontSize: "var(--text-overline-size)",
                letterSpacing: ".1em",
                textTransform: "uppercase",
                color: "var(--text-muted)",
              }}
            >
              Recent movement
            </span>

            {moves.map((entry) => {
              const style = movementStyle(entry);
              const meta = [
                entry.when,
                entry.party,
                entry.amountCents ? formatMoney(entry.amountCents) : "",
              ]
                .filter(Boolean)
                .join(" · ");

              return (
                <div
                  key={entry.ref}
                  style={{ display: "flex", alignItems: "center", gap: "10px" }}
                >
                  <span
                    style={{
                      color: style.fg,
                      flex: "0 0 auto",
                      display: "inline-flex",
                    }}
                  >
                    <Icon name={style.icon} size={14} />
                  </span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: "flex",
                      flexDirection: "column",
                      lineHeight: 1.3,
                    }}
                  >
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        overflowWrap: "anywhere",
                      }}
                    >
                      {entry.createdItem ? "Item created · " : ""}
                      {entry.reason}
                      {entry.documentRef ? ` · ${entry.documentRef}` : ""}
                    </span>
                    <span
                      style={{
                        fontSize: "11px",
                        color: "var(--text-muted)",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {meta}
                    </span>
                  </span>
                  <span
                    style={{
                      fontSize: "12.5px",
                      fontWeight: 600,
                      fontVariantNumeric: "tabular-nums",
                      color: style.fg,
                    }}
                  >
                    {entry.kind === "in" ? "+" : "−"}
                    {entry.quantity}
                  </span>
                </div>
              );
            })}

            {moves.length === 0 && (
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                Nothing has moved in or out of this item yet.
              </span>
            )}
          </div>
        </div>

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
          <Button icon="arrow-down" onClick={onStockIn}>
            Stock In
          </Button>
          <Button
            variant="outline"
            icon="arrow-up"
            disabled={item.onHand <= 0}
            onClick={onStockOut}
          >
            Stock Out
          </Button>
          {/* Editing an item's own settings is not built yet; the design puts
              the affordance here, so it stays visible and plainly inert. */}
          <IconButton
            icon="settings"
            size={36}
            label="Item settings — not available yet"
            title="Item settings are not available yet"
            disabled
            style={{ opacity: 0.45, cursor: "not-allowed" }}
          />
        </div>
      </aside>
    </>
  );
}
