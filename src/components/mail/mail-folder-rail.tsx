"use client";

import { Button, Icon, NavItem } from "@/components/ui";
import { MAIL_MONITORING } from "@/lib/data/mail";
import type {
  MailFlagFilter,
  MailFolder,
  MailFolderName,
  MailPriorityFilter,
  MailPriorityOption,
} from "@/types";

export interface MailFolderRailProps {
  folders: MailFolder[];
  activeFolder: MailFolderName;
  onSelectFolder: (folder: MailFolderName) => void;
  priorities: MailPriorityOption[];
  activePriority: MailPriorityFilter;
  onSelectPriority: (priority: MailPriorityFilter) => void;
  /** Needs Action / Unread — the two cross-cutting views the checklist asks for. */
  flags: { label: MailFlagFilter; icon: string; count: number }[];
  activeFlag: MailFlagFilter;
  onSelectFlag: (flag: MailFlagFilter) => void;
  onCompose: () => void;
}

export function MailFolderRail({
  folders,
  activeFolder,
  onSelectFolder,
  priorities,
  activePriority,
  onSelectPriority,
  flags,
  activeFlag,
  onSelectFlag,
  onCompose,
}: MailFolderRailProps) {
  return (
    <section
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-card)",
        padding: "14px",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        minHeight: 0,
        overflowY: "auto",
      }}
    >
      <div style={{ marginBottom: "8px" }}>
        <Button variant="primary" size="md" icon="pen-line" fullWidth onClick={onCompose}>
          Compose
        </Button>
      </div>

      {folders.map((folder) => (
        <NavItem
          key={folder.label}
          icon={folder.icon}
          label={folder.label}
          active={folder.label === activeFolder}
          badge={folder.count}
          onClick={() => onSelectFolder(folder.label)}
        />
      ))}

      <Divider />
      <RailLabel>Show</RailLabel>

      {flags.map((flag) => {
        const active = flag.label === activeFlag;
        return (
          <button
            key={flag.label}
            type="button"
            onClick={() => onSelectFlag(flag.label)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "9px",
              padding: "8px 10px",
              border: "none",
              borderRadius: "var(--radius-sm)",
              fontSize: "12.5px",
              cursor: "pointer",
              textAlign: "left",
              background: active ? "#EAF1FE" : "transparent",
              color: active ? "var(--text-accent)" : "var(--text-primary)",
              fontWeight: active ? 700 : 500,
              fontFamily: "var(--font-body)",
            }}
          >
            <Icon name={flag.icon} size={14} />
            <span>{flag.label}</span>
            <span
              style={{
                marginLeft: "auto",
                fontSize: "11px",
                color: "var(--text-muted)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {flag.count}
            </span>
          </button>
        );
      })}

      <Divider />
      <RailLabel>AI Priority</RailLabel>

      {priorities.map((priority) => {
        const active = priority.label === activePriority;
        return (
          <button
            key={priority.label}
            type="button"
            onClick={() => onSelectPriority(priority.label)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "9px",
              padding: "8px 10px",
              border: "none",
              borderRadius: "var(--radius-sm)",
              fontSize: "12.5px",
              cursor: "pointer",
              textAlign: "left",
              background: active ? "#EAF1FE" : "transparent",
              color: active ? "var(--text-accent)" : "var(--text-primary)",
              fontWeight: active ? 700 : 500,
              fontFamily: "var(--font-body)",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "var(--radius-pill)",
                background: priority.dot,
              }}
            />
            <span>{priority.label}</span>
            <span
              style={{
                marginLeft: "auto",
                fontSize: "11px",
                color: "var(--text-muted)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {priority.count}
            </span>
          </button>
        );
      })}

      <Divider />
      <RailLabel>Monitoring</RailLabel>
      <div className="flex flex-col gap-[9px] px-1 pt-0.5 pb-1">
        {MAIL_MONITORING.map((entry) => (
          <div key={entry.label} className="flex items-start gap-2">
            <span
              style={{
                width: 7,
                height: 7,
                flex: "0 0 auto",
                marginTop: 5,
                borderRadius: "var(--radius-pill)",
                background: entry.dot,
              }}
            />
            <span className="flex min-w-0 flex-col">
              <span style={{ fontSize: "11.5px", color: "var(--text-primary)" }}>
                {entry.label}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  color: "var(--text-muted)",
                }}
              >
                {entry.meta}
              </span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Divider() {
  return (
    <div
      style={{
        height: 1,
        background: "var(--border-subtle)",
        margin: "12px 4px",
      }}
    />
  );
}

function RailLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "0 4px 8px",
        fontSize: "var(--text-overline-size)",
        letterSpacing: ".1em",
        textTransform: "uppercase",
        color: "var(--text-muted)",
      }}
    >
      {children}
    </div>
  );
}
