"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { Icon } from "@/components/ui";
import { FINANCE_TABS, defaultFinanceTab, type FinanceTab } from "@/lib/finance-tabs";

/** The Finance screen's title and tabs; each tab brings its own panel. */
export function FinanceWorkspace({
  tab,
  isAdmin,
  businessName,
  alerts,
  children,
}: {
  tab: FinanceTab;
  isAdmin: boolean;
  businessName: string;
  /** How many items need attention on each tab, shown beside its name. */
  alerts: Partial<Record<FinanceTab, number>>;
  children: ReactNode;
}) {
  const router = useRouter();
  const [, startNavigation] = useTransition();
  const go = (next: FinanceTab) =>
    startNavigation(() => router.replace(next === defaultFinanceTab(isAdmin) ? "/finance" : `/finance?tab=${next}`, { scroll: false }));

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "22px", lineHeight: "28px", fontWeight: 700, letterSpacing: "-.02em" }}>
          Finance
        </h2>
        <p style={{ margin: "3px 0 0", fontSize: "12.5px", color: "var(--text-secondary)" }}>
          {businessName} · how much the business made, and where it stands
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Finance view">
        {FINANCE_TABS.filter((item) => isAdmin || !item.adminOnly).map((item, index, shown) => {
          const active = tab === item.id;
          const count = alerts[item.id] ?? 0;
          // A thin rule between the owner's reports and the working tabs.
          const divider = index > 0 && shown[index - 1].adminOnly && !item.adminOnly;
          return (
            <span key={item.id} className="flex items-center gap-1">
              {divider && <span aria-hidden style={{ width: 1, height: 18, background: "var(--border-default)", margin: "0 6px" }} />}
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => go(item.id)}
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
                {count > 0 && (
                  <span
                    style={{
                      minWidth: 18,
                      height: 18,
                      padding: "0 5px",
                      borderRadius: 999,
                      background: "var(--status-negative)",
                      color: "#fff",
                      fontSize: "10.5px",
                      fontWeight: 700,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            </span>
          );
        })}
      </div>
      {children}
    </div>
  );
}
