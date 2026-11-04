"use client";

import { usePathname, useRouter } from "next/navigation";
import { signOutAction } from "@/app/actions/auth";
import { useBusiness } from "@/components/business/business-provider";
import { BusinessSwitcher } from "@/components/business/business-switcher";
import { Avatar, Button, IconButton, NavItem, UserChip } from "@/components/ui";
import { OPTIONAL_MODULES } from "@/lib/data/businesses";
import { INTERNAL_NAV, WORKSPACE_NAV } from "@/lib/data/workspace";
import { businessRoleLabel } from "@/lib/business-roles";
import { roleLabel } from "@/lib/roles";
import type { ModuleKey, OptionalModuleKey } from "@/types";

export interface SidebarProps {
  collapsed: boolean;
  userMenuOpen: boolean;
  onToggleUserMenu: () => void;
  onCloseMenus: () => void;
  onNavigate: () => void;
  unreadCount: number;
}

export function Sidebar({
  collapsed,
  userMenuOpen,
  onToggleUserMenu,
  onCloseMenus,
  onNavigate,
  unreadCount,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { activeBusiness, businessRole, can, hasModule, isAdmin, user } = useBusiness();
  // Screens the role leaves out are not shown at all; a module the business
  // never bought stays visible, dimmed, as it always has.
  const workspaceNav = WORKSPACE_NAV.filter((item) => {
    const key = item.href.slice(1) as ModuleKey;
    return !activeBusiness.roleHidden.includes(key);
  });
  const optionalModules = OPTIONAL_MODULES.filter((module) => !activeBusiness.roleHidden.includes(module.key));
  // Owners see the Owner Board; the rest of the internal screens are AEGIS staff only.
  const internalNav = INTERNAL_NAV.filter((item) => (item.href === "/owner" ? can("ownerBoard") : isAdmin));

  const go = (href: string) => {
    onNavigate();
    router.push(href);
  };

  return (
    <aside
      className="aegis-no-print"
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
      <BusinessSwitcher collapsed={collapsed} onOpen={onCloseMenus} />

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
            {workspaceNav.map((item) => (
              <IconButton
                key={item.href}
                icon={item.icon}
                label={item.label}
                active={pathname.startsWith(item.href)}
                badge={item.href === "/mail" && unreadCount > 0}
                onClick={() => go(item.href)}
              />
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {workspaceNav.map((item) => (
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
          <Divider />
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
          {optionalModules.map((module) => {
            const key = module.key as OptionalModuleKey;
            const enabled = hasModule(key);
            // Entitled modules go to their own route. The rest land on the
            // module page, which explains that it is not switched on — the
            // design keeps them visible rather than hiding them.
            const href = enabled
              ? (module.href ?? `/modules/${key}`)
              : `/modules/${key}`;
            const hint = enabled
              ? `${module.name} — enabled for ${activeBusiness.name}`
              : `${module.name} — not enabled for ${activeBusiness.name}`;

            return (
              <div
                key={key}
                title={hint}
                style={{
                  display: "flex",
                  minWidth: 0,
                  justifyContent: collapsed ? "center" : "stretch",
                  opacity: enabled ? 1 : 0.55,
                }}
              >
                {collapsed ? (
                  <IconButton
                    icon={module.icon}
                    label={hint}
                    active={pathname === href}
                    onClick={() => go(href)}
                  />
                ) : (
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <NavItem
                      href={href}
                      icon={module.icon}
                      label={module.name}
                      badge={enabled ? undefined : "Off"}
                      active={pathname === href}
                      onClick={onNavigate}
                    />
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {internalNav.length > 0 && (
          <>
            {collapsed ? (
              <Divider />
            ) : (
              <SectionLabel style={{ paddingTop: "20px" }}>
                Internal
              </SectionLabel>
            )}

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: collapsed ? "6px" : "2px",
                alignItems: collapsed ? "center" : "stretch",
              }}
            >
              {internalNav.map((item) =>
                collapsed ? (
                  <IconButton
                    key={item.href}
                    icon={item.icon}
                    label={item.label}
                    active={pathname.startsWith(item.href)}
                    onClick={() => go(item.href)}
                  />
                ) : (
                  <span key={item.href} style={{ minWidth: 0 }}>
                    <NavItem
                      href={item.href}
                      icon={item.icon}
                      label={item.label}
                      badge={isAdmin ? "Admin" : "Owner"}
                      active={pathname.startsWith(item.href)}
                      onClick={onNavigate}
                    />
                  </span>
                ),
              )}
            </div>
          </>
        )}
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
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                icon="building-2"
                fullWidth
                style={{ justifyContent: "flex-start" }}
                onClick={() => go("/admin/businesses")}
              >
                Business Management
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              icon="user"
              fullWidth
              style={{ justifyContent: "flex-start" }}
              onClick={() => go("/modules/profile")}
            >
              Profile
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon="settings"
              fullWidth
              style={{ justifyContent: "flex-start" }}
              onClick={() => go("/account")}
            >
              Account Settings
            </Button>
            <div
              style={{
                height: 1,
                background: "var(--border-subtle)",
                margin: "4px",
              }}
            />
            <Button
              variant="danger"
              size="sm"
              icon="log-out"
              fullWidth
              onClick={() => signOutAction()}
            >
              Log out
            </Button>
          </div>
        )}

        {collapsed ? (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <Avatar name={user.name} ring />
          </div>
        ) : (
          /* The signed-in user, not a constant: this used to name one person
             whoever was actually signed in. */
          <UserChip
            name={user.name}
            plan={isAdmin ? roleLabel(user.role) : businessRoleLabel(businessRole)}
            onMenu={onToggleUserMenu}
          />
        )}
      </div>
    </aside>
  );
}

function Divider() {
  return (
    <div
      style={{
        height: 1,
        background: "var(--border-subtle)",
        margin: "14px 6px",
      }}
    />
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
