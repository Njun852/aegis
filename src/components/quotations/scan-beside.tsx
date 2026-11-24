"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui";
import { Panel } from "@/components/forms/form-kit";

/**
 * The scan of the paper job order beside the quotation or the job order made
 * from it, so each line can be checked against what was written. Side by side
 * is a viewer's preference, remembered in this browser only; the page reads
 * the same without it.
 */

const STORAGE_KEY = "aegis.scan.sideBySide";

/** On by default: the point of a scan is to check against it. */
export function useSideBySide(): [boolean, (next: boolean) => void] {
  const [on, setOn] = useState(true);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      // Read after hydration, so the server's render and the first client one agree.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved !== null) setOn(saved === "1");
    } catch {
      // Storage blocked (private window, previews): keep the default.
    }
  }, []);
  const set = (next: boolean) => {
    setOn(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Not remembered, which is fine.
    }
  };
  return [on, set];
}

export function SideBySideToggle({ on, onChange }: { on: boolean; onChange: (next: boolean) => void }) {
  return (
    <Button
      size="sm"
      variant={on ? "secondary" : "outline"}
      icon="panel-left"
      aria-pressed={on}
      title={on ? "Show the scan in the side panel instead" : "Show the scan beside the lines"}
      onClick={() => onChange(!on)}
    >
      {on ? "Side by side: on" : "Side by side"}
    </Button>
  );
}

function photoUrl(ref: string) {
  return `/api/quotations/photos/${encodeURIComponent(ref)}`;
}

/** The scan, large, staying in view while the lines beside it scroll. */
export function ScanPane({ photoRef, note, title = "Scanned job order" }: { photoRef: string; note?: string; title?: string }) {
  return (
    <div className="wide:sticky wide:top-3" style={{ alignSelf: "start", minWidth: 0 }}>
      <Panel
        title={title}
        icon="image"
        action={
          <a
            href={photoUrl(photoRef)}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: "12px", color: "var(--accent-primary)", textDecoration: "none" }}
          >
            Open full size
          </a>
        }
      >
        {/* Served by the app with the session; next/image would only re-encode it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl(photoRef)}
          alt="The scanned job order"
          style={{
            width: "100%",
            maxHeight: "calc(100vh - 150px)",
            objectFit: "contain",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-default)",
            background: "var(--surface-inset)",
          }}
        />
        <span style={{ fontSize: "11.5px", color: "var(--text-secondary)", textWrap: "pretty" }}>
          {photoRef}
          {note ? ` · ${note}` : ""}
        </span>
      </Panel>
    </div>
  );
}

/** The scan on the left and the work on the right, or the work alone when side by side is off. */
export function ScanBeside({ photoRef, note, on, children }: { photoRef: string | null; note?: string; on: boolean; children: ReactNode }) {
  if (!photoRef || !on) return <>{children}</>;
  return (
    <div className="grid items-start gap-3.5 wide:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <ScanPane photoRef={photoRef} note={note} />
      <div className="flex min-w-0 flex-col gap-3.5">{children}</div>
    </div>
  );
}
