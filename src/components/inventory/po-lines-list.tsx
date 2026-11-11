"use client";

import { Badge, Icon, IconButton } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { getStatusStyle } from "@/lib/inventory";
import type { PoLine } from "@/lib/inventory";
import { activateOnKey } from "@/lib/interaction";
import type { StockMoveKind } from "@/types";

/**
 * Received, left, unit cost, value and the row's stock buttons drop below the
 * 1240px `wide` breakpoint, so a phone shows PO, item and status; tapping a
 * row opens the item, which has Stock In and Stock Out.
 */
export const PO_GRID =
  "grid gap-3 items-center grid-cols-[60px_minmax(0,1fr)_auto] wide:grid-cols-[96px_minmax(180px,1.6fr)_104px_minmax(0,1fr)_92px_96px_118px_64px]";

export interface PoLinesListProps {
  lines: PoLine[];
  openSku: string | null;
  onOpen: (sku: string) => void;
  onMove: (kind: StockMoveKind, sku: string) => void;
}

/**
 * The stock on hand split by PO, as the costing sheet reads: PO No. first,
 * one row per delivery still on the shelf. A PO's number is printed in full
 * on its first row; the rows under it repeat it quietly, so a filtered list
 * still says which PO each row belongs to.
 */
export function PoLinesList({ lines, openSku, onOpen, onMove }: PoLinesListProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {lines.map((line, index) => {
        const previous = lines[index - 1];
        const groupKey = (entry: PoLine) => `${entry.kind}:${entry.poNumber}`;
        const firstOfGroup = !previous || groupKey(previous) !== groupKey(line);
        const style = getStatusStyle(line.item.status);
        const { item } = line;
        const label =
          line.kind === "po"
            ? `PO ${line.poNumber}, ${item.name}: ${line.remaining} of ${line.quantityReceived} ${item.unit} left`
            : line.kind === "no-po"
              ? `No PO, ${item.name}: ${line.remaining} ${item.unit} left`
              : `${item.name}: nothing on hand`;
        return (
          <div
            key={line.key}
            role="button"
            tabIndex={0}
            aria-label={`${label}, ${item.status}`}
            onClick={() => onOpen(item.sku)}
            onKeyDown={activateOnKey(() => onOpen(item.sku))}
            className={PO_GRID}
            style={{
              padding: "10px",
              borderRadius: "10px",
              cursor: "pointer",
              borderTop: firstOfGroup && index > 0 ? "1px solid var(--border-subtle)" : "1px solid transparent",
              transition: "background var(--dur-fast) var(--ease-standard)",
              background: item.sku === openSku ? "var(--surface-active)" : "transparent",
            }}
          >
            <PoNumber line={line} firstOfGroup={firstOfGroup} />

            <span className="flex min-w-0 flex-col leading-tight">
              <span
                style={{ fontSize: "13px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
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
                {/* On a phone what is left comes first, so it is never the part cut off. */}
                <span className="wide:hidden">
                  {line.kind === "empty"
                    ? `0 ${item.unit}`
                    : `${line.remaining}/${line.quantityReceived} ${item.unit} · ${formatMoney(line.valueCents, false)}`}
                  {" · "}
                </span>
                {[line.supplier, line.documentRef].filter(Boolean).join(" · ")}
              </span>
            </span>

            <span
              className="hidden wide:block"
              style={{ fontSize: "12.5px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}
            >
              {line.receivedDay || "—"}
            </span>

            <span className="hidden min-w-0 flex-col gap-1.5 wide:flex">
              <span style={{ display: "flex", alignItems: "baseline", gap: "5px", fontSize: "12.5px", fontVariantNumeric: "tabular-nums" }}>
                <span style={{ fontWeight: 600 }}>{line.remaining}</span>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {line.kind === "empty" ? item.unit : `of ${line.quantityReceived} ${item.unit} left`}
                </span>
              </span>
              <span style={{ height: 4, borderRadius: "var(--radius-pill)", background: "var(--surface-inset)", overflow: "hidden" }}>
                <span
                  style={{
                    display: "block",
                    height: "100%",
                    borderRadius: "var(--radius-pill)",
                    background: style.bar,
                    width: `${line.quantityReceived > 0 ? Math.round((line.remaining / line.quantityReceived) * 100) : 0}%`,
                  }}
                />
              </span>
            </span>

            <span
              className="hidden wide:block"
              style={{ fontSize: "12.5px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)" }}
            >
              {formatMoney(line.unitCostCents)}
            </span>

            <span
              className="hidden wide:block"
              style={{ fontSize: "12.5px", fontWeight: 600, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
            >
              {formatMoney(line.valueCents, false)}
            </span>

            <span>
              <Badge tone={style.tone}>{item.status}</Badge>
            </span>

            <span className="hidden items-center justify-end gap-1 wide:inline-flex">
              <IconButton
                icon="arrow-down"
                size={28}
                label={`Stock in ${item.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onMove("in", item.sku);
                }}
              />
              <IconButton
                icon="arrow-up"
                size={28}
                label={`Stock out ${item.name}`}
                disabled={item.onHand <= 0}
                onClick={(event) => {
                  event.stopPropagation();
                  onMove("out", item.sku);
                }}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PoNumber({ line, firstOfGroup }: { line: PoLine; firstOfGroup: boolean }) {
  if (line.kind === "empty") {
    return <span style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>—</span>;
  }
  if (line.kind === "no-po") {
    return (
      <span
        className="inline-flex items-center gap-1"
        title="Stock on the shelf before PO numbers were recorded"
        style={{ fontSize: "12px", color: "var(--text-muted)", whiteSpace: "nowrap" }}
      >
        <Icon name="circle-alert" size={12} />
        No PO
      </span>
    );
  }
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: firstOfGroup ? "13px" : "12px",
        fontWeight: firstOfGroup ? 700 : 400,
        color: firstOfGroup ? "var(--text-primary)" : "var(--text-muted)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {line.poNumber}
    </span>
  );
}
