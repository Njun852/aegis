"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { Avatar, Button, IconButton, NavItem, UserChip } from "@/components/ui";
import {
  COMING_SOON_MODULES,
  CURRENT_USER,
  ORGANIZATION,
  WORKSPACE_NAV,
} from "@/lib/data/workspace";

export interface SidebarProps {
  collapsed: boolean;
  userMenuOpen: boolean;
  onToggleUserMenu: () => void;
  onNavigate: () => void;
  unreadCount: number;
}

export function Sidebar({
  collapsed,
  userMenuOpen,
  onToggleUserMenu,
  onNavigate,
  unreadCount,
}: SidebarProps) {
  const pathname = usePathname();
  const { signOut } = useAuth();

  return (
    <aside
      style={{
        flex: "0 0 auto",
        // Without this the nav labels' min-content width wins over the
        // collapsed width and the rail never actually narrows.
        minWidth: 0,
        width: collapsed
          ? "var(--sidebar-width-collapsed)"
          : "var(--sidebar-width)",
        background: "var(--surface-sidebar)",
        borderRight: "1px solid var(--border-default)",
        display: "flex",
        flexDirection: "column",
        transition: "width var(--dur-normal) var(--ease-standard)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "var(--topbar-height)",
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "0 16px",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <span
          style={{
            width: 28,
            height: 28,
            flex: "0 0 auto",
            borderRadius: "var(--radius-sm)",
            background: "var(--grad-primary)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: "14px",
            color: "#fff",
          }}
        >
          A
        </span>
        {!collapsed && (
          <span
            style={{
              display: "flex",
              flexDirection: "column",
              lineHeight: 1.15,
              whiteSpace: "nowrap",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: "16px",
                letterSpacing: "-.01em",
              }}
            >
              {ORGANIZATION.product}
            </span>
            <span
              style={{
                fontSize: "10.5px",
                letterSpacing: ".09em",
                textTransform: "uppercase",
                color: "var(--text-muted)",
              }}
            >
              {ORGANIZATION.name}
            </span>
          </span>
        )}
      </div>

      <nav
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "16px 14px",
          display: "flex",
          flexDirection: "column",
          gap: "2px",
        }}
      >
        {!collapsed && <SectionLabel>Workspace</SectionLabel>}

        {collapsed ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              alignItems: "center",
            }}
          >
            {WORKSPACE_NAV.map((item) => (
              <IconButton
                key={item.href}
                icon={item.icon}
                label={item.label}
                active={pathname.startsWith(item.href)}
                badge={item.href === "/mail" && unreadCount > 0}
                onClick={onNavigate}
              />
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {WORKSPACE_NAV.map((item) => (
              <NavItem
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                active={pathname.startsWith(item.href)}
                badge={item.href === "/mail" ? unreadCount : undefined}
                onClick={onNavigate}
              />
            ))}
          </div>
        )}

        {collapsed ? (
          <div
            style={{
              height: 1,
              background: "var(--border-subtle)",
              margin: "14px 6px",
            }}
          />
        ) : (
          <SectionLabel style={{ paddingTop: "20px" }}>Modules</SectionLabel>
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: collapsed ? "6px" : "2px",
            alignItems: collapsed ? "center" : "stretch",
          }}
        >
          {COMING_SOON_MODULES.map((module) => (
            <div
              key={module.label}
              title="Coming soon"
              style={{ opacity: 0.45, pointerEvents: "none" }}
            >
              {collapsed ? (
                <IconButton icon={module.icon} label={module.label} disabled />
              ) : (
                <NavItem
                  icon={module.icon}
                  label={module.label}
                  badge={module.badge}
                  disabled
                />
              )}
            </div>
          ))}
        </div>
      </nav>

      <div
        style={{
          flex: "0 0 auto",
          padding: "14px",
          borderTop: "1px solid var(--border-subtle)",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          position: "relative",
        }}
      >
        {userMenuOpen && (
          <div
            style={{
              position: "absolute",
              bottom: 78,
              left: 14,
              right: 14,
              background: "var(--surface-raised)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-popover)",
              padding: "6px",
              display: "flex",
              flexDirection: "column",
              gap: "2px",
              zIndex: 20,
            }}
          >
            <Button variant="ghost" size="sm" icon="user" fullWidth>
              Profile
            </Button>
            <Button variant="ghost" size="sm" icon="settings" fullWidth>
              Account Settings
            </Button>
            <div
              style={{
                height: 1,
                background: "var(--border-subtle)",
                margin: "4px",
              }}
            />
            <Button variant="danger" size="sm" icon="log-out" fullWidth onClick={signOut}>
              Log out
            </Button>
          </div>
        )}

        {collapsed ? (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <Avatar name={CURRENT_USER.name} ring />
          </div>
        ) : (
          <UserChip
            name={CURRENT_USER.name}
            plan={CURRENT_USER.role}
            onMenu={onToggleUserMenu}
          />
        )}
      </div>
    </aside>
  );
}

function SectionLabel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        padding: "0 4px 8px",
        fontSize: "var(--text-overline-size)",
        letterSpacing: ".1em",
        textTransform: "uppercase",
        color: "var(--text-muted)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
