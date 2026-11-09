"use client";

import { useSyncExternalStore } from "react";
import { useToast } from "@/components/layout/toast-provider";
import { Card } from "@/components/ui";
import {
  DEFAULT_PREFERENCES,
  TEXT_SIZE_OPTIONS,
  THEME_OPTIONS,
  currentPreferences,
  savePreferences,
  type DisplayPreferences,
} from "@/lib/preferences";

/**
 * Theme and text size, for this device.
 *
 * A change applies the moment it is picked — the screen itself is the preview —
 * and a toast confirms it was kept.
 */
export function PreferencesForm() {
  const toast = useToast();
  // What is applied right now, read off <html>. The server has no device to
  // ask, so it renders the defaults and the browser corrects them on hydrate.
  const key = useSyncExternalStore(subscribe, preferencesKey, () => preferencesKeyOf(DEFAULT_PREFERENCES));
  const [theme, textSize] = key.split("|") as [DisplayPreferences["theme"], DisplayPreferences["textSize"]];
  const preferences: DisplayPreferences = { theme, textSize };

  const change = (next: DisplayPreferences, title: string) => {
    const saved = savePreferences(next);
    toast({
      tone: saved ? "success" : "info",
      title,
      description: saved
        ? "Saved on this device."
        : "Applied for now, but this browser would not save it. It resets when you reload.",
      key: "display-preferences",
    });
  };

  return (
    <Card title="Preferences" padding="20px" style={{ maxWidth: 460 }}>
      <div className="flex flex-col gap-5">
        <Choice
          label="Appearance"
          hint="Match device follows your phone or computer's light or dark setting."
          options={THEME_OPTIONS}
          value={preferences.theme}
          onChange={(theme) =>
            change({ ...preferences, theme }, `Appearance: ${THEME_OPTIONS.find((o) => o.value === theme)?.label}`)
          }
        />
        <Choice
          label="Text size"
          hint="Makes all text and controls larger or smaller."
          options={TEXT_SIZE_OPTIONS}
          value={preferences.textSize}
          onChange={(textSize) =>
            change(
              { ...preferences, textSize },
              `Text size: ${TEXT_SIZE_OPTIONS.find((o) => o.value === textSize)?.label}`,
            )
          }
        />
      </div>
    </Card>
  );
}

/** Re-renders when the boot script or a save changes the attributes on <html>. */
function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme-preference", "data-text-size"],
  });
  return () => observer.disconnect();
}

function preferencesKeyOf(preferences: DisplayPreferences): string {
  return `${preferences.theme}|${preferences.textSize}`;
}

function preferencesKey(): string {
  return preferencesKeyOf(currentPreferences());
}

function Choice<T extends string>({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-2">
      <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>{label}</span>
      <div
        className="flex flex-wrap gap-1"
        style={{
          padding: 3,
          borderRadius: "var(--radius-md)",
          background: "var(--surface-inset)",
          border: "1px solid var(--border-default)",
        }}
      >
        {options.map((option) => {
          const on = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                if (!on) onChange(option.value);
              }}
              style={{
                flex: "1 1 0",
                minWidth: 84,
                padding: "7px 10px",
                border: 0,
                borderRadius: "calc(var(--radius-md) - 2px)",
                cursor: on ? "default" : "pointer",
                fontSize: "12.5px",
                fontWeight: on ? 650 : 500,
                background: on ? "var(--surface-card)" : "transparent",
                color: on ? "var(--text-primary)" : "var(--text-secondary)",
                boxShadow: on ? "var(--shadow-card)" : "none",
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>{hint}</span>
    </div>
  );
}
