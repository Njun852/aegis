"use client";

import { useState } from "react";
import { Badge, Button, Icon, SearchInput } from "@/components/ui";
import { formatMoney } from "@/lib/format";

export type FolderLayout = "folders" | "list";

/** One company's records, as a folder in Payables or Receivables. */
export interface CompanyFolder {
  key: string;
  name: string;
  /** Records in the view being looked at. */
  count: number;
  outstandingCents: number;
  /** Records that need attention: overdue bills, invoices over 90 days. */
  alertCount: number;
}

/**
 * Records are filed under their supplier or customer record when they have
 * one, and under the typed name when they do not, so a free-text payee still
 * gets one folder however its letters were cased.
 */
export function folderKey(ref: string | null, name: string) {
  return ref ?? `name:${name.trim().toLowerCase()}`;
}

/** Whether two typed company names are the same company. */
export function sameName(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Folders for every company with a record in `records`, most owed first. */
export function buildFolders<T>(
  records: T[],
  describe: (record: T) => { key: string; name: string; outstandingCents: number; alert: boolean },
): CompanyFolder[] {
  const folders = new Map<string, CompanyFolder>();
  for (const record of records) {
    const { key, name, outstandingCents, alert } = describe(record);
    const folder = folders.get(key) ?? { key, name, count: 0, outstandingCents: 0, alertCount: 0 };
    folder.count += 1;
    folder.outstandingCents += outstandingCents;
    if (alert) folder.alertCount += 1;
    folders.set(key, folder);
  }
  return [...folders.values()].sort((a, b) => b.outstandingCents - a.outstandingCents || a.name.localeCompare(b.name));
}

/**
 * Which folders are expanded. Folders start collapsed; the folder holding the
 * open record is expanded, including when a record is opened from a link or
 * just saved.
 */
export function useFolderToggle(openKey: string | null) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(openKey ? [openKey] : []));
  const [seenKey, setSeenKey] = useState(openKey);
  if (openKey !== seenKey) {
    setSeenKey(openKey);
    if (openKey && !expanded.has(openKey)) setExpanded(new Set(expanded).add(openKey));
  }
  return {
    isOpen: (key: string) => expanded.has(key),
    toggle: (key: string) =>
      setExpanded((current) => {
        const next = new Set(current);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    setAll: (keys: string[]) => setExpanded(new Set(keys)),
  };
}

/** Narrows folders to the companies whose name contains `query`. */
export function matchFolders(folders: CompanyFolder[], query: string) {
  const needle = query.trim().toLowerCase();
  return needle ? folders.filter((folder) => folder.name.toLowerCase().includes(needle)) : folders;
}

/** Folders or the one long list: how Payables and Receivables are laid out. */
export function LayoutToggle({ layout, onChange }: { layout: FolderLayout; onChange: (layout: FolderLayout) => void }) {
  const options: { id: FolderLayout; label: string; icon: string }[] = [
    { id: "folders", label: "Folders", icon: "folder" },
    { id: "list", label: "List", icon: "list" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Layout"
      className="flex items-center"
      style={{ padding: 2, gap: 2, border: "1px solid var(--border-default)", borderRadius: 999, background: "var(--surface-card)" }}
    >
      {options.map((option) => {
        const on = layout === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(option.id)}
            className="flex items-center gap-1.5"
            style={{
              height: 24,
              padding: "0 10px",
              border: "none",
              borderRadius: 999,
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              fontSize: "12px",
              fontWeight: on ? 700 : 500,
              color: on ? "var(--text-accent)" : "var(--text-secondary)",
              background: on ? "var(--accent-soft)" : "transparent",
            }}
          >
            <Icon name={option.icon} size={13} />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

const LINK = {
  border: "none",
  background: "none",
  padding: 0,
  cursor: "pointer",
  font: "inherit",
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--text-accent)",
};

export interface FolderBarProps {
  total: number;
  query: string;
  onQuery: (query: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

/** Above the folders: how many companies, a search, and expand or collapse all. */
export function FolderBar({ total, query, onQuery, onExpandAll, onCollapseAll }: FolderBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5" style={{ padding: "6px 8px 10px" }}>
      <span className="flex items-center gap-3">
        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
          {total} {total === 1 ? "company" : "companies"}
        </span>
        {total > 0 && (
          <>
            <button type="button" onClick={onExpandAll} style={LINK}>
              Expand all
            </button>
            <button type="button" onClick={onCollapseAll} style={LINK}>
              Collapse all
            </button>
          </>
        )}
      </span>
      {total > 6 && <SearchInput placeholder="Find a company..." value={query} onChange={onQuery} width={240} />}
    </div>
  );
}

export interface FolderRowProps {
  folder: CompanyFolder;
  open: boolean;
  /** "bill" or "invoice", for the count and the add button. */
  noun: string;
  /** What the alert count means, e.g. "overdue". */
  alertLabel: string;
  colSpan: number;
  onToggle: () => void;
  /** Starts a new record for this company. */
  onAdd: () => void;
}

/**
 * A company's folder header in the table: click it to show or fold its
 * records, or add a new one for the company.
 */
export function FolderRow({ folder, open, noun, alertLabel, colSpan, onToggle, onAdd }: FolderRowProps) {
  const alert = folder.alertCount > 0;
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: "6px 0 0", borderBottom: open ? "1px solid var(--border-subtle)" : "none" }}>
        {/* The whole bar folds the folder; the button inside is what keyboards reach. */}
        <div
          onClick={onToggle}
          className="flex w-full items-center gap-2.5 transition-colors hover:brightness-[.98]"
          style={{
            padding: "6px 12px",
            border: "1px solid var(--border-default)",
            borderLeft: `3px solid ${alert ? "var(--status-negative)" : "var(--accent-primary)"}`,
            borderRadius: open ? "var(--radius-md) var(--radius-md) 0 0" : "var(--radius-md)",
            background: open ? "var(--accent-soft)" : "var(--surface-inset)",
            cursor: "pointer",
          }}
        >
          <button
            type="button"
            aria-expanded={open}
            className="flex items-center gap-2.5 text-left"
            style={{ padding: "4px 0", border: "none", background: "none", cursor: "pointer", font: "inherit", color: "inherit" }}
          >
            <Icon
              name="chevron-right"
              size={14}
              color="var(--text-muted)"
              style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform var(--dur-fast) var(--ease-standard)" }}
            />
            <Icon name={open ? "folder-open" : "folder"} size={17} color={alert ? "var(--status-negative)" : "var(--accent-primary)"} />
            {/* Kept to the left: the row is as wide as the table, which scrolls sideways on narrow screens. */}
            <strong style={{ fontSize: "13px", whiteSpace: "nowrap" }}>{folder.name}</strong>
            <span style={{ fontSize: "11.5px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
              {folder.count} {folder.count === 1 ? noun : `${noun}s`} ·
            </span>
            <span style={{ fontSize: "12.5px", whiteSpace: "nowrap" }}>
              <strong style={{ fontVariantNumeric: "tabular-nums" }}>{formatMoney(folder.outstandingCents)}</strong>{" "}
              <span style={{ color: "var(--text-muted)" }}>outstanding</span>
            </span>
          </button>
          {alert && (
            <Badge tone="negative">
              {folder.alertCount} {alertLabel}
            </Badge>
          )}
          <span className="flex-1" />
          {/* At the far right, and held at the visible edge while the table scrolls sideways. */}
          <Button
            size="sm"
            variant="secondary"
            icon="plus"
            title={`New ${noun} for ${folder.name}`}
            style={{ position: "sticky", right: 12 }}
            onClick={(event) => {
              event.stopPropagation();
              onAdd();
            }}
          >
            Add {noun}
          </Button>
        </div>
      </td>
    </tr>
  );
}
