"use client";

import { usePathname } from "next/navigation";
import { useBusiness } from "@/components/business/business-provider";
import { Avatar, IconButton } from "@/components/ui";
import { routeTitle } from "@/lib/navigation";

export interface TopbarProps {
  onToggleSidebar: () => void;
  hasNotifications?: boolean;
}

export function Topbar({ onToggleSidebar, hasNotifications }: TopbarProps) {
  const pathname = usePathname();
  const { businesses, user } = useBusiness();
  const title = routeTitle(pathname, businesses);

  return (
    <header
      className="aegis-no-print"
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
            {title}
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
        <IconButton icon="bell" badge={hasNotifications} label="Notifications" />
        <Avatar name={user.name} ring />
      </div>
    </header>
  );
}
