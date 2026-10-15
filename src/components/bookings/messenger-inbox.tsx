"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useToast } from "@/components/layout/toast-provider";
import { Badge, Button, Icon, SearchInput } from "@/components/ui";
import { activateOnKey } from "@/lib/interaction";
import { NewBookingModal } from "./new-booking-modal";
import type { AdCampaignOption, Customer, MessengerConversation, VehicleOption } from "@/types";

type ChatFilter = "Waiting" | "From ads" | "All";

export interface MessengerInboxProps {
  conversations: MessengerConversation[];
  vehicles: VehicleOption[];
  customers: Customer[] | null;
  fleetEnabled: boolean;
  campaigns: AdCampaignOption[];
  pageName: string | null;
}

/**
 * The chats customers have started with the business's Facebook Page, read
 * only. AEGIS never replies here; staff answer in Meta Business Suite. What
 * they do here is turn a chat into a booking request, which carries the ad the
 * chat started from automatically, and confirm it later from Bookings.
 */
export function MessengerInbox({ conversations, vehicles, customers, fleetEnabled, campaigns, pageName }: MessengerInboxProps) {
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = useState<ChatFilter>("Waiting");
  const [search, setSearch] = useState("");
  const [openPsid, setOpenPsid] = useState<string | null>(conversations[0]?.psid ?? null);
  const [composing, setComposing] = useState<MessengerConversation | null>(null);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return conversations.filter((chat) => {
      if (filter === "Waiting" && chat.bookings.length > 0) return false;
      if (filter === "From ads" && !chat.campaignId) return false;
      if (!term) return true;
      return (
        chat.label.toLowerCase().includes(term) ||
        (chat.campaignName ?? "").toLowerCase().includes(term) ||
        chat.messages.some((message) => message.text.toLowerCase().includes(term))
      );
    });
  }, [conversations, filter, search]);

  const open = conversations.find((chat) => chat.psid === openPsid) ?? null;
  const counts: Record<ChatFilter, number> = {
    Waiting: conversations.filter((chat) => chat.bookings.length === 0).length,
    "From ads": conversations.filter((chat) => chat.campaignId).length,
    All: conversations.length,
  };

  return (
    <>
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/bookings" className="inline-flex items-center gap-1.5" style={{ fontSize: "12.5px", color: "var(--text-secondary)", textDecoration: "none" }}>
              <Icon name="arrow-left" size={14} />
              Bookings
            </Link>
            <h2 style={{ margin: "4px 0 0", fontFamily: "var(--font-display)", fontSize: "22px", lineHeight: "28px", fontWeight: 700, letterSpacing: "-.02em" }}>
              Messenger
            </h2>
            <p style={{ margin: "3px 0 0", fontSize: "12.5px", color: "var(--text-secondary)" }}>
              {pageName ?? "Facebook Page"} · chats are read only; reply in Meta Business Suite
            </p>
          </div>
          <SearchInput placeholder="Search chats, campaigns..." value={search} onChange={setSearch} width={240} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(["Waiting", "From ads", "All"] as ChatFilter[]).map((option) => {
            const active = filter === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  height: 30,
                  padding: "0 12px",
                  borderRadius: "var(--radius-pill)",
                  border: `1px solid ${active ? "var(--blue-200)" : "var(--border-default)"}`,
                  cursor: "pointer",
                  fontFamily: "var(--font-body)",
                  fontSize: "12px",
                  fontWeight: active ? 700 : 500,
                  color: active ? "var(--blue-600)" : "var(--text-primary)",
                  background: active ? "var(--accent-soft)" : "var(--surface-card)",
                }}
              >
                {option === "Waiting" ? "No booking yet" : option}
                <span style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{counts[option]}</span>
              </button>
            );
          })}
        </div>

        <div className="grid gap-3.5 wide:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <section
            style={{
              background: "var(--surface-card)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-card)",
              padding: 8,
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
              alignSelf: "start",
            }}
          >
            {visible.map((chat) => {
              const select = () => setOpenPsid(chat.psid);
              return (
                <div
                  key={chat.psid}
                  role="button"
                  tabIndex={0}
                  onClick={select}
                  onKeyDown={activateOnKey(select)}
                  style={{
                    padding: "10px",
                    borderRadius: 10,
                    cursor: "pointer",
                    background: chat.psid === openPsid ? "var(--surface-active)" : "transparent",
                    borderBottom: "1px solid var(--gray-50)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                  }}
                >
                  <span className="flex items-center gap-2">
                    <span style={{ flex: 1, minWidth: 0, fontSize: "12.5px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {chat.label}
                    </span>
                    {chat.bookings.length > 0 ? (
                      <Badge tone="positive">{chat.bookings[0].ref}</Badge>
                    ) : (
                      <Badge tone="warning">No booking</Badge>
                    )}
                  </span>
                  <span style={{ fontSize: "11.5px", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {chat.lastMessage || "—"}
                  </span>
                  <span style={{ fontSize: "11px", color: chat.campaignName ? "var(--text-accent)" : "var(--text-muted)" }}>
                    {chat.campaignName ? `Ad: ${chat.campaignName}` : chat.campaignId ? "From an ad" : "Not from an ad"}
                  </span>
                </div>
              );
            })}
            {visible.length === 0 && (
              <div style={{ padding: "26px 10px", textAlign: "center", fontSize: "12.5px", color: "var(--text-muted)" }}>
                {conversations.length === 0
                  ? "No Messenger chats have arrived yet."
                  : filter === "Waiting"
                    ? "Every chat has a booking."
                    : "No chats match."}
              </div>
            )}
          </section>

          {open ? (
            <section
              style={{
                background: "var(--surface-card)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-lg)",
                boxShadow: "var(--shadow-card)",
                padding: 14,
                display: "flex",
                flexDirection: "column",
                gap: 12,
                minWidth: 0,
              }}
            >
              <div className="flex flex-wrap items-start gap-3">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: "15px", fontWeight: 700 }}>{open.label}</div>
                  <div style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>First message {open.firstSeen}</div>
                </div>
                <Button icon="calendar" onClick={() => setComposing(open)}>
                  {open.bookings.length > 0 ? "Create another booking" : "Create booking request"}
                </Button>
              </div>

              <div
                style={{
                  padding: "9px 11px",
                  borderRadius: "var(--radius-md)",
                  background: open.campaignId ? "var(--accent-soft)" : "var(--surface-inset)",
                  fontSize: "12px",
                }}
              >
                {open.campaignId ? (
                  <>
                    Started from an ad in <strong>{open.campaignName || open.campaignId}</strong>. Any booking made from
                    this chat is credited to it automatically, and that cannot be changed later.
                  </>
                ) : (
                  "This chat did not start from an ad Meta could name. A booking from it can be credited by hand if staff know the source."
                )}
              </div>

              {open.bookings.length > 0 && (
                <div className="flex flex-wrap items-center gap-2" style={{ fontSize: "12px" }}>
                  <span style={{ color: "var(--text-muted)" }}>Bookings from this chat:</span>
                  {open.bookings.map((booking) => (
                    <Badge key={booking.ref} tone={booking.status === "Pending" ? "warning" : booking.status === "Cancelled" ? "neutral" : "positive"}>
                      {booking.ref} · {booking.status} · {booking.day}
                    </Badge>
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-2" style={{ maxHeight: "56vh", overflowY: "auto", paddingRight: 4 }}>
                {open.messages.map((message) => (
                  <div
                    key={message.mid}
                    style={{
                      alignSelf: message.fromPage ? "flex-end" : "flex-start",
                      maxWidth: "80%",
                      padding: "8px 11px",
                      borderRadius: 12,
                      background: message.fromPage ? "var(--accent-soft)" : "var(--surface-inset)",
                      fontSize: "12.5px",
                      lineHeight: 1.45,
                      overflowWrap: "anywhere",
                    }}
                  >
                    <div>{message.text}</div>
                    <div style={{ fontSize: "10.5px", color: "var(--text-muted)", marginTop: 3 }}>
                      {message.fromPage ? `${pageName ?? "Page"} · ` : ""}
                      {message.at}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <div style={{ padding: 30, textAlign: "center", fontSize: "12.5px", color: "var(--text-muted)" }}>Pick a chat to read it.</div>
          )}
        </div>
      </div>

      {composing && (
        <NewBookingModal
          vehicles={vehicles}
          fleetEnabled={fleetEnabled}
          customers={customers}
          campaigns={campaigns}
          fromChat={{
            psid: composing.psid,
            label: composing.label,
            campaignName: composing.campaignId ? composing.campaignName || composing.campaignId : null,
            existingRef: composing.bookings[0]?.ref ?? null,
          }}
          onClose={() => setComposing(null)}
          onCreated={(ref) => {
            toast({
              tone: "success",
              title: `Booking request ${ref} created`,
              description: composing.campaignId
                ? `Credited to ${composing.campaignName || "the ad's campaign"}. It counts once staff confirm it.`
                : "Saved as Pending. Confirm it from Bookings once the time is agreed.",
            });
            setComposing(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
