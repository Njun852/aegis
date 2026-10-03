"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge, Button, Icon, SearchInput } from "@/components/ui";
import { activateOnKey } from "@/lib/interaction";
import { QUOTE_STATUSES, filterQuotations, formatPeso, manilaDateKey } from "@/lib/quotations";
import { ColumnLabel } from "@/components/forms/form-kit";
import { PhotoButton } from "./photo-button";
import { PriceListPanel } from "./price-list-panel";
import { QuoteSettingsModal } from "./settings-modal";
import type { QuotationSettings, QuotationSummary, QuotePriceItem, QuoteStatusFilter } from "@/types";

const GRID =
  "grid gap-3 items-center grid-cols-[92px_minmax(150px,1.3fr)_110px_20px] wide:grid-cols-[92px_minmax(170px,1.4fr)_minmax(0,1fr)_110px_90px_130px_22px]";

export interface QuotationsWorkspaceProps {
  quotations: QuotationSummary[];
  priceItems: QuotePriceItem[];
  settings: QuotationSettings;
  tab: "quotations" | "prices";
  businessName: string;
  aiConfigured: boolean;
}

export function QuotationsWorkspace({
  quotations,
  priceItems,
  settings,
  tab,
  businessName,
  aiConfigured,
}: QuotationsWorkspaceProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<QuoteStatusFilter>("All");
  const [editingSettings, setEditingSettings] = useState(false);

  const visible = useMemo(() => filterQuotations(quotations, { status, search }), [quotations, status, search]);

  // Counted in the shop's timezone, like the date on the form.
  const month = manilaDateKey(new Date()).slice(0, 7);
  const thisMonth = quotations.filter((quote) => quote.quoteDate.startsWith(month));
  const stats = [
    { label: "Quotations", value: String(quotations.length), icon: "file-text", bg: "var(--accent-soft)", fg: "var(--accent-primary)" },
    {
      label: "Drafts",
      value: String(quotations.filter((quote) => quote.status === "Draft").length),
      icon: "pen-line",
      bg: "var(--status-warning-soft)",
      fg: "var(--status-warning)",
    },
    {
      label: "Sent this month",
      value: String(thisMonth.filter((quote) => quote.status === "Sent").length),
      icon: "send",
      bg: "var(--status-positive-soft)",
      fg: "var(--status-positive)",
    },
    {
      // Quoted, not earned: a quotation is an offer until the work is done.
      label: "Quoted this month",
      value: formatPeso(thisMonth.reduce((sum, quote) => sum + quote.totalCents, 0)),
      icon: "wallet",
      bg: "var(--surface-inset)",
      fg: "var(--text-secondary)",
    },
  ];

  const switchTab = (next: "quotations" | "prices") =>
    router.replace(next === "prices" ? "/quotations?tab=prices" : "/quotations", { scroll: false });

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
              Quotations
            </h2>
            <p style={{ margin: "3px 0 0", fontSize: "12.5px", color: "var(--text-secondary)" }}>
              {businessName} · {quotations.length} {quotations.length === 1 ? "quotation" : "quotations"} ·{" "}
              {priceItems.length} on the price list
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {tab === "quotations" && (
              <SearchInput placeholder="Search ref, customer, plate..." value={search} onChange={setSearch} width={240} />
            )}
            <Button variant="secondary" icon="settings" onClick={() => setEditingSettings(true)}>
              Settings
            </Button>
            <PhotoButton aiConfigured={aiConfigured} />
            <Button icon="plus" onClick={() => router.push("/quotations/new")}>
              New quotation
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
              <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.2, minWidth: 0 }}>
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "19px",
                    fontWeight: 700,
                    letterSpacing: "-.02em",
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                  }}
                >
                  {stat.value}
                </span>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{stat.label}</span>
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-1" role="tablist" aria-label="Quotations view">
          {(
            [
              { id: "quotations", label: "Quotations", icon: "file-text" },
              { id: "prices", label: "Price list", icon: "layers" },
            ] as const
          ).map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchTab(item.id)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  height: 32,
                  padding: "0 13px",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  fontFamily: "var(--font-body)",
                  fontSize: "12.5px",
                  fontWeight: active ? 700 : 500,
                  color: active ? "var(--text-accent)" : "var(--text-secondary)",
                  background: active ? "var(--accent-soft)" : "transparent",
                }}
              >
                <Icon name={item.icon} size={14} />
                {item.label}
              </button>
            );
          })}
        </div>

        {tab === "prices" ? (
          <PriceListPanel items={priceItems} markupPercent={settings.markupPercent} />
        ) : (
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
              {(["All", ...QUOTE_STATUSES] as QuoteStatusFilter[]).map((filter) => {
                const active = status === filter;
                const count =
                  filter === "All" ? quotations.length : quotations.filter((quote) => quote.status === filter).length;
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
                      background: active ? "var(--accent-soft)" : "var(--surface-card)",
                    }}
                  >
                    {filter}
                    <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-muted)" }}>{count}</span>
                  </button>
                );
              })}
              <span className="ml-auto" style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                {visible.length} of {quotations.length} shown · last edited first
              </span>
            </div>

            <div className={GRID} style={{ padding: "0 10px 8px", borderBottom: "1px solid var(--border-subtle)" }}>
              <ColumnLabel>Quote no</ColumnLabel>
              <ColumnLabel>Customer</ColumnLabel>
              <ColumnLabel className="hidden wide:block">Vehicle</ColumnLabel>
              <ColumnLabel className="hidden wide:block">Date</ColumnLabel>
              <ColumnLabel className="hidden wide:block">Status</ColumnLabel>
              <ColumnLabel align="right">Total</ColumnLabel>
              <span />
            </div>

            <div style={{ display: "flex", flexDirection: "column" }}>
              {visible.map((quote) => {
                const open = () => router.push(`/quotations/${encodeURIComponent(quote.ref)}`);
                return (
                  <div
                    key={quote.ref}
                    role="link"
                    tabIndex={0}
                    aria-label={`${quote.ref}, ${quote.customer || quote.company}, ${quote.status}`}
                    onClick={open}
                    onKeyDown={activateOnKey(open)}
                    className={GRID}
                    style={{
                      padding: "10px",
                      borderRadius: "10px",
                      cursor: "pointer",
                      borderBottom: "1px solid var(--gray-50)",
                    }}
                  >
                    <span className="flex flex-col leading-tight">
                      <Strong mono>{quote.ref}</Strong>
                      {quote.source === "photo" && <Muted>From photo</Muted>}
                    </span>
                    <span className="flex min-w-0 flex-col leading-tight">
                      <Strong>{quote.customer || quote.company || "No name"}</Strong>
                      <Muted>{quote.customer && quote.company ? quote.company : quote.plate || " "}</Muted>
                    </span>
                    <span className="hidden min-w-0 flex-col leading-tight wide:flex">
                      <Strong mono>{quote.plate || "—"}</Strong>
                      <Muted>{quote.makeModel || " "}</Muted>
                    </span>
                    <span className="hidden wide:block">
                      <Strong>{quote.quoteDay}</Strong>
                    </span>
                    <span className="hidden wide:block">
                      <Badge tone={quote.status === "Sent" ? "positive" : "neutral"}>{quote.status}</Badge>
                    </span>
                    <span className="flex flex-col items-end leading-tight">
                      <Strong>{formatPeso(quote.totalCents)}</Strong>
                      {quote.unpricedCount > 0 && (
                        <span style={{ fontSize: "11px", color: "var(--status-warning)" }}>
                          {quote.unpricedCount} unpriced
                        </span>
                      )}
                    </span>
                    <span style={{ color: "var(--text-muted)", display: "inline-flex", justifyContent: "flex-end" }}>
                      <Icon name="chevron-right" size={15} />
                    </span>
                  </div>
                );
              })}

              {visible.length === 0 && (
                <div style={{ padding: "30px 10px", textAlign: "center", fontSize: "12.5px", color: "var(--text-muted)" }}>
                  {quotations.length === 0
                    ? "No quotations yet. Start one with “New quotation”."
                    : "No quotations match this search."}
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {editingSettings && (
        <QuoteSettingsModal settings={settings} businessName={businessName} onClose={() => setEditingSettings(false)} />
      )}
    </>
  );
}

function Strong({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <span
      style={{
        display: "block",
        fontSize: "12.5px",
        fontWeight: 500,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        fontVariantNumeric: "tabular-nums",
        fontFamily: mono ? "var(--font-mono)" : undefined,
      }}
    >
      {children}
    </span>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: "11px", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
      {children}
    </span>
  );
}
