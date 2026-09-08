"use client";

import { usePathname } from "next/navigation";
import { useBusiness } from "@/components/business/business-provider";
import { Avatar, IconButton } from "@/components/ui";
import { routeTitle } from "@/lib/navigation";
import type { FreshnessTone } from "@/lib/freshness";

export interface TopbarProps {
  onToggleSidebar: () => void;
  lastSync: string;
  /** Whether data of that age may still be presented as current. */
  syncTone: FreshnessTone;
  /** False until a real mailbox is connected. */
  mailboxConnected: boolean;
  hasNotifications?: boolean;
}

/**
 * How the freshness pill looks in each state. Stale and never both stop the dot
 * pulsing: a green heartbeat over months-old data is the exact thing this line
 * exists to prevent.
 */
const SYNC_TONES: Record<
  FreshnessTone,
  { dot: string; border: string; pulse: boolean }
> = {
  fresh: {
    dot: "var(--status-positive)",
    border: "var(--border-default)",
    pulse: true,
  },
  stale: {
    dot: "var(--status-warning)",
    border: "var(--status-warning)",
    pulse: false,
  },
  never: {
    dot: "var(--text-muted)",
    border: "var(--border-default)",
    pulse: false,
  },
};

/**
 * The pill as a sentence. Each state has to read correctly on its own, because
 * this is the one line on every screen that says whether what is on it is
 * current — "Last sync never" would be worse than saying nothing.
 */
function syncPhrase(
  connected: boolean,
  tone: FreshnessTone,
  age: string,
): { caption: string; value: string } {
  // There is no sample inbox any more — an unconnected mailbox simply has
  // nothing behind it, and saying so is the whole point of this line.
  if (!connected) {
    return { caption: "No mailbox connected", value: "" };
  }
  if (tone === "never") return { caption: "No mail retrieved", value: "" };
  if (tone === "stale") return { caption: "Stale — last sync", value: age };
  return { caption: "Last sync", value: age };
}

export function Topbar({
  onToggleSidebar,
  lastSync,
  syncTone,
  mailboxConnected,
  hasNotifications,
}: TopbarProps) {
  const pathname = usePathname();
  const { businesses, user } = useBusiness();
  const title = routeTitle(pathname, businesses);
  // A disconnected mailbox can never be fresh, whatever the data's age says.
  const tone = SYNC_TONES[mailboxConnected ? syncTone : "never"];
  const phrase = syncPhrase(mailboxConnected, syncTone, lastSync);

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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "7px",
            padding: "6px 11px",
            border: `1px solid ${tone.border}`,
            borderRadius: "var(--radius-pill)",
            background: "var(--surface-card)",
            whiteSpace: "nowrap",
          }}
          title={
            mailboxConnected
              ? "How long ago AEGIS last retrieved mail."
              : "No mailbox is connected. Mail is showing the seeded sample inbox."
          }
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "var(--radius-pill)",
              background: tone.dot,
              animation: tone.pulse
                ? "aegis-pulse-dot 2.4s ease-in-out infinite"
                : undefined,
            }}
          />
          <span style={{ fontSize: "11.5px", color: "var(--text-secondary)" }}>
            {phrase.caption}
            {phrase.value && (
              <>
                {" "}
                <span
                  style={{
                    color: "var(--text-primary)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {phrase.value}
                </span>
              </>
            )}
          </span>
        </div>
        <IconButton icon="bell" badge={hasNotifications} label="Notifications" />
        <Avatar name={user.name} ring />
      </div>
    </header>
  );
}
