"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { SyncProvider, useSync } from "./sync-provider";
import { ToastProvider } from "./toast-provider";
import { Topbar } from "./topbar";

export interface AppShellProps {
  children: ReactNode;
  unreadCount: number;
}

/**
 * The persistent chrome every signed-in route renders inside: a collapsible
 * sidebar, the top bar, and a scrolling main region.
 */
export function AppShell({ children, unreadCount }: AppShellProps) {
  return (
    <SyncProvider>
      <ToastProvider>
        <ShellFrame unreadCount={unreadCount}>{children}</ShellFrame>
      </ToastProvider>
    </SyncProvider>
  );
}

function ShellFrame({ children, unreadCount }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { label: lastSync } = useSync();

  return (
    <div
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
          lastSync={lastSync}
          hasNotifications={unreadCount > 0}
          onToggleSidebar={() => setCollapsed((isCollapsed) => !isCollapsed)}
        />
        <main
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
