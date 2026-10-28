"use client";

import { useRouter } from "next/navigation";
import { useMemo, useTransition, type ReactNode } from "react";
import { switchBusinessAction } from "@/app/actions/business";
import { useToast } from "@/components/layout/toast-provider";
import { Badge, Button, Icon } from "@/components/ui";
import { useAutoSync } from "@/hooks/use-auto-sync";
import { everyLabel } from "@/lib/auto-sync";
import { formatMoney } from "@/lib/format";
import { BUSINESS_HUES, BarList, StackedColumns, type BarRow } from "./owner-charts";
import type { BoardItem, BoardTone, BusinessBoard, OwnerBoard } from "@/types";

/**
 * The owner's board as a collage: tiles of different sizes across every
 * business at once, figures on top, charts in the middle (bookings by day, ad
 * spend, messages, money), the lists that need someone beside them, and a
 * card per business below. Anything on it opens what it shows, in its own
 * business.
 */

/** The board re-reads every business this often while it is open. */
const REFRESH_MS = 2 * 60_000;
/** Lines the attention list carries, most pressing first. */
const ATTENTION_LINES = 9;

const RANK: Record<BoardTone, number> = { negative: 3, warning: 2, accent: 1, neutral: 0 };

const STATUS_DOT: Record<BoardTone, string> = {
  negative: "var(--status-negative)",
  warning: "var(--status-warning)",
  accent: "var(--accent-primary)",
  neutral: "var(--text-muted)",
};

/** Switches to the item's business through the checked action, then loads the page there. */
function useOpenIn() {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const open = (business: BusinessBoard, href: string, what: string) =>
    startTransition(async () => {
      toast({ tone: "info", title: `Opening ${what}`, description: `In ${business.name}.`, key: "owner-open", durationMs: 4000 });
      try {
        await switchBusinessAction(business.businessId);
        // A full load, not router.push: the switch refreshes the layout, which
        // swallows a client navigation started in the same transition, and the
        // whole shell must show the business just switched to.
        window.location.assign(href);
      } catch {
        toast({ tone: "error", title: "Could not open it", description: `You no longer have access to ${business.name}.`, key: "owner-open" });
      }
    });
  return { open, pending };
}

/** "Oct 27" for a "2026-10-27" key. */
function shortDay(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
}

function Tile({ title, icon, span, action, children }: { title: string; icon: string; span: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section
      className={span}
      style={{ minWidth: 0, background: "var(--surface-card)", border: "1px solid var(--border-default)", borderRadius: 16, boxShadow: "var(--shadow-card)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}
    >
      <div className="flex items-center gap-2">
        <Icon name={icon} size={15} />
        <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "13.5px", fontWeight: 700, flex: 1 }}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Legend({ entries }: { entries: { id: string; name: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1" style={{ fontSize: "11.5px", color: "var(--text-secondary)" }}>
      {entries.map((entry) => (
        <span key={entry.id} className="inline-flex items-center gap-1.5">
          <span style={{ width: 9, height: 9, borderRadius: 2, background: entry.color }} />
          {entry.name}
        </span>
      ))}
    </div>
  );
}

/** A clickable line: a status dot, what it is, why it matters, and where. */
function ItemLine({ item, where, whereColor, onClick }: { item: BoardItem; where: string; whereColor: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-2"
      style={{ border: "none", background: "none", font: "inherit", textAlign: "left", cursor: "pointer", padding: "6px 6px", borderRadius: 8 }}
      onMouseEnter={(event) => (event.currentTarget.style.background = "var(--surface-hover, var(--gray-25))")}
      onMouseLeave={(event) => (event.currentTarget.style.background = "none")}
    >
      <span style={{ width: 7, height: 7, marginTop: 6, flex: "0 0 auto", borderRadius: 999, background: STATUS_DOT[item.tone] }} />
      <span className="flex min-w-0 flex-1 flex-col" style={{ lineHeight: 1.3 }}>
        <span style={{ fontSize: "12.5px", fontWeight: 600, overflowWrap: "anywhere" }}>{item.label}</span>
        <span style={{ fontSize: "11.5px", color: "var(--text-secondary)", overflowWrap: "anywhere" }}>{item.detail}</span>
        <span className="inline-flex items-center gap-1.5" style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: whereColor }} />
          {where}
        </span>
      </span>
      <Icon name="arrow-right" size={13} />
    </button>
  );
}

export function OwnerBoardView({ board }: { board: OwnerBoard }) {
  const router = useRouter();
  const { open, pending } = useOpenIn();

  // Every business is read again on this timer; there is no refresh button.
  useAutoSync(() => router.refresh(), REFRESH_MS, { immediate: false });

  // Colour follows the business, by its place in id order, never its rank on the board.
  const colorOf = useMemo(() => {
    const ids = board.businesses.map((business) => business.businessId).sort();
    return (id: string) => BUSINESS_HUES[ids.indexOf(id) % BUSINESS_HUES.length];
  }, [board.businesses]);
  const byId = (id: string) => board.businesses.find((business) => business.businessId === id)!;
  const inIdOrder = [...board.businesses].sort((a, b) => a.businessId.localeCompare(b.businessId));
  const legend = inIdOrder.map((business) => ({ id: business.businessId, name: business.name, color: colorOf(business.businessId) }));

  const bookingSeries = inIdOrder
    .filter((business) => business.modules.includes("bookings"))
    .map((business) => ({ id: business.businessId, name: business.name, color: colorOf(business.businessId), values: business.bookingsByDay }));
  const bookings14 = bookingSeries.reduce((sum, entry) => sum + entry.values.reduce((inner, value) => inner + value, 0), 0);

  const attention = board.businesses
    .flatMap((business) =>
      business.sections.flatMap((section) =>
        section.items.filter((item) => item.tone === "negative" || item.tone === "warning").map((item) => ({ business, section: section.title, item })),
      ),
    )
    .sort((a, b) => RANK[b.item.tone] - RANK[a.item.tone])
    .slice(0, ATTENTION_LINES);

  const rowsOf = (pick: (business: BusinessBoard) => number, display: (value: number) => string, only?: string): BarRow[] =>
    board.businesses
      .filter((business) => !only || business.modules.includes(only))
      .map((business) => ({ id: business.businessId, label: business.name, value: pick(business), display: display(pick(business)), color: colorOf(business.businessId) }))
      .sort((a, b) => b.value - a.value);

  const campaigns = board.businesses
    .flatMap((business) =>
      (business.sections.find((section) => section.key === "ads")?.items ?? [])
        .filter((item): item is BoardItem & { value: number } => typeof item.value === "number")
        .map((item, index) => ({
          row: {
            id: `${business.businessId}#${index}`,
            label: item.label,
            sub: business.name,
            value: item.value,
            display: formatMoney(item.value, false),
            color: colorOf(business.businessId),
          } satisfies BarRow,
          business,
        })),
    )
    .sort((a, b) => b.row.value - a.row.value)
    .slice(0, 5);

  const lowStock = board.businesses.flatMap((business) =>
    (business.sections.find((section) => section.key === "stock")?.items ?? []).map((item) => ({ business, item })),
  );
  const totals = board.totals;

  const kpis: { label: string; value: string; hint: string; tone: BoardTone }[] = [
    { label: "Chats waiting", value: String(totals.chatsWaiting), hint: "Messenger, no reply or booking", tone: totals.chatsWaiting > 0 ? "warning" : "neutral" },
    { label: "Unread email", value: String(totals.unreadMail), hint: "across every mailbox", tone: "neutral" },
    { label: "Bookings today", value: String(totals.bookingsToday), hint: `${bookings14} in the last 14 days`, tone: "neutral" },
    { label: "To confirm", value: String(totals.pendingBookings), hint: "booking requests", tone: totals.pendingBookings > 0 ? "warning" : "neutral" },
    { label: "Low or out of stock", value: String(totals.lowStock), hint: "at or under reorder level", tone: totals.lowStock > 0 ? "warning" : "neutral" },
    { label: "Ad spend, 30 days", value: formatMoney(totals.adSpend30dCents, false), hint: "Meta, all campaigns", tone: "neutral" },
  ];

  return (
    <div className="flex flex-col gap-3.5" style={{ opacity: pending ? 0.7 : 1 }}>
      <div className="flex flex-wrap items-center gap-3">
        <h1 style={{ margin: 0, marginRight: "auto", fontFamily: "var(--font-display)", fontSize: "20px", fontWeight: 700 }}>Owner board</h1>
        <Legend entries={legend} />
        <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>Updates every {everyLabel(REFRESH_MS)}</span>
      </div>

      <div className="grid grid-cols-2 gap-3.5 wide:grid-cols-6">
        {kpis.map((kpi) => (
          <div key={kpi.label} style={{ background: "var(--surface-card)", border: "1px solid var(--border-default)", borderRadius: 14, padding: "12px 14px", minWidth: 0 }}>
            <div className="flex items-center gap-1.5" style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
              {kpi.tone !== "neutral" && <span style={{ width: 7, height: 7, borderRadius: 999, background: STATUS_DOT[kpi.tone] }} />}
              {kpi.label}
            </div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "24px", fontWeight: 700, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{kpi.value}</div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{kpi.hint}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3.5 wide:grid-cols-12">
        <Tile title="Bookings, last 14 days" icon="calendar" span="wide:col-span-8">
          {bookingSeries.length === 0 ? (
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>No business has Bookings.</span>
          ) : (
            <>
              <StackedColumns labels={board.days.map(shortDay)} series={bookingSeries} onPick={(id) => open(byId(id), "/bookings", "bookings")} />
              {bookings14 === 0 && <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>No bookings in the last 14 days.</span>}
            </>
          )}
        </Tile>

        <Tile
          title="Needs attention"
          icon="alert-triangle"
          span="wide:col-span-4 wide:row-span-2"
          action={attention.length > 0 ? <Badge tone="warning">{attention.length}</Badge> : <Badge tone="positive">All clear</Badge>}
        >
          {attention.length === 0 ? (
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Nothing overdue, out of stock or waiting in any business.</span>
          ) : (
            <div className="flex flex-col" style={{ gap: 2 }}>
              {attention.map(({ business, section, item }, index) => (
                <ItemLine
                  key={`${business.businessId}-${item.href}-${index}`}
                  item={item}
                  where={`${business.name} · ${section}`}
                  whereColor={colorOf(business.businessId)}
                  onClick={() => open(business, item.href, item.label)}
                />
              ))}
            </div>
          )}
        </Tile>

        <Tile title="Ad spend by business, 30 days" icon="megaphone" span="wide:col-span-4">
          <BarList
            rows={rowsOf((business) => business.figures.adSpend30dCents, (value) => formatMoney(value, false))}
            empty="No ad spend in the last 30 days."
            onPick={(row) => open(byId(row.id), "/ads?range=last_30d", "ads")}
          />
        </Tile>

        <Tile title="Top campaigns, 30 days" icon="trending-up" span="wide:col-span-4">
          <BarList
            rows={campaigns.map((entry) => entry.row)}
            empty="No campaign spent in the last 30 days."
            onPick={(row) => {
              const entry = campaigns.find((candidate) => candidate.row.id === row.id);
              if (entry) open(entry.business, "/ads?range=last_30d", row.label);
            }}
          />
        </Tile>

        <Tile title="Unread email by business" icon="mail" span="wide:col-span-4">
          <BarList rows={rowsOf((business) => business.figures.unreadMail, String)} empty="No unread email anywhere." onPick={(row) => open(byId(row.id), "/mail", "mail")} />
        </Tile>

        <Tile title="Chats waiting by business" icon="inbox" span="wide:col-span-4">
          <BarList
            rows={rowsOf((business) => business.figures.chatsWaiting, String, "bookings")}
            empty="No customer is waiting on Messenger."
            onPick={(row) => open(byId(row.id), "/bookings/messenger", "Messenger")}
          />
        </Tile>

        <Tile title="Financial position by business" icon="wallet" span="wide:col-span-4">
          <BarList
            rows={rowsOf((business) => business.figures.positionCents, (value) => formatMoney(value, false))}
            empty="No money accounts set up yet."
            onPick={(row) => open(byId(row.id), "/finance?tab=standing", "Standing")}
          />
        </Tile>

        <Tile title="Low or out of stock" icon="package" span="wide:col-span-4">
          {lowStock.length === 0 ? (
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Everything is above its reorder level.</span>
          ) : (
            <div className="flex flex-col" style={{ gap: 2 }}>
              {lowStock.slice(0, 5).map(({ business, item }, index) => (
                <ItemLine
                  key={`${business.businessId}-${index}`}
                  item={item}
                  where={business.name}
                  whereColor={colorOf(business.businessId)}
                  onClick={() => open(business, item.href, item.label)}
                />
              ))}
            </div>
          )}
        </Tile>

        {/* A card per business, busiest first. */}
        {board.businesses.map((business) => (
          <section
            key={business.businessId}
            className="wide:col-span-4"
            style={{ minWidth: 0, background: "var(--surface-card)", border: "1px solid var(--border-default)", borderRadius: 16, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}
          >
            <div className="flex items-center gap-2">
              <span style={{ width: 10, height: 10, borderRadius: 3, background: colorOf(business.businessId) }} />
              <span style={{ fontFamily: "var(--font-display)", fontSize: "14px", fontWeight: 700, flex: 1, overflowWrap: "anywhere" }}>{business.name}</span>
              {business.attention > 0 ? <Badge tone="warning">{business.attention} to check</Badge> : <Badge tone="positive">All clear</Badge>}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {business.sections
                .flatMap((section) => section.stats.slice(0, 1).map((stat) => ({ section, stat })))
                .slice(0, 6)
                .map(({ section, stat }) => (
                  <button
                    key={section.key}
                    type="button"
                    title={`Open ${section.title} in ${business.name}`}
                    onClick={() => open(business, stat.href, section.title)}
                    style={{ border: "1px solid var(--border-subtle)", background: "none", font: "inherit", textAlign: "left", cursor: "pointer", padding: "7px 8px", borderRadius: 10, minWidth: 0 }}
                  >
                    <div style={{ fontSize: "10.5px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{section.title}</div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: "16px", fontWeight: 700, fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {stat.value}
                    </div>
                    <div style={{ fontSize: "10.5px", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stat.label.toLowerCase()}</div>
                  </button>
                ))}
            </div>
            <div>
              <Button size="sm" variant="ghost" icon="layout-dashboard" onClick={() => open(business, "/dashboard", "the dashboard")}>
                Open dashboard
              </Button>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
