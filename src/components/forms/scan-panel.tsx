"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Icon } from "@/components/ui";

export interface ScanPanelProps {
  title: string;
  hint: string;
  busy: boolean;
  /** "Scan document" before a scan, "Scan another" after one. */
  buttonLabel: string;
  /** The first scan is the main thing to do; a rescan is not. */
  primary: boolean;
  /** Which files the picker offers. On a phone, an image type offers the camera too. */
  accept: string;
  disabled?: boolean;
  /** Why it is disabled, shown on the button. */
  disabledReason?: string;
  onFile: (file: File) => void;
}

/**
 * The dashed box at the top of a form that fills it in from a photo or PDF:
 * the same look wherever AI reads a document, in Finance and in Quotations.
 * While it reads, the box says so plainly: a spinner, a sweeping bar, what it
 * is doing and for how long, since a read can take half a minute.
 */
export function ScanPanel({ title, hint, busy, buttonLabel, primary, accept, disabled, disabledReason, onFile }: ScanPanelProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      className="relative flex flex-wrap items-center gap-3 overflow-hidden"
      aria-busy={busy}
      style={{
        padding: "11px 13px",
        border: `1px ${busy ? "solid" : "dashed"} var(--accent-primary)`,
        borderRadius: 12,
        background: "var(--accent-soft)",
      }}
    >
      <span
        style={{
          width: 32,
          height: 32,
          flex: "0 0 auto",
          borderRadius: 9,
          background: busy ? "var(--accent-primary)" : "var(--surface-card)",
          color: busy ? "var(--surface-card)" : "var(--accent-primary)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={busy ? "loader" : "sparkles"} size={16} className={busy ? "aegis-spin" : undefined} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight" style={{ minWidth: 180 }}>
        <strong style={{ fontSize: "12.5px" }}>{busy ? "Reading the document" : title}</strong>
        {busy ? <ReadingStatus /> : <span style={{ fontSize: "11.5px", color: "var(--text-secondary)" }}>{hint}</span>}
      </span>
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
      <Button
        size="sm"
        variant={primary ? "primary" : "secondary"}
        icon="sparkles"
        disabled={busy || disabled}
        title={disabled ? disabledReason : undefined}
        onClick={() => input.current?.click()}
      >
        {busy ? "Reading…" : buttonLabel}
      </Button>
      {busy && (
        <span aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 3, background: "rgba(44, 110, 242, .15)" }}>
          <span
            className="aegis-scan-sweep"
            style={{ display: "block", width: "40%", height: "100%", borderRadius: 3, background: "var(--accent-primary)" }}
          />
        </span>
      )}
    </div>
  );
}

/** What the read is doing, and how long it has taken, so a slow read does not look stuck. */
function ReadingStatus() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((count) => count + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const step =
    seconds < 2
      ? "Preparing the file…"
      : seconds < 20
        ? "AI is reading it and filling in the fields…"
        : "Still reading. Handwriting and long forms take longer…";
  return (
    <span role="status" aria-live="polite" className="flex items-center gap-1.5" style={{ fontSize: "11.5px", color: "var(--text-secondary)" }}>
      {step}
      <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-muted)" }}>{seconds}s</span>
    </span>
  );
}
