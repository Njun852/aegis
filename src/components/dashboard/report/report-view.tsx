import type { CSSProperties, ReactNode } from "react";
import { Badge, Card, Icon, StatCard } from "@/components/ui";
import { getStatusStyle } from "@/lib/bookings";
import { formatMoney, formatMoneyIn, formatStamp } from "@/lib/format";
import { relativeAge } from "@/lib/freshness";
import type { DateRange, Report, ReportSummary as Summary } from "@/types";
import { ReportSummary } from "./report-summary";
import { ReportToolbar } from "./report-toolbar";

const DELTA_CAPTION: Record<DateRange, string> = {
  "This month": "from last month",
  "Last month": "from the month before",
  "This quarter": "from last quarter",
};

export interface ReportViewProps {
  report: Report;
  /** The dashboard's short insight, when one is already cached. Never requested here. */
  insight: string | null;
  /** The longer summary, when one was already written for these figures. */
  summary: Summary | null;
  aiEnabled: boolean;
}

/**
 * The dashboard's full report: every real figure AEGIS holds for one period,
 * a section per area the business has. Period figures name their period;
 * point-in-time figures say "as of now"; the ads section says it covers the
 * last 30 days, because that is what Meta reports.
 */
export function ReportView({ report, insight, summary, aiEnabled }: ReportViewProps) {
  const { period, revenue, bookings, ads, mail, inventory, fleet, customers } = report;
  const hasDemo = report.kpis.some((kpi) => kpi.demo);
  const maxMonth = Math.max(...revenue.months.map((month) => month.totalCents), 1);

  return (
    <div className="aegis-report mx-auto flex w-full max-w-[1040px] flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div style={{ minWidth: 0 }}>
          <span style={OVERLINE}>Full report · {report.businessName}</span>
          <h2
            style={{
              margin: "4px 0 0",
              fontFamily: "var(--font-display)",
              fontSize: "24px",
              lineHeight: "30px",
              fontWeight: 700,
              letterSpacing: "-.02em",
            }}
          >
            {period.range}: {period.label}
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: "12.5px", color: "var(--text-secondary)" }}>
            Generated {formatStamp(new Date(report.generatedAt))} from the figures AEGIS holds. Compared
            with {period.previousLabel}.
          </p>
        </div>
        <ReportToolbar range={period.range} />
      </div>

      {/* Keyed by range: the summary keeps what it wrote in state, which must
          not carry over when the period is switched. */}
      <ReportSummary key={period.range} range={period.range} insight={insight} initial={summary} aiEnabled={aiEnabled} />

      <Card title="Financial overview" action={<Caption>{period.label}</Caption>}>
        <div className="grid grid-cols-2 gap-4 wide:grid-cols-4">
          {report.kpis.map((kpi) => (
            <StatCard
              key={kpi.label}
              label={kpi.label}
              value={kpi.value}
              icon={kpi.icon}
              tone={kpi.tone}
              delta={kpi.delta}
              deltaCaption={DELTA_CAPTION[period.range]}
              points={kpi.points}
              demo={kpi.demo}
            />
          ))}
        </div>
        {hasDemo && (
          <Note icon="alert-triangle">
            Sample figures: no data source is connected yet for the tiles marked DEMO DATA. Revenue is
            real, from the ledger.
          </Note>
        )}
      </Card>

      <Card title="Booked revenue" action={<Caption>{period.label}</Caption>}>
        <div className="grid grid-cols-2 gap-4 wide:grid-cols-3">
          <Metric label="Booked in the period" value={formatMoney(revenue.totalCents)} />
          <Metric label={`Previous period (${period.previousLabel})`} value={formatMoney(revenue.previousCents)} />
          <Metric
            label="Change"
            value={revenue.change ?? "—"}
            hint={revenue.change ? undefined : "Nothing in the previous period to compare with."}
          />
        </div>
        <Table head={["Month", "Booked revenue", ""]} align={["left", "right", "left"]}>
          {revenue.months.map((month) => (
            <tr key={month.label} style={month.inPeriod ? { fontWeight: 600 } : undefined}>
              <td style={TD}>
                {month.label}
                {month.inPeriod && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> · in period</span>}
              </td>
              <td style={{ ...TD, textAlign: "right" }}>{formatMoney(month.totalCents)}</td>
              <td style={{ ...TD, width: "42%" }}>
                <span
                  aria-hidden
                  style={{
                    display: "block",
                    height: 8,
                    width: `${(month.totalCents / maxMonth) * 100}%`,
                    minWidth: month.totalCents > 0 ? 3 : 0,
                    borderRadius: 4,
                    background: month.inPeriod ? "var(--accent-primary)" : "var(--blue-200)",
                  }}
                />
              </td>
            </tr>
          ))}
        </Table>
        <Note icon="file-text">
          Revenue is recognised when a booking is made and voided if it is cancelled. It is booked value,
          not cash received.
        </Note>
      </Card>

      {bookings && (
        <Card title="Bookings" action={<Caption>Appointments dated {period.label}</Caption>}>
          <div className="grid grid-cols-2 gap-4 wide:grid-cols-3">
            <Metric label="Bookings" value={String(bookings.total)} />
            <Metric label="Booked value" value={formatMoney(bookings.bookedValueCents)} hint="Cancelled bookings left out." />
            <Metric label="From the online booking page" value={String(bookings.online)} />
          </div>
          {bookings.total === 0 ? (
            <Empty>No appointments fall in this period.</Empty>
          ) : (
            <div className="grid gap-4 wide:grid-cols-2">
              <Table head={["Status", "Bookings"]} align={["left", "right"]}>
                {bookings.byStatus.map((row) => (
                  <tr key={row.status}>
                    <td style={TD}>
                      <Badge tone={getStatusStyle(row.status).tone}>{row.status}</Badge>
                    </td>
                    <td style={{ ...TD, textAlign: "right" }}>{row.count}</td>
                  </tr>
                ))}
              </Table>
              <Table head={["Booked via", "Bookings"]} align={["left", "right"]}>
                {bookings.byChannel.map((row) => (
                  <tr key={row.channel}>
                    <td style={TD}>{row.channel}</td>
                    <td style={{ ...TD, textAlign: "right" }}>{row.count}</td>
                  </tr>
                ))}
              </Table>
              <div className="wide:col-span-2">
                <Table head={["Top services", "Bookings", "Booked value"]} align={["left", "right", "right"]}>
                  {bookings.topServices.map((row) => (
                    <tr key={row.service}>
                      <td style={TD}>{row.service}</td>
                      <td style={{ ...TD, textAlign: "right" }}>{row.count}</td>
                      <td style={{ ...TD, textAlign: "right" }}>{formatMoney(row.valueCents)}</td>
                    </tr>
                  ))}
                </Table>
              </div>
            </div>
          )}
        </Card>
      )}

      <Card title="Ads" action={<Caption>Last 30 days</Caption>}>
        {ads ? (
          <>
            <div className="grid grid-cols-2 gap-4 wide:grid-cols-3">
              <Metric label="Spend" value={formatMoneyIn(ads.spendCents, ads.currency)} />
              <Metric
                label="Results"
                value={ads.resultLabel ? `${ads.results.toLocaleString("en-US")} ${ads.resultLabel}` : "Mixed"}
                hint={ads.resultLabel ? undefined : "Campaigns count different things, so they are not added together."}
              />
              <Metric
                label="Cost per result"
                value={ads.resultLabel ? formatMoneyIn(ads.costPerResultCents, ads.currency) : "—"}
              />
            </div>
            {ads.campaigns.length > 0 && (
              <Table head={["Top campaigns by spend", "Spend", "Results"]} align={["left", "right", "right"]}>
                {ads.campaigns.map((row) => (
                  <tr key={row.name}>
                    <td style={TD}>{row.name}</td>
                    <td style={{ ...TD, textAlign: "right" }}>{formatMoneyIn(row.spendCents, ads.currency)}</td>
                    <td style={{ ...TD, textAlign: "right" }}>
                      {row.results.toLocaleString("en-US")} {row.resultLabel}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
            <Note icon="clock">
              Meta reports rolling windows, not calendar months, so this section covers the last 30 days
              whatever period the report is for. Last synced {relativeAge(ads.lastSyncAt)}.
            </Note>
          </>
        ) : (
          <Empty>No Meta ad account is connected, so there are no ad figures to report.</Empty>
        )}
      </Card>

      <Card title="Mail" action={<Caption>Received {period.label}</Caption>}>
        {mail ? (
          <>
            <div className="grid grid-cols-2 gap-4 wide:grid-cols-3">
              <Metric label="Messages received" value={String(mail.received)} />
              <Metric label="Still unread" value={String(mail.unread)} />
              <Metric label="Need a person's approval" value={String(mail.needsApproval)} />
            </div>
            {mail.received > 0 && (
              <div className="grid gap-4 wide:grid-cols-2">
                <Table head={["Priority", "Messages"]} align={["left", "right"]}>
                  {mail.byPriority.map((row) => (
                    <tr key={row.priority}>
                      <td style={TD}>{row.priority}</td>
                      <td style={{ ...TD, textAlign: "right" }}>{row.count}</td>
                    </tr>
                  ))}
                </Table>
                <Table head={["Category", "Messages"]} align={["left", "right"]}>
                  {mail.byCategory.map((row) => (
                    <tr key={row.category}>
                      <td style={TD}>{row.category}</td>
                      <td style={{ ...TD, textAlign: "right" }}>{row.count}</td>
                    </tr>
                  ))}
                </Table>
              </div>
            )}
            <Note icon="clock">Mail last retrieved {mail.lastSyncLabel}.</Note>
          </>
        ) : (
          <Empty>No mailbox is connected, so there is no mail to report.</Empty>
        )}
      </Card>

      {inventory && (
        <Card title="Inventory" action={<Caption>As of now</Caption>}>
          <div className="grid grid-cols-2 gap-4 wide:grid-cols-3">
            <Metric label="Items tracked" value={String(inventory.skus)} />
            <Metric label="Stock value" value={formatMoney(inventory.stockValueCents)} />
            <Metric label="At or below reorder level" value={String(inventory.belowReorderCount)} />
          </div>
          {inventory.belowReorder.length > 0 && (
            <Table head={["Needs reordering", "On hand", "Reorder at"]} align={["left", "right", "right"]}>
              {inventory.belowReorder.map((item) => (
                <tr key={item.sku}>
                  <td style={TD}>
                    {item.name} <span style={{ color: "var(--text-muted)" }}>· {item.sku}</span>
                  </td>
                  <td style={{ ...TD, textAlign: "right" }}>
                    {item.onHand} {item.unit}
                  </td>
                  <td style={{ ...TD, textAlign: "right" }}>{item.reorder}</td>
                </tr>
              ))}
            </Table>
          )}
          {inventory.belowReorderCount > inventory.belowReorder.length && (
            <Note icon="package">
              Showing {inventory.belowReorder.length} of {inventory.belowReorderCount}. The rest are on the
              Inventory screen.
            </Note>
          )}
        </Card>
      )}

      {(fleet || customers) && (
        <div className="grid gap-4 wide:grid-cols-2">
          {fleet && (
            <Card title="Fleet" action={<Caption>As of now</Caption>}>
              <div className="grid grid-cols-2 gap-4">
                <Metric label="Vehicles on file" value={String(fleet.vehicles)} />
                <Metric label="Overdue for service" value={String(fleet.overdue)} />
                <Metric label="Due in 30 days" value={String(fleet.dueSoon)} />
                <Metric label="No service on record" value={String(fleet.noHistory)} />
              </div>
              <Note icon="wrench">
                {fleet.servicesInPeriod} {fleet.servicesInPeriod === 1 ? "service" : "services"} recorded in{" "}
                {period.label}.
              </Note>
            </Card>
          )}
          {customers && (
            <Card title="Customers" action={<Caption>{period.label}</Caption>}>
              <div className="grid grid-cols-2 gap-4">
                <Metric label="Customers on file" value={String(customers.total)} hint="As of now." />
                <Metric label="New in the period" value={String(customers.newInPeriod)} />
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

const OVERLINE: CSSProperties = {
  fontSize: "var(--text-overline-size)",
  fontWeight: 600,
  letterSpacing: ".1em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

const TD: CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid var(--border-subtle)",
  fontSize: "12.5px",
  fontVariantNumeric: "tabular-nums",
  overflowWrap: "anywhere",
};

function Caption({ children }: { children: ReactNode }) {
  return <span style={{ fontSize: "11.5px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{children}</span>;
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>{label}</span>
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "20px",
          lineHeight: "26px",
          fontWeight: 700,
          letterSpacing: "-.02em",
          fontVariantNumeric: "tabular-nums",
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </span>
      {hint && <span style={{ fontSize: "11px", color: "var(--text-muted)", textWrap: "pretty" }}>{hint}</span>}
    </div>
  );
}

function Table({
  head,
  align,
  children,
}: {
  head: string[];
  align: ("left" | "right")[];
  children: ReactNode;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {head.map((label, index) => (
              <th
                key={`${label}-${index}`}
                scope="col"
                style={{
                  ...OVERLINE,
                  padding: "0 10px 6px",
                  textAlign: align[index],
                  borderBottom: "1px solid var(--border-default)",
                }}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Note({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <p
      style={{
        margin: 0,
        display: "flex",
        alignItems: "flex-start",
        gap: 7,
        fontSize: "11.5px",
        lineHeight: "17px",
        color: "var(--text-muted)",
        textWrap: "pretty",
      }}
    >
      <Icon name={icon} size={13} style={{ marginTop: 2, flex: "0 0 auto" }} />
      <span>{children}</span>
    </p>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p style={{ margin: 0, fontSize: "12.5px", color: "var(--text-muted)" }}>{children}</p>;
}
