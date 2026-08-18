"use client";

import { usePathname } from "next/navigation";
import { Avatar, IconButton } from "@/components/ui";
import { CURRENT_USER, WORKSPACE_NAV } from "@/lib/data/workspace";

export interface TopbarProps {
  onToggleSidebar: () => void;
  lastSync: string;
  hasNotifications?: boolean;
}

export function Topbar({
  onToggleSidebar,
  lastSync,
  hasNotifications,
}: TopbarProps) {
  const pathname = usePathname();
  const current = WORKSPACE_NAV.find((item) => pathname.startsWith(item.href));

  return (
    <header
      style={{
        height: "var(--topbar-height)",
        flex: "0 0 auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
        padding: "0 20px 0 14px",
        borderBottom: "1px solid var(--border-default)",
        background: "var(--surface-card)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          minWidth: 0,
        }}
      >
        <IconButton
          icon="panel-left"
          label="Toggle navigation"
          onClick={onToggleSidebar}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            lineHeight: 1.2,
            minWidth: 0,
          }}
        >
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "16px",
              fontWeight: 700,
              letterSpacing: "-.015em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {current?.title ?? "AEGIS AI"}
          </h1>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10.5px",
              color: "var(--text-muted)",
            }}
          >
            {pathname}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "7px",
            padding: "6px 11px",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-pill)",
            background: "var(--surface-card)",
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "var(--radius-pill)",
              background: "var(--status-positive)",
              animation: "aegis-pulse-dot 2.4s ease-in-out infinite",
            }}
          />
          <span style={{ fontSize: "11.5px", color: "var(--text-secondary)" }}>
            Last sync{" "}
            <span
              style={{
                color: "var(--text-primary)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {lastSync}
            </span>
          </span>
        </div>
        <IconButton icon="bell" badge={hasNotifications} label="Notifications" />
        <Avatar name={CURRENT_USER.name} ring />
      </div>
    </header>
  );
}
