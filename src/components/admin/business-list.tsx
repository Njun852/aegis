"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useBusiness } from "@/components/business/business-provider";
import { Badge, Button, Icon, SearchInput } from "@/components/ui";
import {
  TOTAL_MODULE_COUNT,
  activeModuleCount,
  filterBusinesses,
} from "@/lib/businesses";
import { OPTIONAL_MODULES } from "@/lib/data/businesses";
import { activateOnKey } from "@/lib/interaction";
import type { OptionalModuleKey } from "@/types";

const ROW =
  "grid gap-3 items-center grid-cols-[minmax(200px,1.7fr)_minmax(0,1.5fr)_150px_22px]";

/**
 * AEGIS-internal screen: every provisioned business and the optional modules it
 * has bought. Entitlements are set here, not by the customer.
 */
export function BusinessList() {
  const router = useRouter();
  const { businesses, activeBusinessId } = useBusiness();
  const [query, setQuery] = useState("");

  const rows = filterBusinesses(businesses, query);

  const optionalSeats = businesses.reduce(
    (total, business) => total + business.modules.length,
    0,
  );
  const coreOnly = businesses.filter(
    (business) => business.modules.length === 0,
  ).length;

  const summary = [
    {
      label: "Businesses",
      value: String(businesses.length),
      detail: "All active this month",
    },
    {
      label: "Optional seats",
      value: String(optionalSeats),
      detail: `Across ${OPTIONAL_MODULES.length} optional modules`,
    },
    {
      label: "Core only",
      value: String(coreOnly),
      detail: "No optional modules yet",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
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
            Business Management
          </h2>
          <p
            style={{
              margin: "3px 0 0",
              fontSize: "12.5px",
              color: "var(--text-secondary)",
              textWrap: "pretty",
            }}
          >
            {businesses.length}{" "}
            {businesses.length === 1 ? "business" : "businesses"} provisioned ·
            Dashboard, Mail and Ads are always included
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <SearchInput
            placeholder="Search businesses..."
            value={query}
            onChange={setQuery}
            width={240}
          />
          <Button icon="plus">Add Business</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 wide:grid-cols-3">
        {summary.map((item) => (
          <div
            key={item.label}
            style={{
              background: "var(--surface-card)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-card)",
              padding: "12px 14px",
              display: "flex",
              flexDirection: "column",
              gap: "2px",
              minWidth: 0,
            }}
          >
            <span
              style={{
                fontSize: "10.5px",
                letterSpacing: ".08em",
                textTransform: "uppercase",
                color: "var(--text-muted)",
              }}
            >
              {item.label}
            </span>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "20px",
                fontWeight: 700,
                letterSpacing: "-.02em",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {item.value}
            </span>
            <span
              style={{ fontSize: "11.5px", color: "var(--text-secondary)" }}
            >
              {item.detail}
            </span>
          </div>
        ))}
      </div>

      <section
        style={{
          background: "var(--surface-card)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-card)",
          padding: "6px 8px 8px",
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        <div
          className={ROW}
          style={{
            padding: "10px 10px 8px",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <ColumnLabel>Business</ColumnLabel>
          <ColumnLabel>Optional modules</ColumnLabel>
          <ColumnLabel>Total active</ColumnLabel>
          <span />
        </div>

        {rows.map((business) => {
          const badges = OPTIONAL_MODULES.filter((module) =>
            business.modules.includes(module.key as OptionalModuleKey),
          );
          const count = activeModuleCount(business);

          return (
            <div
              key={business.id}
              role="button"
              tabIndex={0}
              aria-label={`Manage ${business.name}`}
              onClick={() => router.push(`/admin/businesses/${business.id}`)}
              onKeyDown={activateOnKey(() =>
                router.push(`/admin/businesses/${business.id}`),
              )}
              className={ROW}
              style={{
                padding: "11px 10px",
                borderRadius: "10px",
                cursor: "pointer",
                borderBottom: "1px solid var(--gray-50)",
                transition: "background var(--dur-fast) var(--ease-standard)",
              }}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  style={{
                    width: 32,
                    height: 32,
                    flex: "0 0 auto",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--accent-soft)",
                    color: "var(--accent-primary)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="building-2" size={15} />
                </span>
                <span className="flex min-w-0 flex-col leading-tight">
                  <span
                    style={{
                      fontSize: "13.5px",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {business.name}
                  </span>
                  <span
                    className="flex min-w-0 items-center gap-1.5"
                    style={{ fontSize: "11px", color: "var(--text-muted)" }}
                  >
                    {business.id === activeBusinessId && (
                      <span
                        className="inline-flex flex-none items-center gap-1"
                        style={{
                          color: "var(--blue-600)",
                          fontWeight: 600,
                        }}
                      >
                        <span
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: "var(--radius-pill)",
                            background: "var(--accent-primary)",
                          }}
                        />
                        Viewing
                      </span>
                    )}
                    <span
                      style={{
                        flex: "1 1 auto",
                        minWidth: 0,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {business.meta}
                    </span>
                  </span>
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {badges.map((module) => (
                  <Badge key={module.key} tone="accent" icon={module.icon}>
                    {module.name}
                  </Badge>
                ))}
                {badges.length === 0 && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      height: 22,
                      padding: "0 10px",
                      borderRadius: "var(--radius-pill)",
                      border: "1px dashed var(--border-strong)",
                      color: "var(--text-muted)",
                      fontSize: "11px",
                      fontWeight: 600,
                    }}
                  >
                    Core modules only
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span
                  className="inline-flex flex-none items-center gap-1.5"
                  style={{
                    fontSize: "11.5px",
                    color: "var(--text-secondary)",
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                  }}
                >
                  <Icon name="layers" size={13} color="var(--text-muted)" />
                  {count} of {TOTAL_MODULE_COUNT}
                </span>
                <span
                  style={{
                    flex: 1,
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
                      background: "var(--accent-primary)",
                      width: `${Math.round((count / TOTAL_MODULE_COUNT) * 100)}%`,
                    }}
                  />
                </span>
              </div>

              <span
                style={{
                  color: "var(--text-muted)",
                  display: "inline-flex",
                  justifyContent: "flex-end",
                }}
              >
                <Icon name="chevron-right" size={16} />
              </span>
            </div>
          );
        })}

        {rows.length === 0 && (
          <div
            style={{
              padding: "26px 10px",
              textAlign: "center",
              fontSize: "12.5px",
              color: "var(--text-muted)",
            }}
          >
            No businesses match that search.
          </div>
        )}
      </section>
    </div>
  );
}

function ColumnLabel({ children }: { children?: React.ReactNode }) {
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
