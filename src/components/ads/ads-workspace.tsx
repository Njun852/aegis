"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { generateAdsInsightAction } from "@/app/actions/ai";
import { setAdEnabledAction, syncAdsAction } from "@/app/actions/ads";
import {
  Badge,
  Button,
  Icon,
  InsightPanel,
  SearchInput,
  Select,
} from "@/components/ui";
import { useToast } from "@/components/layout/toast-provider";
import { useTypewriter } from "@/hooks/use-typewriter";
import {
  accountTotals,
  costPerResultCents,
  countByState,
  displayState,
  filterAds,
  formatCount,
  formatRoas,
  getStateStyle,
  pacingPercent,
  rowsAtLevel,
} from "@/lib/ads";
import { AD_ACCOUNT, AD_LEVELS, AD_STATES } from "@/lib/data/ads";
import { formatMoneyIn } from "@/lib/format";
import { freshnessTone, relativeAge } from "@/lib/freshness";
import { activateOnKey } from "@/lib/interaction";
import { AdDrawer } from "./ad-drawer";
import type {
  AdLevel,
  AdRange,
  AdRow,
  AdSource,
  AdStateFilter,
  MetaAdsStatus,
} from "@/types";

/** Live figures older than this are shown as STALE rather than current. */
const ADS_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

const RANGE_OPTIONS: { key: AdRange; label: string }[] = [
  { key: "last_7d", label: "Last 7 days" },
  { key: "last_30d", label: "Last 30 days" },
  { key: "maximum", label: "Maximum" },
];

/** Budget and the derived rates drop below the 1240px `wide` breakpoint. */
const GRID =
  "grid gap-3 items-center grid-cols-[34px_minmax(120px,1.6fr)_112px_96px_92px_22px] wide:grid-cols-[34px_minmax(190px,1.7fr)_118px_104px_100px_104px_104px_74px_22px]";

/** The same, with a Bookings column after cost per result. */
const GRID_WITH_BOOKINGS =
  "grid gap-3 items-center grid-cols-[34px_minmax(120px,1.6fr)_112px_96px_92px_22px] wide:grid-cols-[34px_minmax(190px,1.7fr)_118px_104px_100px_104px_104px_112px_74px_22px]";

export interface AdsWorkspaceProps {
  rows: AdRow[];
  businessName: string;
  /** Cached commentary for these figures. Present means no request is needed. */
  cachedInsight: string | null;
  /** Sample copy shown when AI is off, or while the first one is generating. */
  fallbackInsight: string;
  aiEnabled: boolean;
  /**
   * Whether these rows are a connected Meta account or the design's samples.
   * Decides the labelling, the currency, and whether anything can be switched.
   */
  source: AdSource;
  /** The connection, when there is one. Never carries the token. */
  meta: MetaAdsStatus | null;
  range: AdRange;
  /**
   * Bookings credited to each campaign over the same days as the figures, keyed
   * by campaign id. Null when bookings are not tracked here — sample data, or a
   * business without the Bookings module — which hides the booking figures.
   */
  bookingsByCampaign: Record<string, number> | null;
}

export function AdsWorkspace({
  rows,
  businessName,
  cachedInsight,
  fallbackInsight,
  aiEnabled,
  source,
  meta,
  range,
  bookingsByCampaign,
}: AdsWorkspaceProps) {
  const router = useRouter();
  const toast = useToast();
  const live = source === "meta";
  const currency = live ? (meta?.currency ?? "USD") : "USD";
  const money = (cents: number, withCents = true) =>
    formatMoneyIn(cents, currency, withCents);
  const [syncing, startSync] = useTransition();
  const showBookings = live && bookingsByCampaign !== null;
  const grid = showBookings ? GRID_WITH_BOOKINGS : GRID;
  const bookingsFor = (row: AdRow) =>
    showBookings && row.level === "campaigns" ? (bookingsByCampaign?.[row.id] ?? 0) : null;
  const [level, setLevel] = useState<AdLevel>("campaigns");
  const [state, setState] = useState<AdStateFilter>("All");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [, startToggling] = useTransition();

  /**
   * The switch has to move under the finger. `useOptimistic` shows the new
   * position immediately and reconciles when the server write comes back — a
   * round trip before the knob slides would feel broken.
   */
  const [optimisticRows, applyToggle] = useOptimistic(
    rows,
    (current: AdRow[], change: { id: string; enabled: boolean }) =>
      current.map((row) =>
        row.id === change.id ? { ...row, enabled: change.enabled } : row,
      ),
  );

  const levelRows = useMemo(
    () => rowsAtLevel(optimisticRows, level),
    [optimisticRows, level],
  );
  const visible = useMemo(
    () => filterAds(optimisticRows, { level, state, search }),
    [optimisticRows, level, state, search],
  );

  const totals = useMemo(
    () =>
      accountTotals(
        optimisticRows,
        live ? { spentTodayCents: meta?.spentTodayCents ?? null } : undefined,
      ),
    [optimisticRows, live, meta?.spentTodayCents],
  );
  const levelMeta = AD_LEVELS.find((entry) => entry.key === level) ?? AD_LEVELS[0];
  const selected = optimisticRows.find((row) => row.id === openId) ?? null;

  const toggle = (row: AdRow) => {
    // AEGIS reads a connected Meta account and never changes it. The switch is
    // disabled for these rows and the server refuses them as well.
    if (live) return;
    const next = !row.enabled;

    startToggling(async () => {
      applyToggle({ id: row.id, enabled: next });
      const result = await setAdEnabledAction(row.id, next);

      // Keyed on the row, so flipping one switch repeatedly replaces its own
      // notification instead of stacking a new one each time.
      if (result.error) {
        toast({
          tone: "error",
          title: `Could not turn ${next ? "on" : "off"} ${row.name}`,
          description: result.error,
          key: `ad-${row.id}`,
        });
      } else {
        toast({
          tone: "success",
          title: `${row.name} ${next ? "switched on" : "switched off"}`,
          description: next
            ? "Delivery resumes on Meta's next sync."
            : "It stops spending from the next sync.",
          key: `ad-${row.id}`,
        });
      }

      // Reconciles the optimistic switch — including putting it back if the
      // write failed.
      router.refresh();
    });
  };

  const sync = () => {
    startSync(async () => {
      const result = await syncAdsAction();

      if (result.retryInSeconds !== null) {
        toast({
          tone: "info",
          title: "Synced a moment ago",
          description: `Meta limits how often an account is read. Try again in ${result.retryInSeconds}s.`,
          key: "ads-sync",
        });
        return;
      }
      if (result.error) {
        toast({
          tone: "error",
          title: "Sync failed",
          description: `${result.error} The figures below are from the last successful sync.`,
          key: "ads-sync",
        });
        router.refresh();
        return;
      }

      toast({
        tone: result.truncated ? "info" : "success",
        title: `Synced ${result.rows} ${result.rows === 1 ? "row" : "rows"} from Meta`,
        description: result.truncated
          ? "The account is larger than one sync reads, so some rows may be missing."
          : "Campaigns, ad sets and ads are up to date.",
        key: "ads-sync",
      });
      router.refresh();
    });
  };

  const changeRange = (label: string) => {
    const next = RANGE_OPTIONS.find((option) => option.label === label)?.key;
    if (next && next !== range) router.push(`/ads?range=${next}`);
  };

  // Live freshness: never synced, synced but old, failing, or current.
  const tone = live ? freshnessTone(meta?.lastSyncAt ?? null, undefined, ADS_STALE_AFTER_MS) : null;
  const liveState: "ONLINE" | "STALE" | "ERROR" | "NOT SYNCED" | null = !live
    ? null
    : meta?.lastError
      ? "ERROR"
      : tone === "never"
        ? "NOT SYNCED"
        : tone === "stale"
          ? "STALE"
          : "ONLINE";

  // ---- AI commentary ------------------------------------------------------
  const [insight, setInsight] = useState<string | null>(cachedInsight);
  const [generating, setGenerating] = useState(false);
  const requested = useRef(false);

  useEffect(() => {
    if (!aiEnabled || insight || requested.current) return;

    requested.current = true;
    setGenerating(true);
    let live = true;

    generateAdsInsightAction()
      .then((result) => {
        if (live) {
          setInsight(result.text);
          setGenerating(false);
        }
      })
      .catch(() => {
        if (live) setGenerating(false);
      });

    return () => {
      live = false;
    };
  }, [aiEnabled, insight]);

  // Reveal a freshly generated insight; show a cached one whole, since it was
  // never "being written" in front of anyone.
  const { shown } = useTypewriter(insight, {
    animate: insight !== null && insight !== cachedInsight,
  });

  const stats = [
    {
      label: "Amount spent",
      value: money(totals.spendCents, false),
      icon: "wallet",
      bg: "var(--accent-soft)",
      fg: "var(--accent-primary)",
    },
    {
      label: !live
        ? "Results · mixed objectives"
        : totals.resultLabel
          ? `Results · ${totals.resultLabel}`
          : totals.spendCents
            ? "Results · mixed, see campaigns"
            : "Results",
      value:
        live && !totals.resultLabel && totals.spendCents
          ? "Mixed"
          : formatCount(totals.results),
      icon: "trending-up",
      bg: "var(--status-positive-soft)",
      fg: "var(--status-positive)",
    },
    {
      label: "Cost per result",
      value: totals.costPerResultCents ? money(totals.costPerResultCents) : "—",
      icon: "arrow-left-right",
      bg: "var(--status-warning-soft)",
      fg: "var(--status-warning)",
    },
    {
      label: "Purchase ROAS",
      value: totals.roas ? `${totals.roas.toFixed(2)}x` : "—",
      icon: "bar-chart-2",
      bg: "var(--surface-inset)",
      fg: "var(--text-secondary)",
    },
  ];

  if (showBookings) {
    const booked = rowsAtLevel(optimisticRows, "campaigns").reduce(
      (sum, row) => sum + (bookingsByCampaign?.[row.id] ?? 0),
      0,
    );
    stats.push({
      // Blended: all ad spend in the period over every booking credited to an
      // ad. Per-campaign figures are in the table.
      label: booked
        ? `Bookings · ${money(Math.round(totals.spendCents / booked))} each, blended`
        : "Bookings · none credited to an ad yet",
      value: formatCount(booked),
      icon: "calendar",
      bg: "var(--status-positive-soft)",
      fg: "var(--status-positive)",
    });
  }

  const filters: AdStateFilter[] = ["All", ...AD_STATES];
  const pacing = pacingPercent(totals);

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
              Ads
            </h2>
            <p
              style={{
                margin: "3px 0 0",
                fontSize: "12.5px",
                color: "var(--text-secondary)",
                textWrap: "pretty",
              }}
            >
              {live
                ? `${businessName} · Meta ad account ${meta?.adAccountId ?? ""} · ${currency}${meta?.timezone ? ` · ${meta.timezone}` : ""}`
                : `${businessName} · sample ad account ${AD_ACCOUNT.account} · Facebook and Instagram · attribution ${AD_ACCOUNT.attribution}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <SearchInput
              placeholder="Search campaign, ad set, audience..."
              value={search}
              onChange={setSearch}
              width={236}
            />
            <Select
              size="md"
              leadingIcon="calendar"
              options={RANGE_OPTIONS.map((option) => option.label)}
              value={
                live
                  ? RANGE_OPTIONS.find((option) => option.key === range)?.label
                  : "Sample period"
              }
              onChange={changeRange}
              disabled={!live}
              title={
                live ? undefined : "Sample data has one fixed period. Connect a Meta ad account to choose a range."
              }
            />
            {live ? (
              <Button icon="refresh-cw" disabled={syncing} onClick={sync}>
                {syncing ? "Syncing…" : "Sync now"}
              </Button>
            ) : (
              <Button icon="plus" disabled title="Campaign creation is not built yet">
                Create Campaign
              </Button>
            )}
          </div>
        </div>

        {/* Connection strip: account identity on the left, today's pace right. */}
        <div
          className="flex flex-wrap items-center gap-3.5"
          style={{
            padding: "12px 14px",
            background: "var(--surface-card)",
            border: "1px solid var(--border-default)",
            borderRadius: "14px",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <span
            style={{
              width: 34,
              height: 34,
              flex: "0 0 auto",
              borderRadius: "10px",
              background: "var(--accent-soft)",
              color: "var(--accent-primary)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="megaphone" size={17} />
          </span>
          <span className="flex min-w-0 flex-col" style={{ lineHeight: 1.3 }}>
            <span className="flex items-center gap-2">
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  letterSpacing: "-.01em",
                }}
              >
                {live ? meta?.accountName ?? "Meta ad account" : "Sample ad account"}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10.5px",
                  color: "var(--text-muted)",
                }}
              >
                {live ? meta?.adAccountId : AD_ACCOUNT.account}
              </span>
            </span>
            <span style={{ fontSize: "11.5px", color: "var(--text-secondary)" }}>
              {live
                ? meta?.lastSyncAt
                  ? `Read-only copy · synced ${relativeAge(meta.lastSyncAt)}`
                  : "Read-only copy · not synced yet — press Sync now"
                : `Page ${AD_ACCOUNT.page} · Instagram ${AD_ACCOUNT.instagram}`}
            </span>
          </span>
          {live ? (
            <Badge
              tone={
                liveState === "ERROR"
                  ? "negative"
                  : liveState === "ONLINE"
                    ? "positive"
                    : "warning"
              }
              icon={liveState === "ONLINE" ? "check" : "alert-triangle"}
            >
              {liveState === "ONLINE" ? "LIVE" : liveState}
            </Badge>
          ) : (
            <Badge tone="warning" icon="alert-triangle">
              DEMO DATA
            </Badge>
          )}
          {live && meta?.lastError && (
            <span style={{ fontSize: "11.5px", color: "var(--status-negative)", maxWidth: 360 }}>
              Last sync failed {relativeAge(meta.lastErrorAt)}: {meta.lastError}
            </span>
          )}
          {!live && (
            <span style={{ fontSize: "11.5px", color: "var(--text-secondary)", maxWidth: 360 }}>
              Sample figures from the design, not a connected account.
            </span>
          )}
          <span className="ml-auto flex items-center gap-3.5">
            <span
              className="flex flex-col gap-1.5"
              style={{ minWidth: 168 }}
            >
              <span className="flex items-baseline justify-between gap-2.5">
                <span
                  style={{ fontSize: "11.5px", color: "var(--text-secondary)" }}
                >
                  Spent today
                </span>
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {money(totals.spentTodayCents)}
                </span>
              </span>
              <span
                style={{
                  height: 5,
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
                    width: `${pacing}%`,
                    background:
                      pacing > 95
                        ? "var(--amber-400)"
                        : "var(--accent-primary)",
                    transition: "width var(--dur-slow) var(--ease-standard)",
                  }}
                />
              </span>
              <span
                style={{
                  fontSize: "10.5px",
                  color: "var(--text-muted)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {money(totals.dailyBudgetCents, false)} daily budget
              </span>
            </span>
            <Button
              variant="outline"
              size="sm"
              icon="external-link"
              disabled={!live || !meta?.adAccountId}
              title={
                live
                  ? "Open this account in Meta Ads Manager — changes are made there, not in AEGIS"
                  : "Sample data has no Meta account to open"
              }
              onClick={() => {
                const id = meta?.adAccountId?.replace(/^act_/, "");
                if (id) {
                  window.open(
                    `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${id}`,
                    "_blank",
                    "noopener,noreferrer",
                  );
                }
              }}
            >
              Ads Manager
            </Button>
          </span>
        </div>

        <div
          className={
            showBookings
              ? "grid grid-cols-2 gap-3 wide:grid-cols-5"
              : "grid grid-cols-2 gap-3 wide:grid-cols-4"
          }
        >
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
                className="flex min-w-0 flex-col"
                style={{ lineHeight: 1.2 }}
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

        <InsightPanel
          body={
            shown ||
            (!live
              ? fallbackInsight
              : aiEnabled
                ? "Commentary appears once the account has campaign figures to analyse."
                : "AI commentary is switched off on this server.")
          }
          loading={generating}
          action={live ? undefined : "Rebalance budgets"}
        />

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
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Segmented control for the three tiers. */}
            <span
              className="inline-flex items-center gap-[3px]"
              style={{
                padding: "3px",
                background: "var(--surface-inset)",
                borderRadius: "10px",
              }}
            >
              {AD_LEVELS.map((entry) => {
                const active = entry.key === level;
                return (
                  <button
                    key={entry.key}
                    type="button"
                    onClick={() => {
                      setLevel(entry.key);
                      setOpenId(null);
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      height: 28,
                      padding: "0 11px",
                      borderRadius: "8px",
                      border: "none",
                      cursor: "pointer",
                      fontFamily: "var(--font-body)",
                      fontSize: "12px",
                      fontWeight: active ? 700 : 500,
                      color: active
                        ? "var(--text-primary)"
                        : "var(--text-secondary)",
                      background: active ? "var(--gray-0)" : "transparent",
                      boxShadow: active ? "var(--shadow-card)" : "none",
                      transition:
                        "background var(--dur-fast) var(--ease-standard)",
                    }}
                  >
                    {entry.label}
                    <span
                      style={{
                        fontVariantNumeric: "tabular-nums",
                        color: "var(--text-muted)",
                      }}
                    >
                      {rowsAtLevel(optimisticRows, entry.key).length}
                    </span>
                  </button>
                );
              })}
            </span>

            <span
              style={{
                width: 1,
                height: 22,
                background: "var(--border-subtle)",
              }}
            />

            {filters.map((filter) => {
              const active = state === filter;
              const dot =
                filter === "All"
                  ? "var(--gray-400)"
                  : getStateStyle(filter).dot;
              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setState(filter)}
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
                    {countByState(levelRows, filter)}
                  </span>
                </button>
              );
            })}

            <span
              className="ml-auto"
              style={{ fontSize: "11.5px", color: "var(--text-muted)" }}
            >
              {visible.length} of {levelRows.length} shown
            </span>
          </div>

          <div
            className={grid}
            style={{
              padding: "0 10px 8px",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <ColumnLabel>On</ColumnLabel>
            <ColumnLabel>{levelMeta.column}</ColumnLabel>
            <ColumnLabel>Delivery</ColumnLabel>
            <ColumnLabel className="hidden text-right wide:block">
              Budget
            </ColumnLabel>
            <ColumnLabel className="text-right">Spent</ColumnLabel>
            <ColumnLabel className="text-right">Results</ColumnLabel>
            <ColumnLabel className="hidden text-right wide:block">
              Cost / result
            </ColumnLabel>
            {showBookings && (
              <ColumnLabel className="hidden text-right wide:block">
                Bookings
              </ColumnLabel>
            )}
            <ColumnLabel className="hidden text-right wide:block">
              ROAS
            </ColumnLabel>
            <span />
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            {visible.map((row) => {
              const status = displayState(row);
              const style = getStateStyle(status);
              const cpr = costPerResultCents(row);
              return (
                <div
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${row.name} — ${status}`}
                  onClick={() => setOpenId(row.id)}
                  onKeyDown={activateOnKey(() => setOpenId(row.id))}
                  className={grid}
                  style={{
                    padding: "10px",
                    borderRadius: "10px",
                    cursor: "pointer",
                    borderBottom: "1px solid var(--gray-50)",
                    transition:
                      "background var(--dur-fast) var(--ease-standard)",
                    background:
                      row.id === openId
                        ? "var(--surface-active)"
                        : "transparent",
                  }}
                >
                  <button
                    type="button"
                    role="switch"
                    aria-checked={row.enabled}
                    aria-label={
                      live
                        ? `${row.name} is ${row.enabled ? "on" : "off"} in Meta`
                        : row.enabled
                          ? `Turn off ${row.name}`
                          : `Turn on ${row.name}`
                    }
                    title={
                      live
                        ? "Read-only. Switch this on or off in Meta Ads Manager."
                        : row.enabled
                          ? `Turn off ${row.name}`
                          : `Turn on ${row.name}`
                    }
                    disabled={live}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggle(row);
                    }}
                    style={{
                      width: 34,
                      height: 20,
                      flex: "0 0 auto",
                      borderRadius: "var(--radius-pill)",
                      border: "none",
                      padding: 3,
                      display: "inline-flex",
                      alignItems: "center",
                      cursor: live ? "not-allowed" : "pointer",
                      opacity: live ? 0.55 : 1,
                      transition:
                        "background var(--dur-fast) var(--ease-standard)",
                      background: row.enabled
                        ? "var(--accent-primary)"
                        : "var(--border-default)",
                    }}
                  >
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: "var(--radius-pill)",
                        background: "var(--gray-0)",
                        boxShadow: "0 1px 2px rgba(23,28,37,.25)",
                        transition:
                          "transform var(--dur-normal) var(--ease-standard)",
                        transform: row.enabled
                          ? "translateX(14px)"
                          : "translateX(0)",
                      }}
                    />
                  </button>

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
                      <Icon name={levelMeta.icon} size={15} />
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
                        {row.name}
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
                        {row.id} · {row.level === "campaigns" ? row.objective : row.parent}
                      </span>
                    </span>
                  </div>

                  <span className="flex min-w-0 flex-col gap-1">
                    <span>
                      <Badge tone={style.tone}>{status}</Badge>
                    </span>
                    <span
                      style={{
                        fontSize: "10.5px",
                        color: "var(--text-muted)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {row.level === "ads" ? row.format : row.audience}
                    </span>
                  </span>

                  <span className="hidden flex-col text-right leading-tight wide:flex">
                    <span
                      style={{
                        fontSize: "12.5px",
                        fontWeight: 500,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {row.budgetType
                        ? money(row.budgetCents, false)
                        : "Inherited"}
                    </span>
                    <span
                      style={{ fontSize: "10.5px", color: "var(--text-muted)" }}
                    >
                      {row.budgetType
                        ? row.budgetType.toLowerCase()
                        : "from ad set"}
                    </span>
                  </span>

                  <span
                    style={{
                      fontSize: "12.5px",
                      fontWeight: 600,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {money(row.spendCents)}
                  </span>

                  <span className="flex flex-col text-right leading-tight">
                    <span
                      style={{
                        fontSize: "12.5px",
                        fontWeight: 600,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {row.results ? formatCount(row.results) : "—"}
                    </span>
                    <span
                      style={{
                        fontSize: "10.5px",
                        color: "var(--text-muted)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {row.resultLabel}
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
                    {cpr ? money(cpr) : "—"}
                  </span>

                  {showBookings && (
                    <BookingsCell
                      count={bookingsFor(row)}
                      spendCents={row.spendCents}
                      money={money}
                    />
                  )}

                  <span
                    className="hidden wide:block"
                    style={{
                      fontSize: "12.5px",
                      fontWeight: 700,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      color:
                        row.roas >= 4
                          ? "var(--status-positive)"
                          : row.roas > 0
                            ? "var(--text-primary)"
                            : "var(--text-muted)",
                    }}
                  >
                    {formatRoas(row.roas)}
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
                {live && levelRows.length === 0
                  ? meta?.lastSyncAt
                    ? `This ad account has no ${levelMeta.label.toLowerCase()} yet.`
                    : "Nothing synced yet. Press Sync now to read this account from Meta."
                  : "Nothing at this level matches the filter."}
              </div>
            )}
          </div>
        </section>
      </div>

      {selected && (
        <AdDrawer
          key={selected.id}
          row={selected}
          accountCostPerResultCents={totals.costPerResultCents}
          currency={currency}
          live={live}
          bookings={bookingsFor(selected)}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}

/**
 * Bookings are credited per campaign — that is what staff pick on a booking —
 * so ad sets and ads show a dash rather than a guessed split.
 */
function BookingsCell({
  count,
  spendCents,
  money,
}: {
  count: number | null;
  spendCents: number;
  money: (cents: number, withCents?: boolean) => string;
}) {
  if (count === null) {
    return (
      <span
        className="hidden wide:block"
        style={{ fontSize: "12.5px", textAlign: "right", color: "var(--text-muted)" }}
        title="Bookings are credited to campaigns"
      >
        —
      </span>
    );
  }
  return (
    <span className="hidden flex-col text-right leading-tight wide:flex">
      <span style={{ fontSize: "12.5px", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
        {count ? formatCount(count) : "—"}
      </span>
      <span style={{ fontSize: "10.5px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
        {count
          ? `${money(Math.round(spendCents / count))} each`
          : spendCents
            ? "none yet"
            : ""}
      </span>
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
