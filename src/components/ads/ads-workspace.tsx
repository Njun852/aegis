"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { generateAdsDailyReportAction, generateAdsInsightAction } from "@/app/actions/ai";
import { setAdEnabledAction } from "@/app/actions/ads";
import { dailyReportFootnote, type DailyReportView } from "@/lib/daily-report";
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
import type { DayFigures } from "@/lib/meta/ranges";
import { AdDrawer } from "./ad-drawer";
import { CampaignBookingsModal, FunnelSignals } from "./campaign-funnel";
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

export interface AdsWorkspaceProps {
  rows: AdRow[];
  /** Cached commentary for these figures. Present means no request is needed. */
  cachedInsight: string | null;
  /** The latest daily report written today, if anyone has opened it today. */
  cachedDaily: DailyReportView | null;
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
  cachedDaily,
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
  // The campaign whose confirmed bookings are listed in the modal.
  const [bookingsFor, setBookingsFor] = useState<string | null>(null);
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
  // The account's period commentary, or the daily report on today so far. The
  // latest daily one shows at once; the server is asked once per visit whether
  // it is due a refresh, which happens at most hourly and only when the
  // figures have moved.
  // The daily report opens first when there is a live account to report on;
  // the 30-day commentary is only requested once someone opens it.
  const [insightView, setInsightView] = useState<"period" | "daily">(live ? "daily" : "period");
  const [daily, setDaily] = useState<DailyReportView | null>(cachedDaily);
  // Each refresh of the page brings the report back with the latest synced
  // figures in its slots; take it, unless a newer report is already showing.
  const [seenDaily, setSeenDaily] = useState(cachedDaily);
  if (cachedDaily !== seenDaily) {
    setSeenDaily(cachedDaily);
    if (cachedDaily && (!daily || cachedDaily.at >= daily.at)) setDaily(cachedDaily);
  }
  const [dailyNote, setDailyNote] = useState<string | null>(null);
  const [dailyChecked, setDailyChecked] = useState(false);
  const dailyRequest = useRef<ReturnType<typeof generateAdsDailyReportAction> | null>(null);
  const [insight, setInsight] = useState<string | null>(cachedInsight);
  const [insightNote, setInsightNote] = useState<string | null>(null);
  // The one request for this page, kept across effect runs. React runs an
  // effect twice in development, and the second run must listen to the same
  // request rather than drop its answer or pay for a second one.
  const request = useRef<ReturnType<typeof generateAdsInsightAction> | null>(null);

  useEffect(() => {
    if (insightView !== "period" || !aiEnabled || insight) return;

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
  }, [aiEnabled, insight, insightView]);

  useEffect(() => {
    if (insightView !== "daily" || !aiEnabled || dailyChecked) return;

    let live = true;
    dailyRequest.current ??= generateAdsDailyReportAction();
    dailyRequest.current
      .then((result) => {
        if (!live) return;
        setDailyChecked(true);
        if (result.text && result.at) setDaily({ text: result.text, at: result.at });
        else setDailyNote(result.note ?? "No daily report was written.");
      })
      .catch(() => {
        if (!live) return;
        setDailyChecked(true);
        setDailyNote("The daily report could not be written just now.");
      });

    return () => {
      live = false;
    };
  }, [aiEnabled, dailyChecked, insightView]);

  // Waiting on the request: AI is on and neither an answer nor a reason has come back.
  const generating =
    aiEnabled && (insightView === "period" ? !insight && !insightNote : !daily && !dailyNote);

  // Reveal a freshly generated insight; show a cached one whole, since it was
  // never "being written" in front of anyone.
  const shownText = insightView === "period" ? insight : (daily?.text ?? null);
  const { shown } = useTypewriter(shownText, {
    animate: shownText !== null && shownText !== (insightView === "period" ? cachedInsight : cachedDaily?.text),
  });


  const filters: AdStateFilter[] = ["All", ...AD_STATES];
  const pacing = pacingPercent(totals);
  const rangeLabel = RANGE_OPTIONS.find((option) => option.key === range)?.label ?? range;
  const periodText = !live
    ? "Sample period"
    : day
      ? `${rangeLabel}, ${day.label}`
      : funnel?.periodLabel
        ? `${rangeLabel} · ${funnel.periodLabel}`
        : rangeLabel;

  // The bookings funnel joins the campaign rows: one table, not two. Ad sets
  // and ads have no bookings of their own, so the columns only show for campaigns.
  const funnelById = new Map((funnel?.rows ?? []).map((row) => [row.campaignId, row]));
  const bookingCols = funnel !== null && level === "campaigns";
  const bookingsRow = bookingsFor ? (funnel?.rows.find((row) => row.campaignId === bookingsFor) ?? null) : null;
  const orNone = (cents: number | null) => (cents === null ? "—" : money(cents));

  // Which columns give way first as the table narrows. With bookings on the
  // row they outrank Meta's own derived rates.
  const cols = bookingCols
    ? {
        budget: "hidden @5xl:table-cell",
        results: "hidden @lg:table-cell",
        cpr: "hidden @4xl:table-cell",
        cpb: "hidden @xl:table-cell",
        roas: "hidden @6xl:table-cell",
      }
    : {
        budget: "hidden @3xl:table-cell",
        results: "",
        cpr: "hidden @xl:table-cell",
        cpb: "",
        roas: "hidden @2xl:table-cell",
      };

  const resultsValue = figure(
    live && !totals.resultLabel && totals.spendCents ? "Mixed" : formatCount(totals.results),
  );
  const metrics: Metric[] = [
    {
      label: "Amount spent",
      help: "What Meta charged for these campaigns over the period shown.",
      // With centavos, so it reads the same as the AI insight and the bookings columns.
      value: figure(money(totals.spendCents)),
    },
    {
      label: "Results",
      help: "What the campaigns are optimised for, as Meta counts it. Totalled only when every campaign counts the same kind of result.",
      value: resultsValue,
      note: !live
        ? "Mixed objectives"
        : (totals.resultLabel ?? (totals.spendCents ? "Mixed objectives, see campaigns" : undefined)),
    },
    {
      label: "Cost per result",
      help: "Amount spent divided by results.",
      value: figure(totals.costPerResultCents ? money(totals.costPerResultCents) : "—"),
    },
    {
      label: "Purchase ROAS",
      help: "Purchase value Meta attributes to the ads, divided by amount spent and weighted by spend.",
      value: figure(totals.roas ? `${totals.roas.toFixed(2)}x` : "—"),
    },
  ];
  if (funnel) {
    metrics.push(
      {
        label: "Confirmed bookings",
        help: "Bookings staff confirmed that came from these campaigns' ads, made over the same days. Cancelled ones drop out.",
        value: String(funnel.totals.confirmedBookings),
        note:
          funnel.totals.conversionPercent === null
            ? "AEGIS's own records"
            : `${funnel.totals.conversionPercent}% of conversations`,
      },
      {
        label: "Cost per booking",
        help: "Amount spent divided by confirmed bookings, over the same days.",
        value: funnel.missingFigures ? "—" : orNone(funnel.totals.costPerBookingCents),
      },
    );
  } else {
    metrics.push({
      label: "Daily budget",
      help: "Daily budgets of the campaigns and ad sets that are switched on.",
      value: money(totals.dailyBudgetCents, false),
    });
  }
  metrics.push({
    label: "Spent today",
    help: live
      ? "Today's spend as Meta reported it at the last sync, against the daily budget."
      : "A fixed share of the daily budget, for the sample account.",
    value: todayUnread ? "—" : money(totals.spentTodayCents),
    pacing: todayUnread ? undefined : pacing,
    note: todayUnread ? "Not read since today began" : `${pacing}% of the daily budget`,
  });
  const secondRow = metrics.length - 4;

  const stateOptions = filters.map((filter) => ({
    filter,
    label: `${filter === "All" ? "All statuses" : filter} · ${countByState(levelRows, filter)}`,
  }));

  const openAdsManager = () => {
    const id = meta?.adAccountId?.replace(/^act_/, "");
    if (id) {
      window.open(
        `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${id}`,
        "_blank",
        "noopener,noreferrer",
      );
    }
  };
  const canOpenAdsManager = live && Boolean(meta?.adAccountId);


  return (
    <>
      <div className="flex flex-col gap-3">
        {/* Report header: who the account is, the period, and where to change things. */}
        <section
          style={{
            background: "var(--surface-card)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-lg)",
            padding: "14px 18px",
          }}
        >
          <div className="flex flex-wrap items-start gap-4">
            <span
              aria-hidden
              style={{
                width: 44,
                height: 44,
                flex: "0 0 auto",
                borderRadius: "12px",
                background: "var(--accent-soft)",
                color: "var(--accent-primary)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="megaphone" size={20} />
            </span>

            <div className="@container flex min-w-0 flex-1 flex-col gap-1" style={{ flexBasis: 320 }}>
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  style={{
                    margin: 0,
                    fontFamily: "var(--font-display)",
                    fontSize: "20px",
                    lineHeight: "26px",
                    fontWeight: 700,
                    letterSpacing: "-.02em",
                  }}
                >
                  {live ? (meta?.accountName ?? "Meta ad account") : "Sample ad account"}
                </h2>
                {/* A healthy account carries no badge; only a problem earns one. */}
                {live ? (
                  liveState !== "ONLINE" && (
                    <Badge tone={liveState === "ERROR" ? "negative" : "warning"} icon="alert-triangle">
                      {liveState}
                    </Badge>
                  )
                ) : (
                  <Badge tone="warning" icon="alert-triangle">
                    DEMO DATA
                  </Badge>
                )}
              </div>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px" }}>
                  {live ? meta?.adAccountId : AD_ACCOUNT.account}
                </span>
                {" · "}
                {live
                  ? meta?.lastSyncAt
                    ? `Read-only copy, synced ${relativeAge(meta.lastSyncAt)}`
                    : "Read-only copy, not synced yet. The first sync starts in a moment"
                  : "Sample figures from the design, not a connected account"}
              </span>

              <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 @xl:grid-cols-4">
                {(live
                  ? [
                      {
                        label: "Period",
                        value: periodText,
                        help: day
                          ? `${day.note ?? ""}${meta?.lastSyncAt ? ` Last synced ${relativeAge(meta.lastSyncAt)}.` : ""}`.trim() || undefined
                          : undefined,
                      },
                      { label: "Facebook Page", value: meta?.pageName ?? "Not connected" },
                      { label: "Currency", value: meta?.timezone ? `${currency} · ${meta.timezone}` : currency },
                      { label: "Updates", value: `Every ${everyLabel(ADS_SYNC_EVERY_MS)}` },
                    ]
                  : [
                      { label: "Period", value: periodText },
                      { label: "Facebook Page", value: AD_ACCOUNT.page },
                      { label: "Instagram", value: AD_ACCOUNT.instagram },
                      { label: "Attribution", value: AD_ACCOUNT.attribution },
                    ]
                ).map((field: { label: string; value: string; help?: string }) => (
                  <span key={field.label} className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex items-center gap-1" style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                      {field.label}
                      {field.help && <Help text={field.help} />}
                    </span>
                    <span
                      title={field.value}
                      style={{
                        fontSize: "13px",
                        color: "var(--text-primary)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {field.value}
                    </span>
                  </span>
                ))}
              </div>

              {live && meta?.lastError && (
                <span style={{ marginTop: 6, fontSize: "12px", color: "var(--status-negative)" }}>
                  Last sync failed {relativeAge(meta.lastErrorAt)}: {meta.lastError}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Select
                size="md"
                leadingIcon="calendar"
                options={RANGE_OPTIONS.map((option) => option.label)}
                value={live ? rangeLabel : "Sample period"}
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
              <button
                type="button"
                onClick={openAdsManager}
                disabled={!canOpenAdsManager}
                title={
                  live
                    ? "Open this account in Meta Ads Manager. Changes are made there, not in AEGIS"
                    : "Sample data has no Meta account to open"
                }
                className="inline-flex items-center gap-1.5"
                style={{
                  border: "none",
                  background: "none",
                  padding: "6px 2px",
                  cursor: canOpenAdsManager ? "pointer" : "not-allowed",
                  fontFamily: "var(--font-body)",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: canOpenAdsManager ? "var(--text-accent)" : "var(--text-muted)",
                }}
              >
                <Icon name="external-link" size={14} />
                Ads Manager
              </button>
            </div>
          </div>
        </section>

        {live && day && missing && (
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

        <div
          className="grid items-start gap-3 side:grid-cols-[minmax(0,1fr)_300px] side:grid-rows-[auto_1fr]"
        >
          {/* Performance: the account's figures in one card, row over row. */}
          <section className="flex min-w-0 flex-col gap-2 side:col-start-1 side:row-start-1">
            <SectionTitle title="Performance" note={periodText} />
            <div
              className="@container"
              style={{
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-lg)",
                overflow: "hidden",
                background: "var(--border-subtle)",
              }}
            >
              <div className="grid grid-cols-2 gap-px @xl:grid-cols-12">
                {metrics.map((metric, index) => {
                  const lastOdd = index === metrics.length - 1 && metrics.length % 2 === 1;
                  const span =
                    index < 4
                      ? "@xl:col-span-3"
                      : secondRow === 3
                        ? "@xl:col-span-4"
                        : "@xl:col-span-6";
                  return (
                    <div
                      key={metric.label}
                      className={`${lastOdd ? "col-span-2 " : ""}${span}`}
                      style={{
                        background: "var(--surface-card)",
                        padding: "11px 16px",
                        minWidth: 0,
                        display: "flex",
                        flexDirection: "column",
                        gap: 3,
                      }}
                    >
                      <span
                        className="flex items-center gap-1.5"
                        style={{ fontSize: "12.5px", color: "var(--text-secondary)" }}
                      >
                        {metric.label}
                        <Help text={metric.help} />
                      </span>
                      <span
                        style={{
                          fontFamily: "var(--font-display)",
                          fontSize: "20px",
                          lineHeight: "26px",
                          fontWeight: 700,
                          letterSpacing: "-.02em",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {metric.value}
                      </span>
                      {metric.pacing !== undefined && (
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
                              width: `${metric.pacing}%`,
                              background: metric.pacing > 95 ? "var(--amber-400)" : "var(--accent-primary)",
                              transition: "width var(--dur-slow) var(--ease-standard)",
                            }}
                          />
                        </span>
                      )}
                      {metric.note && (
                        <span
                          style={{
                            fontSize: "11.5px",
                            color: "var(--text-muted)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {metric.note}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* The AI insight sits beside the report on a wide screen, and
              between the figures and the breakdown below that. */}
          <aside
            className="flex min-w-0 flex-col gap-3 side:sticky side:top-4 side:col-start-2 side:row-span-2 side:row-start-1 side:max-h-[calc(100dvh-var(--topbar-height)-32px)]"
          >
            <InsightPanel
              // The daily report is about a real day, so it is offered only for a connected account.
              views={
                live
                  ? {
                      options: [
                        { id: "period", label: "Last 30 days" },
                        { id: "daily", label: "Daily report" },
                      ],
                      value: insightView,
                      onChange: (next) => setInsightView(next === "daily" ? "daily" : "period"),
                    }
                  : undefined
              }
              body={
                shown ||
                (!live
                  ? fallbackInsight
                  : !aiEnabled
                    ? "AI commentary is switched off on this server."
                    : insightView === "daily"
                      ? (dailyNote ?? "Writing today's report…")
                      : (insightNote ?? (generating ? "Writing commentary on these figures…" : "Commentary appears once the account has campaign figures to analyse.")))
              }
              loading={generating}
              footnote={insightView === "daily" && daily && shown ? dailyReportFootnote(daily.at, { liveFigures: true }) : undefined}
              action={live ? undefined : "Rebalance budgets"}
              fill
              style={{ flex: "0 1 auto", minHeight: 0, padding: "16px" }}
            />
            {funnel && <FunnelSignals funnel={funnel} onOpen={setBookingsFor} />}
          </aside>

          {/* Breakdown: campaigns, ad sets and ads in one table. */}
          <section className="flex min-w-0 flex-col gap-2 side:col-start-1 side:row-start-2">
            <div
              className="flex flex-wrap items-center gap-x-6 gap-y-2"
              style={{ borderBottom: "1px solid var(--border-default)" }}
            >
              <div role="tablist" aria-label="Level" className="flex items-end gap-6">
                {AD_LEVELS.map((entry) => {
                  const active = entry.key === level;
                  return (
                    <button
                      key={entry.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => {
                        setLevel(entry.key);
                        setOpenId(null);
                      }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "7px",
                        padding: "9px 0 10px",
                        marginBottom: -1,
                        border: "none",
                        borderBottom: `2px solid ${active ? "var(--accent-primary)" : "transparent"}`,
                        background: "none",
                        cursor: "pointer",
                        fontFamily: "var(--font-body)",
                        fontSize: "13.5px",
                        fontWeight: active ? 700 : 600,
                        color: active ? "var(--text-accent)" : "var(--text-secondary)",
                        transition: "color var(--dur-fast) var(--ease-standard)",
                      }}
                    >
                      {entry.label}
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          padding: "1px 7px",
                          borderRadius: "var(--radius-pill)",
                          fontVariantNumeric: "tabular-nums",
                          background: active ? "var(--accent-soft)" : "var(--surface-inset)",
                          color: active ? "var(--text-accent)" : "var(--text-muted)",
                        }}
                      >
                        {rowsAtLevel(optimisticRows, entry.key).length}
                      </span>
                    </button>
                  );
                })}
              </div>
              <span className="ml-auto flex flex-wrap items-center gap-2" style={{ paddingBottom: 6 }}>
                {(search || state !== "All") && (
                  <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                    {visible.length} of {levelRows.length} shown
                  </span>
                )}
                <SearchInput
                  placeholder="Search campaign, ad set, audience..."
                  value={search}
                  onChange={setSearch}
                  width={180}
                />
                <Select
                  size="sm"
                  leadingIcon="sliders-horizontal"
                  options={stateOptions.map((option) => option.label)}
                  value={stateOptions.find((option) => option.filter === state)?.label}
                  onChange={(label) => {
                    const next = stateOptions.find((option) => option.label === label)?.filter;
                    if (next) setState(next);
                  }}
                />
              </span>
            </div>

            <div
              className="@container flex min-h-0 flex-col"
              style={{
                background: "var(--surface-card)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-lg)",
                overflow: "hidden",
                minWidth: 0,
              }}
            >
              <div style={{ overflow: "auto", flex: "1 1 auto", minHeight: 0 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <Th className="hidden @md:table-cell" style={{ width: 62, paddingLeft: 16 }}>On</Th>
                      <Th>{levelMeta.column} name</Th>
                      <Th right className={cols.budget}>Budget</Th>
                      <Th right>Spent</Th>
                      <Th right className={cols.results}>Results</Th>
                      <Th right className={cols.cpr}>Cost / result</Th>
                      {bookingCols && (
                        <Th right>
                          <span className="inline-flex items-center gap-1">
                            Bookings
                            <Help text="Confirmed bookings from AEGIS, not Meta. They count once staff confirm them and are dated the day each was made; cancelled ones drop out. Click a number to see the bookings behind it." />
                          </span>
                        </Th>
                      )}
                      {bookingCols && <Th right className={cols.cpb}>Cost / booking</Th>}
                      <Th right className={cols.roas}>ROAS</Th>
                      <Th className="hidden @md:table-cell" style={{ width: 36, paddingRight: 16 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((row) => {
                      const status = displayState(row);
                      const cpr = costPerResultCents(row);
                      const booked = bookingCols ? funnelById.get(row.id) : undefined;
                      return (
                        <tr
                          key={row.id}
                          onClick={() => setOpenId(row.id)}
                          className="hover:bg-[var(--surface-hover)]"
                          style={{
                            cursor: "pointer",
                            transition: "background var(--dur-fast) var(--ease-standard)",
                            background: row.id === openId ? "var(--surface-active)" : undefined,
                          }}
                        >
                          <Td className="hidden @md:table-cell" style={{ paddingLeft: 16 }}>
                            <RowSwitch row={row} live={live} onToggle={() => toggle(row)} />
                          </Td>

                          <Td style={{ maxWidth: 0, width: "100%", minWidth: 140, whiteSpace: "normal" }}>
                            <span className="flex min-w-0 flex-col gap-1">
                              {/* Two lines before it clips: real campaign names run long. */}
                              <button
                                type="button"
                                title={row.name}
                                aria-label={`${row.name}, ${status}. Open details`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setOpenId(row.id);
                                }}
                                style={{
                                  ...LINK,
                                  display: "-webkit-box",
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: "vertical",
                                  maxWidth: "100%",
                                  textAlign: "left",
                                  fontWeight: 600,
                                  lineHeight: "18px",
                                  overflow: "hidden",
                                  overflowWrap: "anywhere",
                                }}
                              >
                                {row.name}
                              </button>
                              <span
                                className="flex min-w-0 items-center gap-1.5"
                                style={{ fontSize: "11.5px", color: "var(--text-muted)" }}
                              >
                                <span
                                  aria-hidden
                                  style={{
                                    width: 6,
                                    height: 6,
                                    flex: "0 0 auto",
                                    borderRadius: "var(--radius-pill)",
                                    background: getStateStyle(status).dot,
                                  }}
                                />
                                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {status} · {row.level === "campaigns" ? row.objective : row.parent}
                                  {row.level === "ads" && row.format ? ` · ${row.format}` : ""}
                                </span>
                              </span>
                            </span>
                          </Td>

                          <Td right className={cols.budget}>
                            <Stack
                              value={row.budgetType ? money(row.budgetCents, false) : "Inherited"}
                              sub={row.budgetType ? row.budgetType.toLowerCase() : row.level === "adsets" ? "from campaign" : "from ad set"}
                            />
                          </Td>
                          <Td right strong>{figure(money(row.spendCents))}</Td>
                          <Td right className={cols.results}>
                            <Stack
                              value={figure(row.results ? formatCount(row.results) : "—")}
                              sub={row.results ? row.resultLabel : undefined}
                            />
                          </Td>
                          <Td right className={cols.cpr} muted>
                            {figure(cpr ? money(cpr) : "—")}
                          </Td>
                          {bookingCols && (
                            <Td right>
                              {booked ? (
                                <span className="flex flex-col items-end gap-0.5">
                                  <button
                                    type="button"
                                    title="See the bookings behind this number"
                                    aria-label={`${booked.confirmedBookings} confirmed ${booked.confirmedBookings === 1 ? "booking" : "bookings"} from ${row.name}. See them`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setBookingsFor(row.id);
                                    }}
                                    style={{ ...LINK, fontWeight: 700 }}
                                  >
                                    {booked.confirmedBookings}
                                  </button>
                                  {booked.conversionPercent !== null && (
                                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                                      {booked.conversionPercent}% of chats
                                    </span>
                                  )}
                                </span>
                              ) : (
                                "—"
                              )}
                            </Td>
                          )}
                          {bookingCols && (
                            <Td right strong className={cols.cpb}>
                              {booked ? orNone(booked.costPerBookingCents) : "—"}
                            </Td>
                          )}
                          <Td
                            right
                            className={cols.roas}
                            style={{
                              fontWeight: 700,
                              color:
                                row.roas >= 4
                                  ? "var(--status-positive)"
                                  : row.roas > 0
                                    ? "var(--text-primary)"
                                    : "var(--text-muted)",
                            }}
                          >
                            {figure(formatRoas(row.roas))}
                          </Td>
                          <Td right className="hidden @md:table-cell" style={{ color: "var(--text-muted)", paddingLeft: 0, paddingRight: 16 }}>
                            <span style={{ display: "inline-flex" }}>
                              <Icon name="chevron-right" size={15} />
                            </span>
                          </Td>
                        </tr>
                      );
                    })}

                    {visible.length === 0 && (
                      <tr>
                        <td
                          colSpan={10}
                          style={{
                            padding: "32px 16px",
                            textAlign: "center",
                            fontSize: "12.5px",
                            color: "var(--text-muted)",
                            borderTop: "1px solid var(--border-subtle)",
                          }}
                        >
                          {live && levelRows.length === 0
                            ? meta?.lastSyncAt
                              ? `This ad account has no ${levelMeta.label.toLowerCase()} yet.`
                              : `Nothing synced yet. AEGIS reads this account from Meta every ${everyLabel(ADS_SYNC_EVERY_MS)}, starting in a moment.`
                            : "Nothing at this level matches the filter."}
                        </td>
                      </tr>
                    )}
                  </tbody>

                  {bookingCols && funnel && levelRows.length > 0 && (
                    <tfoot>
                      <tr>
                        <Td foot className="hidden @md:table-cell" />
                        <Td foot strong>
                          <span className="inline-flex items-center gap-1">
                            All campaigns
                            {funnel.uncreditedConfirmed > 0 && (
                              <Help
                                text={`${funnel.uncreditedConfirmed} confirmed ${funnel.uncreditedConfirmed === 1 ? "booking" : "bookings"} in this period came from no ad (walk-ins, calls, organic chats) and ${funnel.uncreditedConfirmed === 1 ? "is" : "are"} not counted against any campaign.`}
                              />
                            )}
                          </span>
                        </Td>
                        <Td foot right className={cols.budget} muted>
                          {money(totals.dailyBudgetCents, false)}
                        </Td>
                        <Td foot right strong>
                          {funnel.missingFigures ? "—" : money(funnel.totals.spendCents)}
                        </Td>
                        <Td foot right strong className={cols.results}>
                          {resultsValue}
                        </Td>
                        <Td foot right className={cols.cpr} muted>
                          {figure(totals.costPerResultCents ? money(totals.costPerResultCents) : "—")}
                        </Td>
                        <Td foot right strong>{funnel.totals.confirmedBookings}</Td>
                        <Td foot right strong className={cols.cpb}>
                          {orNone(funnel.totals.costPerBookingCents)}
                        </Td>
                        <Td foot right strong className={cols.roas}>
                          {figure(totals.roas ? `${totals.roas.toFixed(1)}x` : "—")}
                        </Td>
                        <Td foot className="hidden @md:table-cell" />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {bookingCols && funnel?.missingFigures && (
              <span style={{ flex: "none", fontSize: "11.5px", color: "var(--text-muted)", padding: "0 2px", textWrap: "pretty" }}>
                Spend for this day is not in AEGIS yet, so cost per booking reads —; the confirmed bookings are
                AEGIS&apos;s own and complete.
              </span>
            )}
          </section>
        </div>
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

      {bookingsRow && funnel && (
        <CampaignBookingsModal
          row={bookingsRow}
          funnel={funnel}
          money={orNone}
          onClose={() => setBookingsFor(null)}
        />
      )}
    </>
  );
}

interface Metric {
  label: string;
  /** What the figure is, shown on the help mark beside the label. */
  help: string;
  value: string;
  note?: string;
  /** 0–100, drawn as a bar under the value. */
  pacing?: number;
}

/** Underlined text that acts as a link, as the report's names and counts do. */
const LINK: React.CSSProperties = {
  border: "none",
  background: "none",
  padding: 0,
  cursor: "pointer",
  fontFamily: "var(--font-body)",
  fontSize: "13px",
  color: "var(--text-primary)",
  textDecoration: "underline",
  textDecorationColor: "var(--border-strong)",
  textUnderlineOffset: "3px",
};

function SectionTitle({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2" style={{ minHeight: 24 }}>
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <h3
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontSize: "16px",
            fontWeight: 700,
            letterSpacing: "-.01em",
          }}
        >
          {title}
        </h3>
        {note && <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{note}</span>}
      </span>
      {children}
    </div>
  );
}

function Help({ text }: { text: string }) {
  return (
    <span
      role="img"
      aria-label={text}
      title={text}
      style={{ display: "inline-flex", color: "var(--text-muted)", cursor: "help" }}
    >
      <Icon name="help-circle" size={13} />
    </span>
  );
}

function Th({
  children,
  right,
  className,
  style,
}: {
  children?: React.ReactNode;
  right?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <th
      className={className}
      style={{
        paddingTop: 12,
        paddingBottom: 12,
        paddingLeft: 12,
        paddingRight: 12,
        textAlign: right ? "right" : "left",
        fontSize: "12.5px",
        fontWeight: 500,
        color: "var(--text-secondary)",
        whiteSpace: "nowrap",
        position: "sticky",
        top: 0,
        zIndex: 1,
        background: "var(--surface-card)",
        boxShadow: "inset 0 -1px 0 var(--border-default)",
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  right,
  strong,
  muted,
  foot,
  className,
  style,
}: {
  children?: React.ReactNode;
  right?: boolean;
  strong?: boolean;
  muted?: boolean;
  /** A totals cell: held at the bottom while the rows scroll under it. */
  foot?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <td
      className={className}
      style={{
        paddingTop: 11,
        paddingBottom: 11,
        paddingLeft: 12,
        paddingRight: 12,
        textAlign: right ? "right" : "left",
        verticalAlign: "middle",
        fontSize: "13px",
        fontWeight: strong ? 700 : 500,
        color: muted ? "var(--text-secondary)" : "var(--text-primary)",
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
        borderTop: foot ? "none" : "1px solid var(--border-subtle)",
        ...(foot
          ? {
              position: "sticky",
              bottom: 0,
              zIndex: 1,
              background: "var(--surface-inset)",
              boxShadow: "inset 0 1px 0 var(--border-default)",
            }
          : null),
        ...style,
      }}
    >
      {children}
    </td>
  );
}

/** A figure with a muted line under it: a budget and its type, results and what they count. */
function Stack({ value, sub }: { value: string; sub?: string }) {
  return (
    <span className="flex flex-col items-end gap-0.5">
      <span>{value}</span>
      {sub && (
        <span
          style={{
            maxWidth: 140,
            fontSize: "11px",
            fontWeight: 400,
            color: "var(--text-muted)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {sub}
        </span>
      )}
    </span>
  );
}

/**
 * The row's own on/off switch. A connected Meta account is read-only here, so
 * the switch only shows its state; sample rows can be flipped.
 */
function RowSwitch({ row, live, onToggle }: { row: AdRow; live: boolean; onToggle: () => void }) {
  const label = live
    ? `${row.name} is ${row.enabled ? "on" : "off"} in Meta`
    : row.enabled
      ? `Turn off ${row.name}`
      : `Turn on ${row.name}`;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={row.enabled}
      aria-label={label}
      title={live ? "Read-only. Switch this on or off in Meta Ads Manager." : label}
      disabled={live}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
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
        verticalAlign: "middle",
        cursor: live ? "not-allowed" : "pointer",
        opacity: live ? 0.55 : 1,
        transition: "background var(--dur-fast) var(--ease-standard)",
        background: row.enabled ? "var(--accent-primary)" : "var(--border-default)",
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          borderRadius: "var(--radius-pill)",
          background: "var(--gray-0)",
          boxShadow: "0 1px 2px rgba(23,28,37,.25)",
          transition: "transform var(--dur-normal) var(--ease-standard)",
          transform: row.enabled ? "translateX(14px)" : "translateX(0)",
        }}
      />
    </button>
  );
}
