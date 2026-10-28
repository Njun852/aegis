"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { generateAdsInsightAction } from "@/app/actions/ai";
import { setAdEnabledAction } from "@/app/actions/ads";
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
import { ADS_SYNC_EVERY_MS, everyLabel } from "@/lib/auto-sync";
import { AD_ACCOUNT, AD_LEVELS, AD_STATES } from "@/lib/data/ads";
import { formatMoneyIn } from "@/lib/format";
import { freshnessTone, relativeAge } from "@/lib/freshness";
import { activateOnKey } from "@/lib/interaction";
import type { DayFigures } from "@/lib/meta/ranges";
import { AdDrawer } from "./ad-drawer";
import { CampaignFunnelPanel } from "./campaign-funnel";
import type {
  AdLevel,
  AdRange,
  AdRow,
  AdSource,
  AdStateFilter,
  CampaignFunnel,
  MetaAdsStatus,
} from "@/types";

/** Live figures older than this are shown as STALE rather than current. */
const ADS_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

const RANGE_OPTIONS: { key: AdRange; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last_7d", label: "Last 7 days" },
  { key: "last_30d", label: "Last 30 days" },
  { key: "maximum", label: "Maximum" },
];

/** Budget and the derived rates drop below the 1240px `wide` breakpoint. */
const GRID =
  "grid gap-3 items-center grid-cols-[34px_minmax(120px,1.6fr)_112px_96px_92px_22px] wide:grid-cols-[34px_minmax(190px,1.7fr)_118px_104px_100px_104px_104px_74px_22px]";

export interface AdsWorkspaceProps {
  rows: AdRow[];
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
  /** Spend to confirmed bookings per campaign. Null for sample data or without Bookings. */
  funnel: CampaignFunnel | null;
  /** For Today and Yesterday on a connected account: which day, and whether Meta's figures for it are here. */
  day: DayFigures | null;
  /** The same for today, whatever the range, for the "Spent today" pacing bar. */
  today: DayFigures | null;
}

export function AdsWorkspace({
  rows,
  cachedInsight,
  fallbackInsight,
  aiEnabled,
  source,
  meta,
  range,
  funnel,
  day,
  today,
}: AdsWorkspaceProps) {
  const router = useRouter();
  const toast = useToast();
  const live = source === "meta";
  const currency = live ? (meta?.currency ?? "USD") : "USD";
  const money = (cents: number, withCents = true) =>
    formatMoneyIn(cents, currency, withCents);
  const [changingRange, startRangeChange] = useTransition();
  // Meta's figures for the chosen single day are not in AEGIS. The rows still
  // list what exists, but every figure reads "—", never a zero Meta did not report.
  const missing = live ? (day?.missing ?? null) : null;
  const figure = (value: string) => (missing ? "—" : value);
  // The last sync was before today began, so its "spent today" is another day's.
  const todayUnread = live && today !== null && !today.read;
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

  const changeRange = (label: string) => {
    const next = RANGE_OPTIONS.find((option) => option.label === label)?.key;
    if (next && next !== range) startRangeChange(() => router.push(`/ads?range=${next}`));
  };

  // Says which days are now showing once the new range has arrived, and
  // plainly when Meta's figures for a chosen day are not here.
  const shownRange = useRef(range);
  useEffect(() => {
    if (shownRange.current === range) return;
    shownRange.current = range;
    const label = RANGE_OPTIONS.find((option) => option.key === range)?.label ?? range;
    toast({
      tone: missing ? "info" : "success",
      title: day ? `Showing ${label.toLowerCase()}, ${day.label}` : `Showing ${label.toLowerCase()}`,
      description: missing ?? day?.note ?? funnel?.periodLabel,
      key: "ads-range",
    });
  }, [range, day, missing, funnel, toast]);

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
  const [insightNote, setInsightNote] = useState<string | null>(null);
  // The one request for this page, kept across effect runs. React runs an
  // effect twice in development, and the second run must listen to the same
  // request rather than drop its answer or pay for a second one.
  const request = useRef<ReturnType<typeof generateAdsInsightAction> | null>(null);

  useEffect(() => {
    if (!aiEnabled || insight) return;

    let live = true;
    request.current ??= generateAdsInsightAction();

    request.current
      .then((result) => {
        if (!live) return;
        setInsight(result.text);
        // Why there is none, when there is none: over budget, timed out.
        setInsightNote(result.text ? null : (result.note ?? "No commentary was written for these figures."));
      })
      .catch(() => {
        if (!live) return;
        setInsightNote("The commentary could not be written just now.");
      });

    return () => {
      live = false;
    };
  }, [aiEnabled, insight]);

  // Waiting on the request: AI is on and neither an answer nor a reason has come back.
  const generating = aiEnabled && !insight && !insightNote;

  // Reveal a freshly generated insight; show a cached one whole, since it was
  // never "being written" in front of anyone.
  const { shown } = useTypewriter(insight, {
    animate: insight !== null && insight !== cachedInsight,
  });

  const stats = [
    {
      label: "Amount spent",
      value: figure(money(totals.spendCents, false)),
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
      value: figure(
        live && !totals.resultLabel && totals.spendCents
          ? "Mixed"
          : formatCount(totals.results),
      ),
      icon: "trending-up",
      bg: "var(--status-positive-soft)",
      fg: "var(--status-positive)",
    },
    {
      label: "Cost per result",
      value: figure(totals.costPerResultCents ? money(totals.costPerResultCents) : "—"),
      icon: "arrow-left-right",
      bg: "var(--status-warning-soft)",
      fg: "var(--status-warning)",
    },
    {
      label: "Purchase ROAS",
      value: figure(totals.roas ? `${totals.roas.toFixed(2)}x` : "—"),
      icon: "bar-chart-2",
      bg: "var(--surface-inset)",
      fg: "var(--text-secondary)",
    },
  ];

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
              disabled={!live || changingRange}
              title={
                live ? undefined : "Sample data has one fixed period. Connect a Meta ad account to choose a range."
              }
            />
            {/* A connected account syncs itself every five minutes (`AutoSync`). */}
            {!live && (
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
                  ? `Read-only copy · synced ${relativeAge(meta.lastSyncAt)} · updates every ${everyLabel(ADS_SYNC_EVERY_MS)}`
                  : "Read-only copy · not synced yet, the first sync starts in a moment"
                : `Page ${AD_ACCOUNT.page} · Instagram ${AD_ACCOUNT.instagram}`}
            </span>
          </span>
          {/* A healthy account carries no badge; only a problem earns one. */}
          {live ? (
            liveState !== "ONLINE" && (
              <Badge
                tone={liveState === "ERROR" ? "negative" : "warning"}
                icon="alert-triangle"
              >
                {liveState}
              </Badge>
            )
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
                  {todayUnread ? "—" : money(totals.spentTodayCents)}
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
                    width: `${todayUnread ? 0 : pacing}%`,
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
                {todayUnread
                  ? "Not read since today began"
                  : `${money(totals.dailyBudgetCents, false)} daily budget`}
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

        {live && day && (
          <div
            role="status"
            className="flex items-start gap-2.5"
            style={{
              padding: "10px 14px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-default)",
              background: missing ? "var(--status-warning-soft)" : "var(--surface-card)",
              fontSize: "12.5px",
              lineHeight: 1.45,
              color: "var(--text-primary)",
              textWrap: "pretty",
            }}
          >
            <span style={{ flex: "0 0 auto", marginTop: 2, display: "inline-flex" }}>
              <Icon
                name={missing ? "alert-triangle" : "calendar"}
                size={14}
                color={missing ? "var(--status-warning)" : "var(--text-secondary)"}
              />
            </span>
            <span>
              <strong>
                {range === "today" ? "Today" : "Yesterday"}, {day.label}
              </strong>
              {` · ${missing ?? day.note ?? ""}`}
              {meta?.lastSyncAt ? ` Last synced ${relativeAge(meta.lastSyncAt)}.` : ""}
            </span>
          </div>
        )}

        <InsightPanel
          body={
            shown ||
            (!live
              ? fallbackInsight
              : !aiEnabled
                ? "AI commentary is switched off on this server."
                : (insightNote ?? (generating ? "Writing commentary on these figures…" : "Commentary appears once the account has campaign figures to analyse.")))
          }
          loading={generating}
          action={live ? undefined : "Rebalance budgets"}
        />

        {funnel && <CampaignFunnelPanel funnel={funnel} currency={currency} />}

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
            className={GRID}
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
                  className={GRID}
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
                    {figure(money(row.spendCents))}
                  </span>

                  <span className="flex flex-col text-right leading-tight">
                    <span
                      style={{
                        fontSize: "12.5px",
                        fontWeight: 600,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {figure(row.results ? formatCount(row.results) : "—")}
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
                    {figure(cpr ? money(cpr) : "—")}
                  </span>

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
                    {figure(formatRoas(row.roas))}
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
                    : `Nothing synced yet. AEGIS reads this account from Meta every ${everyLabel(ADS_SYNC_EVERY_MS)}, starting in a moment.`
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
          missing={missing}
          onClose={() => setOpenId(null)}
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
