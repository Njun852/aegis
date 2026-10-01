"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { SyncProvider } from "./sync-provider";
import type { MailFreshnessState } from "@/types";
import { ToastProvider } from "./toast-provider";
import { Topbar } from "./topbar";

export interface AppShellProps {
  children: ReactNode;
  unreadCount: number;
  /** Real mail freshness, read on the server. Never a timer. */
  mailFreshness: MailFreshnessState;
}

/**
 * The persistent chrome every signed-in route renders inside: a collapsible
 * sidebar, the top bar, and a scrolling main region.
 */
export function AppShell({
  children,
  unreadCount,
  mailFreshness,
}: AppShellProps) {
  return (
    // Keyed by business: `SyncProvider` copies its initial value into state, so
    // without this a switch would leave the previous business's mail state on
    // screen — a connected badge over a business with no mailbox.
    <SyncProvider key={mailFreshness.businessId} initial={mailFreshness}>
      <ToastProvider>
        <ShellFrame unreadCount={unreadCount} mailFreshness={mailFreshness}>
          {children}
        </ShellFrame>
      </ToastProvider>
    </SyncProvider>
  );
}

function ShellFrame({ children, unreadCount }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  return (
    <div
      // Class hooks for the print rules in globals.css: on paper the shell
      // stops being a fixed-height scroll box, so a long page prints in full.
      className="aegis-shell"
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: "var(--bg-app)",
        color: "var(--text-primary)",
      }}
    >
      <Sidebar
        collapsed={collapsed}
        userMenuOpen={userMenuOpen}
        unreadCount={unreadCount}
        onToggleUserMenu={() => setUserMenuOpen((open) => !open)}
        onCloseMenus={() => setUserMenuOpen(false)}
        onNavigate={() => setUserMenuOpen(false)}
      />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Topbar
          hasNotifications={unreadCount > 0}
          onToggleSidebar={() => setCollapsed((isCollapsed) => !isCollapsed)}
        />
        <main
          className="aegis-shell-main"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: "var(--page-padding)",
          }}
        >
          <div style={{ maxWidth: 1520, margin: "0 auto", height: "100%" }}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
