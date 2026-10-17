"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { Icon } from "@/components/ui";

export type FinanceTab = "accounts" | "payables";

const TABS: { id: FinanceTab; label: string; icon: string }[] = [
  { id: "accounts", label: "Accounts", icon: "wallet" },
  { id: "payables", label: "Payables", icon: "file-text" },
];

/** The Finance screen's title and tabs; each tab brings its own panel. */
export function FinanceWorkspace({
  tab,
  businessName,
  alerts,
  children,
}: {
  tab: FinanceTab;
  businessName: string;
  /** How many items need attention on each tab, shown beside its name. */
  alerts: Partial<Record<FinanceTab, number>>;
  children: ReactNode;
}) {
  const router = useRouter();
  const [, startNavigation] = useTransition();
  const go = (next: FinanceTab) =>
    startNavigation(() => router.replace(next === "accounts" ? "/finance" : `/finance?tab=${next}`, { scroll: false }));

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "22px", lineHeight: "28px", fontWeight: 700, letterSpacing: "-.02em" }}>
          Finance
        </h2>
        <p style={{ margin: "3px 0 0", fontSize: "12.5px", color: "var(--text-secondary)" }}>
          {businessName} · where the money is, and what is owed
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Finance view">
        {TABS.map((item) => {
          const active = tab === item.id;
          const count = alerts[item.id] ?? 0;
          return (
            <button
              key={item.id}
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
          );
        })}
      </div>
      {children}
    </div>
  );
}
