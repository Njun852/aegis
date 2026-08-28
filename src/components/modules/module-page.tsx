"use client";

import { useRouter } from "next/navigation";
import { useBusiness } from "@/components/business/business-provider";
import { Badge, Button, Icon } from "@/components/ui";
import { findStubPage } from "@/lib/businesses";
import type { ModuleKey } from "@/types";

/** Business names can end in a period ("Calder & Sons Ltd."); don't double it. */
function sentence(text: string) {
  return text.replace(/\.\.+/g, ".");
}

export interface ModulePageProps {
  /** The `/modules/[key]` slug — a module key, or `profile` / `settings`. */
  moduleKey: string;
}

/**
 * The landing page for every destination that has no screen of its own yet, and
 * the locked state for a module the active business is not entitled to. The
 * sidebar keeps unentitled modules visible and routes them here, so the reason
 * they are dimmed is always one click away.
 */
export function ModulePage({ moduleKey }: ModulePageProps) {
  const router = useRouter();
  const { activeBusiness, hasModule } = useBusiness();

  const page = findStubPage(moduleKey);
  if (!page) {
    return (
      <Shell
        icon="circle-alert"
        enabled={false}
        title="Unknown module"
        body={`There is no module called "${moduleKey}".`}
        badge="Not found"
        badgeIcon="circle-alert"
        onBack={() => router.push("/dashboard")}
        onConfigure={() => router.push("/admin/businesses")}
      />
    );
  }

  const enabled = page.core || hasModule(page.key as ModuleKey);

  return (
    <Shell
      icon={page.icon}
      enabled={enabled}
      title={page.name}
      body={sentence(
        enabled
          ? `${page.desc} Nothing to show yet for ${activeBusiness.name} — this module populates after its first sync.`
          : `${page.name} is not enabled for ${activeBusiness.name}. An AEGIS admin can switch it on in Business Management.`,
      )}
      badge={
        enabled
          ? `Enabled for ${activeBusiness.name}`
          : `Not enabled for ${activeBusiness.name}`
      }
      badgeIcon={enabled ? "shield-check" : "lock"}
      onBack={() => router.push("/dashboard")}
      onConfigure={() =>
        router.push(`/admin/businesses/${activeBusiness.id}`)
      }
    />
  );
}

interface ShellProps {
  icon: string;
  enabled: boolean;
  title: string;
  body: string;
  badge: string;
  badgeIcon: string;
  onBack: () => void;
  onConfigure: () => void;
}

function Shell({
  icon,
  enabled,
  title,
  body,
  badge,
  badgeIcon,
  onBack,
  onConfigure,
}: ShellProps) {
  return (
    <div
      style={{
        maxWidth: 620,
        margin: "6vh auto 0",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "14px",
        textAlign: "center",
      }}
    >
      <span
        style={{
          width: 56,
          height: 56,
          borderRadius: "var(--radius-lg)",
          background: enabled ? "var(--accent-soft)" : "var(--surface-inset)",
          color: enabled ? "var(--accent-primary)" : "var(--text-muted)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={icon} size={24} />
      </span>

      <div>
        <h2
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontSize: "22px",
            fontWeight: 700,
            letterSpacing: "-.02em",
            overflowWrap: "anywhere",
          }}
        >
          {title}
        </h2>
        <p
          style={{
            margin: "6px 0 0",
            fontSize: "13px",
            color: "var(--text-secondary)",
            textWrap: "pretty",
            overflowWrap: "anywhere",
          }}
        >
          {body}
        </p>
      </div>

      <Badge tone={enabled ? "positive" : "neutral"} icon={badgeIcon}>
        {badge}
      </Badge>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginTop: "2px",
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        <Button variant="outline" icon="arrow-left" onClick={onBack}>
          Back to Dashboard
        </Button>
        <Button icon="sliders-horizontal" onClick={onConfigure}>
          Configure modules
        </Button>
      </div>
    </div>
  );
}
