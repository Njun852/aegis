"use client";

import { Badge, Button, Icon, IconButton } from "@/components/ui";
import {
  costPerResultCents,
  displayState,
  formatCount,
  formatRoas,
  frequency,
  getStateStyle,
  placementBreakdown,
} from "@/lib/ads";
import { AD_ACCOUNT, AD_LEVELS } from "@/lib/data/ads";
import { formatMoney } from "@/lib/format";
import type { AdRow } from "@/types";

export interface AdDrawerProps {
  row: AdRow;
  /** For comparing this row's cost per result against the account average. */
  accountCostPerResultCents: number;
  onClose: () => void;
}

/** The right-hand detail panel for one campaign, ad set or ad. */
export function AdDrawer({
  row,
  accountCostPerResultCents,
  onClose,
}: AdDrawerProps) {
  const status = displayState(row);
  const style = getStateStyle(status);
  const levelMeta = AD_LEVELS.find((entry) => entry.key === row.level) ?? AD_LEVELS[0];
  const cpr = costPerResultCents(row);
  const freq = frequency(row);

  const stats = [
    {
      label: "Amount spent",
      value: formatMoney(row.spendCents),
      meta: row.budgetType
        ? `of ${formatMoney(row.budgetCents, false)} ${row.budgetType.toLowerCase()}`
        : "budget from ad set",
    },
    {
      label: "Results",
      value: row.results ? formatCount(row.results) : "—",
      meta: row.resultLabel,
    },
    {
      label: "Cost per result",
      value: cpr ? formatMoney(cpr) : "—",
      meta: accountCostPerResultCents
        ? `account avg ${formatMoney(accountCostPerResultCents)}`
        : "no account average yet",
    },
    {
      label: "ROAS",
      value: formatRoas(row.roas),
      meta: row.reach ? `${formatCount(row.reach)} reach` : "no delivery yet",
    },
  ];

  const fields = [
    { icon: "megaphone", label: "Objective", value: row.objective },
    {
      icon: "wallet",
      label: "Budget & schedule",
      value: `${row.budgetType ? `${formatMoney(row.budgetCents, false)} ${row.budgetType.toLowerCase()} · ` : ""}${row.schedule}`,
    },
    { icon: "users", label: "Audience", value: row.audience },
    { icon: "layout-dashboard", label: "Placements", value: row.placements },
    {
      icon: "sparkles",
      label: "Optimization & attribution",
      value: `${row.optimization} · ${AD_ACCOUNT.attribution}`,
    },
    { icon: "bar-chart-2", label: "Delivery", value: row.learning },
    {
      icon: "file-text",
      label: "Impressions · frequency",
      value: freq
        ? `${formatCount(row.impressions)} · ${freq}`
        : "No impressions in this range",
    },
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
          width: 404,
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
              background: "var(--accent-soft)",
              color: "var(--accent-primary)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name={levelMeta.icon} size={18} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "15.5px",
                fontWeight: 700,
                letterSpacing: "-.015em",
                textWrap: "pretty",
                overflowWrap: "anywhere",
              }}
            >
              {row.name}
            </div>
            <div className="mt-[3px] flex min-w-0 items-center gap-2">
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10.5px",
                  color: "var(--text-muted)",
                }}
              >
                {row.id}
              </span>
              <span
                style={{
                  fontSize: "11.5px",
                  color: "var(--text-secondary)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {row.level === "campaigns"
                  ? `${row.objective} campaign`
                  : row.parent}
              </span>
            </div>
          </div>
          <div className="flex flex-none items-center gap-2">
            <Badge tone={style.tone}>{status}</Badge>
            <IconButton icon="x" size={32} label="Close" onClick={onClose} />
          </div>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: "14px 16px 18px",
            display: "flex",
            flexDirection: "column",
            gap: "18px",
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            {stats.map((stat) => (
              <div
                key={stat.label}
                style={{
                  padding: "10px 12px",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "11px",
                  background: "var(--gray-25)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "2px",
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontSize: "10px",
                    letterSpacing: ".09em",
                    textTransform: "uppercase",
                    color: "var(--text-muted)",
                  }}
                >
                  {stat.label}
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
                  {stat.meta}
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-[11px]">
            <SectionLabel>Delivery</SectionLabel>
            {fields.map((field) => (
              <div
                key={field.label}
                style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}
              >
                <span
                  style={{
                    color: "var(--text-muted)",
                    flex: "0 0 auto",
                    display: "inline-flex",
                    marginTop: 2,
                  }}
                >
                  <Icon name={field.icon} size={14} />
                </span>
                <span
                  className="flex min-w-0 flex-1 flex-col gap-px"
                  style={{ lineHeight: 1.35 }}
                >
                  <span
                    style={{
                      fontSize: "10px",
                      letterSpacing: ".07em",
                      textTransform: "uppercase",
                      color: "var(--text-muted)",
                    }}
                  >
                    {field.label}
                  </span>
                  <span
                    style={{
                      fontSize: "12.5px",
                      color: "var(--text-primary)",
                      textWrap: "pretty",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {field.value}
                  </span>
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2.5">
            <SectionLabel>Placement mix</SectionLabel>
            {placementBreakdown(row).map((placement) => (
              <div
                key={placement.label}
                className="flex items-center gap-2.5"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {placement.label}
                    </span>
                    <span
                      style={{
                        fontSize: "11.5px",
                        color: "var(--text-secondary)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatMoney(placement.spendCents)}
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
                        background: placement.fill,
                        width: `${placement.share}%`,
                      }}
                    />
                  </span>
                </span>
                <span
                  style={{
                    width: 32,
                    textAlign: "right",
                    fontSize: "11px",
                    color: "var(--text-muted)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {placement.share}%
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2.5">
            <SectionLabel>Creative</SectionLabel>
            <div
              style={{
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
                background: "var(--gray-25)",
              }}
            >
              {/* No creative asset is fetched yet — the format stands in for it. */}
              <div
                style={{
                  height: 128,
                  background: "var(--surface-inset)",
                  color: "var(--text-muted)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  fontSize: "11.5px",
                }}
              >
                <Icon name="image" size={17} />
                {row.format}
              </div>
              <div className="flex flex-col gap-2" style={{ padding: "11px 12px" }}>
                <span
                  style={{
                    fontSize: "12px",
                    color: "var(--text-primary)",
                    textWrap: "pretty",
                    overflowWrap: "anywhere",
                  }}
                >
                  {row.primary}
                </span>
                <span className="flex items-center justify-between gap-2.5">
                  <span
                    style={{
                      fontSize: "12.5px",
                      fontWeight: 700,
                      letterSpacing: "-.01em",
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.headline}
                  </span>
                  <span
                    style={{
                      flex: "0 0 auto",
                      display: "inline-flex",
                      alignItems: "center",
                      height: 24,
                      padding: "0 10px",
                      borderRadius: "6px",
                      background: "var(--accent-soft)",
                      color: "var(--blue-600)",
                      fontSize: "11px",
                      fontWeight: 700,
                    }}
                  >
                    {row.cta}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Editing budgets and duplicating are not built; the design puts the
            affordances here, so they stay visible and plainly inert. */}
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
          <Button icon="wallet" disabled title="Budget editing is not built yet">
            Edit budget
          </Button>
          <Button
            variant="outline"
            icon="copy"
            disabled
            title="Duplicating is not built yet"
          >
            Duplicate
          </Button>
          <IconButton
            icon="external-link"
            size={36}
            label="Open in Meta Ads Manager — not available yet"
            title="Opening Meta Ads Manager is not wired up yet"
            disabled
            style={{ opacity: 0.45, cursor: "not-allowed" }}
          />
        </div>
      </aside>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
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
