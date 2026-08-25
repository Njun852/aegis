"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { useBusiness } from "@/components/business/business-provider";
import { Badge, Button, Icon } from "@/components/ui";
import { saveModuleGrantsAction } from "@/app/actions/business";
import { sameGrants } from "@/lib/businesses";
import { CORE_MODULES, OPTIONAL_MODULES } from "@/lib/data/businesses";
import type { OptionalModuleKey } from "@/types";

export interface BusinessDetailProps {
  businessId: string;
}

/**
 * Grants optional modules to one business. Edits are held as a draft until
 * saved, so a mis-click never changes what a customer can reach.
 */
export function BusinessDetail({ businessId }: BusinessDetailProps) {
  const router = useRouter();
  const { businesses, switchBusiness } = useBusiness();
  const [saving, startTransition] = useTransition();

  const business = businesses.find((entry) => entry.id === businessId);
  const saved = useMemo(() => business?.modules ?? [], [business]);

  const [draft, setDraft] = useState<OptionalModuleKey[]>(saved);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  if (!business) {
    return (
      <div
        style={{
          padding: "40px 0",
          textAlign: "center",
          fontSize: "13px",
          color: "var(--text-muted)",
        }}
      >
        No business with id {businessId}.
      </div>
    );
  }

  const dirty = !sameGrants(draft, saved);

  const toggle = (key: OptionalModuleKey) => {
    setDraft((current) =>
      current.includes(key)
        ? current.filter((entry) => entry !== key)
        : [...current, key],
    );
    setSavedAt(null);
  };

  const commit = () => {
    startTransition(async () => {
      await saveModuleGrantsAction(businessId, draft);
      setSavedAt(
        new Date().toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        }),
      );
      // Pull the new grant into every other screen reading it (the sidebar
      // unlocks the module immediately, without a reload).
      router.refresh();
    });
  };

  const openAsClient = () => switchBusiness(businessId);

  const saveNote = dirty
    ? `Unsaved changes to ${business.name} · module access updates at next sign-in`
    : savedAt
      ? `All changes saved · ${savedAt}`
      : `No pending changes for ${business.name}`;

  return (
    <div className="flex max-w-[1080px] flex-col gap-3.5">
      <div
        className="flex items-center gap-2.5"
        style={{ fontSize: "12.5px", color: "var(--text-muted)" }}
      >
        <button
          type="button"
          onClick={() => router.push("/admin/businesses")}
          style={{
            border: "none",
            background: "none",
            padding: 0,
            cursor: "pointer",
            color: "var(--accent-primary)",
            fontFamily: "var(--font-body)",
            fontSize: "12.5px",
            fontWeight: 600,
          }}
        >
          Businesses
        </button>
        <Icon name="chevron-right" size={14} color="var(--text-muted)" />
        <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
          {business.name}
        </span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            style={{
              width: 44,
              height: 44,
              flex: "0 0 auto",
              borderRadius: "var(--radius-md)",
              background: "var(--accent-soft)",
              color: "var(--accent-primary)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="building-2" size={20} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--font-display)",
                fontSize: "22px",
                lineHeight: "28px",
                fontWeight: 700,
                letterSpacing: "-.02em",
                overflowWrap: "anywhere",
              }}
            >
              {business.name}
            </h2>
            <p
              className="flex flex-wrap items-center gap-2"
              style={{
                margin: "3px 0 0",
                fontSize: "12px",
                color: "var(--text-secondary)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "var(--text-muted)",
                }}
              >
                {business.id}
              </span>
              <span style={{ color: "var(--border-strong)" }}>·</span>
              <span>{business.meta}</span>
              <span style={{ color: "var(--border-strong)" }}>·</span>
              <span>Onboarded {business.onboarded}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <Badge tone="positive" icon="shield-check">
            Active
          </Badge>
          <Button variant="outline" icon="external-link" onClick={openAsClient}>
            Open as client
          </Button>
        </div>
      </div>

      <section
        style={{
          background: "var(--gray-25)",
          border: "1px dashed var(--border-default)",
          borderRadius: "var(--radius-lg)",
          padding: "16px 18px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3.5">
          <div className="flex flex-col gap-0.5">
            <span
              className="flex items-center gap-2"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "13.5px",
                fontWeight: 700,
                letterSpacing: "-.01em",
              }}
            >
              <Icon name="lock" size={14} color="var(--text-muted)" />
              Core Modules
            </span>
            <span
              style={{
                fontSize: "11.5px",
                color: "var(--text-secondary)",
                textWrap: "pretty",
              }}
            >
              Dashboard, Mail and Ads are included with every AEGIS business and
              can&apos;t be turned off.
            </span>
          </div>
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            {CORE_MODULES.length} of {CORE_MODULES.length} always on
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2.5 wide:grid-cols-3">
          {CORE_MODULES.map((module) => (
            <div
              key={module.key}
              className="flex items-center gap-2.5"
              style={{
                padding: "10px 12px",
                background: "var(--surface-card)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md)",
                minWidth: 0,
              }}
            >
              <span
                style={{
                  width: 30,
                  height: 30,
                  flex: "0 0 auto",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--surface-inset)",
                  color: "var(--text-secondary)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name={module.icon} size={15} />
              </span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span style={{ fontSize: "12.5px", fontWeight: 600 }}>
                  {module.name}
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    color: "var(--text-muted)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {module.desc}
                </span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section
        style={{
          background: "var(--surface-card)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-card)",
          padding: "18px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          minWidth: 0,
        }}
      >
        <div className="flex flex-wrap items-end justify-between gap-3.5">
          <div className="flex flex-col gap-0.5">
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "13.5px",
                fontWeight: 700,
                letterSpacing: "-.01em",
              }}
            >
              Optional Modules
            </span>
            <span
              style={{
                fontSize: "11.5px",
                color: "var(--text-secondary)",
                textWrap: "pretty",
              }}
            >
              Switch on the modules this business has bought. Changes apply to
              their sidebar at next sign-in.
            </span>
          </div>
          <span
            style={{
              fontSize: "11.5px",
              color: "var(--text-secondary)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {draft.length} of {OPTIONAL_MODULES.length} enabled ·{" "}
            {CORE_MODULES.length + draft.length} modules total
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {OPTIONAL_MODULES.map((module) => {
            const key = module.key as OptionalModuleKey;
            const on = draft.includes(key);

            return (
              <button
                key={key}
                type="button"
                role="switch"
                aria-checked={on}
                onClick={() => toggle(key)}
                className="flex items-center gap-3"
                style={{
                  padding: "13px 12px",
                  borderTop: "1px solid var(--border-subtle)",
                  borderLeft: "none",
                  borderRight: "none",
                  borderBottom: "none",
                  borderRadius: "10px",
                  cursor: "pointer",
                  background: "transparent",
                  textAlign: "left",
                  fontFamily: "var(--font-body)",
                  color: "var(--text-primary)",
                  transition: "background var(--dur-fast) var(--ease-standard)",
                }}
              >
                <span
                  style={{
                    width: 36,
                    height: 36,
                    flex: "0 0 auto",
                    borderRadius: "9px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition:
                      "background var(--dur-fast) var(--ease-standard)",
                    background: on
                      ? "var(--accent-soft)"
                      : "var(--surface-inset)",
                    color: on ? "var(--accent-primary)" : "var(--text-muted)",
                  }}
                >
                  <Icon name={module.icon} size={17} />
                </span>

                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span style={{ fontSize: "13.5px", fontWeight: 600 }}>
                      {module.name}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "10px",
                        color: "var(--text-muted)",
                      }}
                    >
                      {module.key}
                    </span>
                  </span>
                  <span
                    style={{
                      fontSize: "11.5px",
                      color: "var(--text-secondary)",
                      textWrap: "pretty",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {module.desc}
                  </span>
                </span>

                <span
                  style={{
                    width: 74,
                    flex: "0 0 auto",
                    textAlign: "right",
                    fontSize: "11.5px",
                    fontWeight: 600,
                    color: on ? "var(--status-positive)" : "var(--text-muted)",
                  }}
                >
                  {on ? "Enabled" : "Disabled"}
                </span>

                <span
                  style={{
                    width: 42,
                    height: 24,
                    flex: "0 0 auto",
                    borderRadius: "var(--radius-pill)",
                    padding: 3,
                    display: "inline-flex",
                    alignItems: "center",
                    transition:
                      "background var(--dur-fast) var(--ease-standard)",
                    background: on
                      ? "var(--accent-primary)"
                      : "var(--border-strong)",
                  }}
                >
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "var(--radius-pill)",
                      background: "#fff",
                      boxShadow: "0 1px 2px rgba(23,28,37,.25)",
                      transition:
                        "transform var(--dur-normal) var(--ease-standard)",
                      transform: on ? "translateX(18px)" : "translateX(0)",
                    }}
                  />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div
        className="flex flex-wrap items-center justify-between gap-4"
        style={{
          padding: "12px 16px",
          background: "var(--surface-card)",
          border: "1px solid var(--border-default)",
          borderRadius: "14px",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <span
          className="flex items-center gap-2.5"
          style={{ fontSize: "12px", color: "var(--text-secondary)" }}
        >
          <Icon
            name={dirty ? "circle-alert" : "check-circle-2"}
            size={14}
            color={
              dirty ? "var(--status-warning)" : "var(--status-positive)"
            }
          />
          {saveNote}
        </span>
        <span className="flex items-center gap-2.5">
          <Button
            variant="ghost"
            disabled={!dirty || saving}
            onClick={() => {
              setDraft(saved);
              setSavedAt(null);
            }}
          >
            Discard
          </Button>
          <Button icon="check" disabled={!dirty || saving} onClick={commit}>
            {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </Button>
        </span>
      </div>
    </div>
  );
}
