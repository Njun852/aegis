"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useToast } from "@/components/layout/toast-provider";
import { Badge, Button, Card, Icon } from "@/components/ui";
import type { BadgeTone } from "@/components/ui";
import { relativeAge } from "@/lib/freshness";
import type { IntegrationState, SystemStatus } from "@/types";

/**
 * The four states the acceptance checklist names, and how each one reads.
 *
 * DISCONNECTED is deliberately neutral rather than red: a mailbox nobody has
 * connected yet is not a fault, and colouring it as one would train the owner
 * to ignore the colour that means something is actually broken.
 */
const STATE_TONES: Record<IntegrationState, { tone: BadgeTone; icon: string }> = {
  ONLINE: { tone: "positive", icon: "check" },
  DISCONNECTED: { tone: "neutral", icon: "minus" },
  ERROR: { tone: "negative", icon: "alert-triangle" },
  STALE: { tone: "warning", icon: "clock" },
};

export function StatusBoard({ status }: { status: SystemStatus }) {
  const router = useRouter();
  const toast = useToast();
  const [rechecking, startRecheck] = useTransition();

  const recheck = () => {
    // The toast is deliberately outside the transition: a notification queued
    // inside one is applied with the transition's own priority and never
    // reaches the screen before the refresh replaces the tree.
    startRecheck(() => router.refresh());
    toast({
      tone: "info",
      title: "Status re-checked",
      description: "Every integration was read again just now.",
      key: "status-recheck",
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-3)",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-h2-size)",
              lineHeight: "var(--text-h2-lh)",
              fontWeight: 650,
              color: "var(--text-primary)",
            }}
          >
            System status
          </h2>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            Every reading below was taken when this page loaded — checked{" "}
            {relativeAge(status.checkedAt)}.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={recheck}
          disabled={rechecking}
          icon="refresh-cw"
        >
          {rechecking ? "Checking…" : "Re-check now"}
        </Button>
      </div>

      <div className="grid gap-4 wide:grid-cols-2">
        {status.integrations.map((integration) => {
          const state = STATE_TONES[integration.state];

          return (
            <Card
              key={integration.key}
              title={integration.label}
              padding="16px"
              action={
                <Badge tone={state.tone} icon={state.icon}>
                  {integration.state}
                </Badge>
              }
            >
              <p
                style={{
                  fontSize: "13px",
                  lineHeight: "19px",
                  color: "var(--text-secondary)",
                  overflowWrap: "anywhere",
                }}
              >
                {integration.detail}
              </p>
              <dl
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, auto) minmax(0, 1fr)",
                  columnGap: "var(--space-4)",
                  rowGap: "6px",
                  fontSize: "12.5px",
                  margin: 0,
                }}
              >
                {integration.facts.map((fact) => (
                  <div key={fact.label} style={{ display: "contents" }}>
                    <dt style={{ color: "var(--text-muted)" }}>{fact.label}</dt>
                    <dd
                      style={{
                        margin: 0,
                        color: "var(--text-primary)",
                        fontVariantNumeric: "tabular-nums",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {fact.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          );
        })}
      </div>

      <Card title="Recent failures" padding="16px">
        {status.failures.length === 0 ? (
          <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            No failed model calls have been recorded. Every call is logged with
            its outcome, so an empty list here means there is nothing to see —
            not that nothing is being watched.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {status.failures.map((failure) => (
              <div
                key={`${failure.at}-${failure.surface}`}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--surface-inset)",
                }}
              >
                <span style={{ color: "var(--status-negative)", flexShrink: 0 }}>
                  <Icon name="alert-triangle" size={15} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    {failure.surface} — {failure.outcome}
                  </div>
                  <div
                    style={{
                      fontSize: "12.5px",
                      color: "var(--text-secondary)",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {failure.detail}
                  </div>
                  <div style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                    {relativeAge(failure.at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
