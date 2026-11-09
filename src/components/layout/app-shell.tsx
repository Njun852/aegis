"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AskAegis, type AskAegisProps } from "@/components/ask/ask-aegis";
import { useMediaQuery } from "@/hooks/use-media-query";
import { AutoSync } from "./auto-sync";
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
  /** The Ask AEGIS bubble. Null when AI is not configured, which hides it. */
  ask?: AskAegisProps | null;
}

/**
 * The persistent chrome every signed-in route renders inside: a collapsible
 * sidebar, the top bar, a scrolling main region, and the Ask AEGIS bubble.
 *
 * On a phone-width window the sidebar is a drawer instead: closed by default
 * so the page has the whole width, opened over the page by the top bar's menu
 * button, and closed again by choosing a page, tapping outside it or Escape.
 */

/** Below this the sidebar stops sitting beside the page. */
const NARROW_QUERY = "(max-width: 767px)";
export function AppShell({
  children,
  unreadCount,
  mailFreshness,
  ask,
}: AppShellProps) {
  return (
    // Keyed by business: `SyncProvider` copies its initial value into state, so
    // without this a switch would leave the previous business's mail state on
    // screen — a connected badge over a business with no mailbox.
    <SyncProvider key={mailFreshness.businessId} initial={mailFreshness}>
      <ToastProvider>
        <AutoSync />
        <ShellFrame unreadCount={unreadCount} mailFreshness={mailFreshness}>
          {children}
        </ShellFrame>
        {/* Keyed the same way: one business's chat must not carry into another's. */}
        {ask && <AskAegis key={mailFreshness.businessId} {...ask} />}
      </ToastProvider>
    </SyncProvider>
  );
}

function ShellFrame({ children, unreadCount }: AppShellProps) {
  const narrow = useMediaQuery(NARROW_QUERY);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  // Only a phone-width window has a drawer; growing the window closes it.
  const drawer = narrow && drawerOpen;

  useEffect(() => {
    if (!drawer) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [drawer]);

  const sidebar = (
    <Sidebar
      // The drawer always shows the full sidebar, labels and all.
      collapsed={narrow ? false : collapsed}
      userMenuOpen={userMenuOpen}
      unreadCount={unreadCount}
      onToggleUserMenu={() => setUserMenuOpen((open) => !open)}
      onCloseMenus={() => setUserMenuOpen(false)}
      onNavigate={() => {
        setUserMenuOpen(false);
        setDrawerOpen(false);
      }}
    />
  );

  return (
    <div
      // Class hooks for the print rules in globals.css: on paper the shell
      // stops being a fixed-height scroll box, so a long page prints in full.
      className="aegis-shell"
      style={{
        display: "flex",
        // Divided by the text-size zoom, which scales vh along with everything
        // else: without it a larger size would push the shell past the window.
        height: "calc(100vh / var(--ui-zoom, 1))",
        overflow: "hidden",
        background: "var(--bg-app)",
        color: "var(--text-primary)",
      }}
    >
      {narrow ? (
        <>
          {drawer && (
            <div
              aria-hidden="true"
              onClick={() => setDrawerOpen(false)}
              style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(15, 23, 42, 0.45)" }}
            />
          )}
          <div
            // Kept mounted while closed so it slides rather than pops, and
            // made inert so a closed drawer cannot take focus or clicks.
            inert={!drawer}
            style={{
              position: "fixed",
              top: 0,
              bottom: 0,
              left: 0,
              zIndex: 50,
              display: "flex",
              maxWidth: "85vw",
              transform: drawer ? "translateX(0)" : "translateX(-100%)",
              transition: "transform var(--dur-normal) var(--ease-standard)",
              boxShadow: drawer ? "var(--shadow-popover)" : "none",
            }}
          >
            {sidebar}
          </div>
        </>
      ) : (
        sidebar
      )}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Topbar
          onToggleSidebar={() =>
            narrow ? setDrawerOpen((open) => !open) : setCollapsed((isCollapsed) => !isCollapsed)
          }
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
