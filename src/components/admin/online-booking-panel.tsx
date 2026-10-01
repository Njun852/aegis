"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import { setOnlineBookingAction } from "@/app/actions/business";
import { useToast } from "@/components/layout/toast-provider";
import { Badge, Button, Card, Icon } from "@/components/ui";
import type { OnlineBookingStatus } from "@/types";

export interface OnlineBookingPanelProps {
  businessId: string;
  businessName: string;
  status: OnlineBookingStatus;
}

/** The page's origin never changes while it is open, so there is nothing to subscribe to. */
const noSubscription = () => () => {};

/** "AUTOBLITZ Motors" → "autoblitz-motors", as a first suggestion for the link. */
function suggestSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * Opens or closes the public booking page for one business. Opening it
 * publishes a page anyone can reach without an account, so the switch asks
 * first and the page stays closed until an admin says so.
 */
export function OnlineBookingPanel({ businessId, businessName, status }: OnlineBookingPanelProps) {
  const router = useRouter();
  const toast = useToast();
  const [slug, setSlug] = useState(status.slug ?? suggestSlug(businessName));
  const [error, setError] = useState<string | null>(null);
  const [busy, startWork] = useTransition();
  // The origin is only known in the browser; on the server the link shows as a path.
  const origin = useSyncExternalStore(
    noSubscription,
    () => window.location.origin,
    () => "",
  );

  const url = `${origin}/book/${status.slug ?? slug}`;

  const save = (enabled: boolean) => {
    if (
      enabled &&
      !status.enabled &&
      !window.confirm(
        `Open ${url} for ${businessName}? Anyone with the link can send a booking request, without an account. Requests arrive in Bookings as Pending.`,
      )
    ) {
      return;
    }
    setError(null);
    startWork(async () => {
      try {
        const result = await setOnlineBookingAction(businessId, { enabled, slug });
        if (!result.ok) {
          setError(result.error);
          toast({ tone: "error", title: "Booking page not saved", description: result.error, key: "online-booking" });
          return;
        }
        router.refresh();
        toast({
          tone: enabled ? "success" : "info",
          title: enabled ? "Booking page is open" : status.enabled ? "Booking page closed" : "Link saved",
          description: enabled
            ? `Customers can book at /book/${slug.trim().toLowerCase()}.`
            : "The page now shows as unavailable. Requests already received are kept.",
          key: "online-booking",
        });
      } catch {
        toast({
          tone: "error",
          title: "Booking page not saved",
          description: "The change did not save. Please try again.",
          key: "online-booking",
        });
      }
    });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ tone: "success", title: "Link copied", key: "online-booking-copy" });
    } catch {
      toast({ tone: "error", title: "Could not copy the link", description: url, key: "online-booking-copy" });
    }
  };

  return (
    <Card
      title="Online booking page"
      padding="18px"
      action={
        <Badge tone={status.enabled ? "positive" : "neutral"} icon={status.enabled ? "check" : "minus"}>
          {status.enabled ? "OPEN" : "CLOSED"}
        </Badge>
      }
    >
      <div className="flex flex-col gap-2.5">
        {!status.hasBookings && (
          <Notice>
            {businessName} does not have the Bookings module. Grant it above before
            opening the page; requests land in Bookings.
          </Notice>
        )}

        {status.enabled && (
          <div
            className="flex flex-wrap items-center gap-2"
            style={{
              padding: "9px 11px",
              borderRadius: "var(--radius-md)",
              background: "var(--surface-inset)",
              fontSize: "12.5px",
            }}
          >
            <Icon name="external-link" size={14} />
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              style={{ fontFamily: "var(--font-mono)", color: "var(--accent-primary)", overflowWrap: "anywhere", flex: 1, minWidth: 0 }}
            >
              {url}
            </a>
            <Button size="sm" variant="ghost" icon="copy" onClick={copy}>
              Copy
            </Button>
          </div>
        )}

        <label className="flex flex-col gap-1.5">
          <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)" }}>Link name</span>
          <div className="flex items-center" style={{ gap: 6 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "12.5px", color: "var(--text-muted)" }}>/book/</span>
            <input
              value={slug}
              onChange={(event) => setSlug(event.target.value.toLowerCase())}
              placeholder="autoblitz"
              autoComplete="off"
              style={{
                flex: 1,
                minWidth: 0,
                font: "inherit",
                fontFamily: "var(--font-mono)",
                fontSize: "12.5px",
                color: "var(--text-primary)",
                background: "var(--surface-card)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md)",
                padding: "8px 11px",
                outline: "none",
              }}
            />
          </div>
        </label>

        <p style={{ margin: 0, fontSize: "11.5px", lineHeight: "17px", color: "var(--text-muted)" }}>
          Customers pick a time Monday to Saturday, 8:00 AM to 4:00 PM starts, up to 60 days
          ahead, two bookings per hour at most, counting bookings staff make here. Each
          request gets a code the customer can use with their mobile number to check its
          status. Requests received so far: {status.requestCount}.
        </p>

        {error && <Notice>{error}</Notice>}

        <div className="flex flex-wrap items-center gap-2">
          {status.enabled ? (
            <>
              <Button icon="check" disabled={busy || slug === status.slug} onClick={() => save(true)}>
                {busy ? "Saving…" : "Change link"}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => save(false)}>
                Close the page
              </Button>
            </>
          ) : (
            <Button icon="check" disabled={busy || !status.hasBookings} onClick={() => save(true)}>
              {busy ? "Saving…" : "Open booking page"}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2"
      style={{
        padding: "9px 11px",
        borderRadius: "var(--radius-md)",
        background: "var(--status-warning-soft)",
        fontSize: "12.5px",
        lineHeight: "18px",
        color: "var(--text-secondary)",
        overflowWrap: "anywhere",
      }}
    >
      <span style={{ color: "var(--status-warning)", flexShrink: 0, display: "inline-flex", paddingTop: 2 }}>
        <Icon name="alert-triangle" size={14} />
      </span>
      <span>{children}</span>
    </div>
  );
}
