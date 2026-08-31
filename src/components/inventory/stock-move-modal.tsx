"use client";

import { useActionState, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { recordStockMoveAction } from "@/app/actions/inventory";
import type { StockMoveFormState } from "@/app/actions/inventory";
import { Badge, Button, Icon, IconButton } from "@/components/ui";
import { formatMoney, parseCents } from "@/lib/format";
import {
  DEFAULT_MOVE_REASON,
  MOVE_REASON_CHIPS,
  MOVE_REASONS,
} from "@/lib/data/inventory";
import {
  findItem,
  nearMatches,
  recentParties,
  suggestedUnitAmountCents,
} from "@/lib/inventory";
import type {
  InventoryItem,
  StockMove,
  StockMoveKind,
  StockMoveReason,
} from "@/types";

const INITIAL: StockMoveFormState = { error: null };

export interface StockMoveModalProps {
  kind: StockMoveKind;
  items: InventoryItem[];
  /** Movement history, newest first. Only used to suggest recent parties. */
  moves: StockMove[];
  /** Pre-selects an item when the dialog was opened from a row or the drawer. */
  startSku?: string;
  onClose: () => void;
  /** Fired once the server confirms the write, with the SKU that moved. */
  onRecorded: (sku: string, summary: string) => void;
}

/**
 * Records one stock in or stock out.
 *
 * Mounted only while open, so every opening starts from fresh state — no reset
 * effect, and no quantity left over from the last movement.
 */
export function StockMoveModal({
  kind,
  items,
  moves,
  startSku,
  onClose,
  onRecorded,
}: StockMoveModalProps) {
  const [state, formAction] = useActionState(recordStockMoveAction, INITIAL);

  const startItem = startSku
    ? (items.find((item) => item.sku === startSku) ?? null)
    : null;

  const [name, setName] = useState(startItem?.name ?? "");
  const [quantity, setQuantity] = useState("");
  const [documentRef, setDocumentRef] = useState("");
  const [party, setParty] = useState("");
  const [reason, setReason] = useState<StockMoveReason>(
    DEFAULT_MOVE_REASON[kind],
  );
  /**
   * `null` means "follow the suggested amount". The field only stops tracking
   * the suggestion once someone types over it, so switching item or reason
   * still re-prices — but never discards what a person entered by hand.
   */
  const [amountDraft, setAmountDraft] = useState<string | null>(null);

  const meta = MOVE_REASONS[reason];
  const typed = name.trim();
  const match = findItem(items, name);
  const isNew = !match && typed.length > 0;
  const suggestions = nearMatches(items, name);

  const suggestedCents = suggestedUnitAmountCents(match, reason);
  const unitAmount =
    amountDraft ?? (suggestedCents > 0 ? (suggestedCents / 100).toFixed(2) : "");
  const unitAmountCents = parseCents(unitAmount) ?? 0;

  const quantityNumber = Number.parseInt(quantity, 10) || 0;
  const onHand = match?.onHand ?? 0;
  const reorder = match?.reorder ?? 0;
  const target = match?.target ?? 0;
  const unit = match?.unit ?? "units";
  const after = kind === "out" ? onHand - quantityNumber : onHand + quantityNumber;
  const lineTotalCents = quantityNumber * unitAmountCents;

  useEffect(() => {
    if (state.createdRef && state.sku) {
      const moved = `${quantityNumber} ${match?.unit ?? "units"}`;
      onRecorded(
        state.sku,
        kind === "out"
          ? `${moved} of ${typed} stocked out`
          : `${moved} of ${typed} stocked in`,
      );
    }
    // `onRecorded` is stable enough here; re-running on every render would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.createdRef]);


  const invalid =
    !typed ||
    quantityNumber < 1 ||
    after < 0 ||
    (isNew && kind === "out") ||
    (meta.transaction && (unitAmountCents <= 0 || !party.trim()));

  const partyOptions = [
    ...new Set(
      [...recentParties(moves, kind), match?.supplier ?? ""].filter(
        (value): value is string => Boolean(value) && value !== "Not recorded",
      ),
    ),
  ].slice(0, 3);

  const tile =
    kind === "out"
      ? { bg: "var(--status-negative-soft)", fg: "var(--status-negative)" }
      : { bg: "var(--status-positive-soft)", fg: "var(--status-positive)" };

  const matchNote = match
    ? {
        icon: "check-circle-2",
        fg: "var(--status-positive)",
        text: `Matched ${match.sku} · ${match.onHand} ${match.unit} on hand · reorder at ${match.reorder}`,
      }
    : isNew
      ? {
          icon: "sparkles",
          fg: "var(--status-warning)",
          text:
            kind === "out"
              ? "Not in inventory — pick an existing item to stock out."
              : "Not in inventory — recording this stock in creates the item automatically.",
        }
      : {
          icon: "search",
          fg: "var(--text-muted)",
          text: "Type a name or SKU. Existing items are matched as you type.",
        };

  const warning =
    isNew && kind === "in"
      ? {
          fg: "var(--text-muted)",
          text: `New item — opens at ${quantityNumber} units with a reorder point suggested from this quantity.`,
        }
      : quantityNumber < 1
        ? {
            fg: "var(--text-muted)",
            text: "Enter a quantity to preview the new level.",
          }
        : after < 0
          ? {
              fg: "var(--status-negative)",
              text: `More than the ${onHand} ${unit} on hand.`,
            }
          : after <= reorder
            ? {
                fg: "var(--status-warning)",
                text: `Lands at or below the reorder point of ${reorder}.`,
              }
            : {
                fg: "var(--text-muted)",
                text: `Reorder point ${reorder} · target ${target}.`,
              };

  const afterColor =
    after < 0
      ? "var(--status-negative)"
      : after <= reorder
        ? "var(--status-warning)"
        : "var(--status-positive)";

  const cta =
    isNew && kind === "in"
      ? "Create & record stock in"
      : kind === "out"
        ? "Record stock out"
        : "Record stock in";

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-6">
      <div
        onClick={onClose}
        className="absolute inset-0"
        style={{ background: "rgba(23,28,37,.28)" }}
      />
      <form
        action={formAction}
        className="relative flex max-h-full w-full max-w-[452px] flex-col overflow-hidden"
        style={{
          background: "var(--surface-card)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-popover)",
        }}
      >
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="reason" value={reason} />

        <div
          className="flex flex-none items-center gap-3"
          style={{
            padding: "16px 18px 14px",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <span
            style={{
              width: 34,
              height: 34,
              flex: "0 0 auto",
              borderRadius: "10px",
              background: tile.bg,
              color: tile.fg,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name={kind === "out" ? "arrow-up" : "arrow-down"} size={17} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "16px",
                fontWeight: 700,
                letterSpacing: "-.015em",
              }}
            >
              {kind === "out" ? "Record stock out" : "Record stock in"}
            </span>
            <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
              {kind === "out"
                ? "Units leaving stock — picks, transfers, write-offs."
                : "Units arriving into stock — deliveries and returns."}
            </span>
          </span>
          <IconButton icon="x" size={32} label="Close" onClick={onClose} />
        </div>

        <div
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto"
          style={{ padding: "16px 18px" }}
        >
          {state.error && (
            <div
              role="alert"
              className="flex items-start gap-2.5"
              style={{
                padding: "11px 13px",
                border: "1px solid var(--red-400)",
                background: "var(--status-negative-soft)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <span
                style={{
                  color: "var(--status-negative)",
                  flex: "0 0 auto",
                  marginTop: 1,
                }}
              >
                <Icon name="circle-alert" size={15} />
              </span>
              <span
                style={{
                  fontSize: "12px",
                  color: "var(--status-negative)",
                  textWrap: "pretty",
                  overflowWrap: "anywhere",
                }}
              >
                {state.error}
              </span>
            </div>
          )}

          <label className="flex flex-col gap-1.5">
            <FieldLabel>Item</FieldLabel>
            <input
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Type an item name or SKU"
              autoComplete="off"
              style={{
                ...INPUT,
                borderColor: match
                  ? "var(--blue-200)"
                  : isNew
                    ? "var(--amber-400)"
                    : "var(--border-default)",
              }}
            />

            {suggestions.length > 0 && (
              <div
                className="flex flex-col gap-0.5"
                style={{
                  padding: "5px",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-md)",
                  background: "var(--surface-raised)",
                  boxShadow: "var(--shadow-popover)",
                }}
              >
                <span
                  style={{
                    padding: "4px 7px 2px",
                    fontSize: "10px",
                    letterSpacing: ".1em",
                    textTransform: "uppercase",
                    color: "var(--text-muted)",
                  }}
                >
                  Did you mean
                </span>
                {suggestions.map((item) => (
                  <button
                    key={item.sku}
                    type="button"
                    onClick={() => {
                      setName(item.name);
                      setAmountDraft(null);
                    }}
                    className="flex items-center gap-2.5 text-left"
                    style={{
                      padding: "7px 8px",
                      borderRadius: "var(--radius-sm)",
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <span
                      style={{
                        width: 24,
                        height: 24,
                        flex: "0 0 auto",
                        borderRadius: "7px",
                        background: "var(--surface-inset)",
                        color: "var(--text-secondary)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon name={item.icon} size={13} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span
                        style={{
                          fontSize: "12.5px",
                          fontWeight: 600,
                          color: "var(--text-primary)",
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
                        }}
                      >
                        {item.sku} · {item.category}
                      </span>
                    </span>
                    <span
                      style={{
                        fontSize: "11.5px",
                        color: "var(--text-secondary)",
                        fontVariantNumeric: "tabular-nums",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.onHand} {item.unit}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <span
              className="flex items-center gap-2"
              style={{
                fontSize: "11.5px",
                color: matchNote.fg,
                textWrap: "pretty",
              }}
            >
              <Icon name={matchNote.icon} size={13} />
              {matchNote.text}
            </span>
          </label>

          <div className="grid grid-cols-2 gap-2.5">
            <label className="flex min-w-0 flex-col gap-1.5">
              <FieldLabel>Quantity</FieldLabel>
              <input
                name="quantity"
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                style={{ ...INPUT, fontVariantNumeric: "tabular-nums" }}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5">
              <FieldLabel>
                {kind === "out" ? "Booking / job ref" : "Delivery note"}{" "}
                <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>
                  (optional)
                </span>
              </FieldLabel>
              <input
                name="documentRef"
                value={documentRef}
                onChange={(event) => setDocumentRef(event.target.value)}
                placeholder={kind === "out" ? "BK-8245" : "DN-20418"}
                style={INPUT}
              />
            </label>
          </div>

          <div className="flex items-center gap-2">
            {MOVE_REASON_CHIPS[kind].map((chip) => {
              const active = reason === chip.reason;
              return (
                <button
                  key={chip.reason}
                  type="button"
                  onClick={() => {
                    setReason(chip.reason);
                    setAmountDraft(null);
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "7px",
                    height: 32,
                    padding: "0 13px",
                    borderRadius: "var(--radius-pill)",
                    border: `1px solid ${active ? "var(--blue-200)" : "var(--border-default)"}`,
                    background: active
                      ? "var(--accent-soft)"
                      : "var(--surface-card)",
                    color: active ? "var(--blue-600)" : "var(--text-primary)",
                    fontFamily: "var(--font-body)",
                    fontSize: "12px",
                    fontWeight: active ? 700 : 500,
                    cursor: "pointer",
                    transition: "background var(--dur-fast) var(--ease-standard)",
                  }}
                >
                  <Icon name={chip.icon} size={13} />
                  {chip.label}
                </button>
              );
            })}
          </div>

          {meta.transaction ? (
            <div
              className="flex flex-col gap-2.5"
              style={{
                padding: "12px 14px",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md)",
                background: "var(--gray-25)",
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  style={{
                    color: "var(--accent-primary)",
                    display: "inline-flex",
                  }}
                >
                  <Icon name="wallet" size={14} />
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: "11.5px",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                  }}
                >
                  {meta.moneyTitle}
                </span>
                <Badge tone="accent">{meta.ledger}</Badge>
              </div>

              <label className="flex flex-col gap-1.5">
                <FieldLabel>
                  {kind === "out" ? "Customer" : "Supplier"}
                </FieldLabel>
                <input
                  name="party"
                  value={party}
                  onChange={(event) => setParty(event.target.value)}
                  placeholder={
                    kind === "out" ? "Who it was billed to" : "Who it was bought from"
                  }
                  style={{ ...INPUT, background: "var(--surface-card)" }}
                />
                {partyOptions.length > 0 && (
                  <span className="flex flex-wrap items-center gap-1.5">
                    {partyOptions.map((option) => {
                      const active =
                        party.trim().toLowerCase() === option.toLowerCase();
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setParty(option)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            height: 24,
                            padding: "0 9px",
                            borderRadius: "var(--radius-pill)",
                            border: `1px solid ${active ? "var(--blue-200)" : "var(--border-default)"}`,
                            background: active
                              ? "var(--accent-soft)"
                              : "var(--surface-card)",
                            color: active
                              ? "var(--blue-600)"
                              : "var(--text-secondary)",
                            fontFamily: "var(--font-body)",
                            fontSize: "11px",
                            fontWeight: active ? 700 : 500,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </span>
                )}
              </label>

              <div className="grid grid-cols-2 items-end gap-2.5">
                <label className="flex min-w-0 flex-col gap-1.5">
                  <FieldLabel>{meta.priceLabel}</FieldLabel>
                  <span
                    className="flex items-center overflow-hidden"
                    style={{
                      height: 40,
                      border: "1px solid var(--border-default)",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--surface-card)",
                    }}
                  >
                    <span
                      style={{
                        padding: "0 9px",
                        height: "100%",
                        display: "inline-flex",
                        alignItems: "center",
                        fontSize: "12.5px",
                        color: "var(--text-muted)",
                        borderRight: "1px solid var(--border-subtle)",
                      }}
                    >
                      $
                    </span>
                    <input
                      name="unitAmount"
                      inputMode="decimal"
                      value={unitAmount}
                      onChange={(event) => setAmountDraft(event.target.value)}
                      placeholder="0.00"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        height: "100%",
                        padding: "0 10px",
                        border: 0,
                        background: "transparent",
                        font: "inherit",
                        fontSize: "13px",
                        fontVariantNumeric: "tabular-nums",
                        color: "var(--text-primary)",
                        outline: "none",
                      }}
                    />
                  </span>
                </label>
                <div className="flex flex-col gap-0.5 pb-0.5">
                  <span
                    style={{
                      fontSize: "10px",
                      letterSpacing: ".08em",
                      textTransform: "uppercase",
                      color: "var(--text-muted)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {meta.totalLabel}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "19px",
                      lineHeight: "23px",
                      fontWeight: 700,
                      letterSpacing: "-.02em",
                      fontVariantNumeric: "tabular-nums",
                      whiteSpace: "nowrap",
                      color:
                        meta.side === "price"
                          ? "var(--status-positive)"
                          : "var(--text-primary)",
                    }}
                  >
                    {formatMoney(lineTotalCents)}
                  </span>
                </div>
              </div>

              <span
                style={{
                  fontSize: "11px",
                  lineHeight: "16px",
                  color: "var(--text-muted)",
                  textWrap: "pretty",
                }}
              >
                {meta.note}
              </span>
            </div>
          ) : (
            <div
              className="flex items-center gap-2"
              style={{
                padding: "10px 13px",
                border: "1px dashed var(--border-default)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <span style={{ color: "var(--text-muted)", display: "inline-flex" }}>
                <Icon name="arrow-left-right" size={14} />
              </span>
              <span
                style={{
                  fontSize: "11.5px",
                  color: "var(--text-muted)",
                  textWrap: "pretty",
                }}
              >
                {meta.note}
              </span>
            </div>
          )}

          <div
            className="flex flex-col gap-2"
            style={{
              padding: "12px 14px",
              background: "var(--gray-50)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <div className="flex items-center gap-3">
              <span className="flex min-w-0 flex-col gap-px">
                <PreviewLabel>On hand now</PreviewLabel>
                <PreviewValue>{onHand}</PreviewValue>
              </span>
              <span
                style={{
                  color: "var(--text-muted)",
                  display: "inline-flex",
                  flex: "0 0 auto",
                }}
              >
                <Icon name="arrow-left-right" size={15} />
              </span>
              <span className="flex min-w-0 flex-col gap-px">
                <PreviewLabel>After</PreviewLabel>
                <PreviewValue color={afterColor}>
                  {Math.max(0, after)}
                </PreviewValue>
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  flex: "0 0 auto",
                  fontSize: "11px",
                  color: "var(--text-muted)",
                  whiteSpace: "nowrap",
                }}
              >
                {unit}
              </span>
            </div>
            <span
              style={{
                fontSize: "11.5px",
                lineHeight: "17px",
                color: warning.fg,
                textWrap: "pretty",
              }}
            >
              {warning.text}
            </span>
          </div>
        </div>

        <div
          className="flex flex-none items-center justify-end gap-2.5"
          style={{
            padding: "13px 18px",
            borderTop: "1px solid var(--border-subtle)",
            background: "var(--gray-25)",
          }}
        >
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            icon={kind === "out" ? "arrow-up" : "arrow-down"}
            disabled={invalid}
          >
            {cta}
          </Button>
        </div>
      </form>
    </div>
  );
}

const INPUT: CSSProperties = {
  width: "100%",
  minWidth: 0,
  height: 40,
  padding: "0 11px",
  font: "inherit",
  fontSize: "13px",
  color: "var(--text-primary)",
  background: "var(--surface-card)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-sm)",
  outline: "none",
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: "11px",
        fontWeight: 600,
        letterSpacing: ".02em",
        color: "var(--text-secondary)",
      }}
    >
      {children}
    </span>
  );
}

function PreviewLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: "10px",
        letterSpacing: ".08em",
        textTransform: "uppercase",
        color: "var(--text-muted)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function PreviewValue({
  children,
  color,
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <span
      style={{
        fontFamily: "var(--font-display)",
        fontSize: "18px",
        lineHeight: "22px",
        fontWeight: 700,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
        color,
      }}
    >
      {children}
    </span>
  );
}
