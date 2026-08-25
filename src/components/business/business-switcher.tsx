"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Icon } from "@/components/ui";
import { activeModuleCount } from "@/lib/businesses";
import { ORGANIZATION } from "@/lib/data/workspace";
import { useBusiness } from "./business-provider";

export interface BusinessSwitcherProps {
  collapsed: boolean;
  /** Lets the shell close its other popovers when this one opens. */
  onOpen?: () => void;
}

/**
 * The sidebar header doubles as the tenant switcher: picking a business swaps
 * the whole workspace, including which modules the nav below it offers.
 */
export function BusinessSwitcher({ collapsed, onOpen }: BusinessSwitcherProps) {
  const router = useRouter();
  const { businesses, activeBusiness, activeBusinessId, switchBusiness, isAdmin } =
    useBusiness();
  const [open, setOpen] = useState(false);

  const toggle = () => {
    setOpen((isOpen) => {
      if (!isOpen) onOpen?.();
      return !isOpen;
    });
  };

  const pick = (id: string) => {
    setOpen(false);
    // The action writes the cookie and routes; the DAL re-checks membership.
    switchBusiness(id);
  };

  const goAdmin = () => {
    setOpen(false);
    router.push("/admin/businesses");
  };

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        title="Switch business"
        aria-expanded={open}
        style={{
          height: "var(--topbar-height)",
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "0 12px 0 16px",
          border: "none",
          borderBottom: "1px solid var(--border-subtle)",
          background: open ? "var(--surface-hover)" : "transparent",
          cursor: "pointer",
          textAlign: "left",
          color: "var(--text-primary)",
          fontFamily: "var(--font-body)",
          transition: "background var(--dur-fast) var(--ease-standard)",
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
          <>
            <span
              style={{
                display: "flex",
                flex: 1,
                minWidth: 0,
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
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {activeBusiness.name}
              </span>
            </span>
            <Icon name="chevrons-up-down" size={15} color="var(--text-muted)" />
          </>
        )}
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 79 }}
          />
          <div
            style={{
              position: "fixed",
              top: 60,
              left: 14,
              width: 264,
              zIndex: 80,
              background: "var(--surface-raised)",
              border: "1px solid var(--border-default)",
              borderRadius: "14px",
              boxShadow: "var(--shadow-popover)",
              padding: "6px",
              display: "flex",
              flexDirection: "column",
              gap: "2px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "7px 9px 5px",
              }}
            >
              <span
                style={{
                  fontSize: "var(--text-overline-size)",
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                  color: "var(--text-muted)",
                }}
              >
                Switch business
              </span>
              <span
                style={{
                  fontSize: "var(--text-overline-size)",
                  color: "var(--text-muted)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {businesses.length} total
              </span>
            </div>

            {businesses.map((business) => {
              const current = business.id === activeBusinessId;
              return (
                <button
                  key={business.id}
                  type="button"
                  aria-label={`Switch to ${business.name}`}
                  aria-current={current}
                  onClick={() => pick(business.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "9px",
                    padding: "8px 9px",
                    border: "none",
                    borderRadius: "9px",
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "var(--font-body)",
                    color: "var(--text-primary)",
                    background: current
                      ? "var(--surface-active)"
                      : "transparent",
                  }}
                >
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      flex: "0 0 auto",
                      borderRadius: "7px",
                      background: "var(--accent-soft)",
                      color: "var(--accent-primary)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="building-2" size={13} />
                  </span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: "flex",
                      flexDirection: "column",
                      lineHeight: 1.25,
                    }}
                  >
                    <span
                      style={{
                        fontSize: "12.5px",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {business.name}
                    </span>
                    <span
                      style={{
                        fontSize: "10.5px",
                        color: "var(--text-muted)",
                      }}
                    >
                      {activeModuleCount(business)} modules active
                    </span>
                  </span>
                  {current && (
                    <Icon name="check" size={14} color="var(--accent-primary)" />
                  )}
                </button>
              );
            })}

            {isAdmin && (
              <>
                <div
                  style={{
                    height: 1,
                    background: "var(--border-subtle)",
                    margin: "4px",
                  }}
                />
                <button
                  type="button"
                  aria-label="Manage businesses and modules"
                  onClick={goAdmin}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "9px",
                    padding: "9px",
                    border: "none",
                    borderRadius: "9px",
                    cursor: "pointer",
                    background: "transparent",
                    fontFamily: "var(--font-body)",
                    color: "var(--text-primary)",
                    textAlign: "left",
                  }}
                >
                  <Icon
                    name="sliders-horizontal"
                    size={14}
                    color="var(--text-secondary)"
                  />
                  <span
                    style={{ flex: 1, fontSize: "12.5px", fontWeight: 600 }}
                  >
                    Manage businesses &amp; modules
                  </span>
                  <Badge tone="accent">Admin</Badge>
                </button>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
