/**
 * Display preferences: colour theme and text size.
 *
 * Kept per device in localStorage rather than on the account, because what
 * suits a bright workshop tablet differs from a desk monitor. They are applied
 * as two attributes on <html> — `data-theme` and `data-text-size` — that the
 * stylesheet keys off (src/styles/tokens/themes.css).
 *
 * The same rules run twice: once as an inline script before first paint, so a
 * dark-mode user never sees a white flash, and again from the Preferences card
 * when someone changes a setting. Both read this file, so they cannot disagree.
 */

export type ThemePreference = "light" | "dark" | "system";
export type TextSizePreference = "small" | "default" | "large" | "xlarge";

export interface DisplayPreferences {
  theme: ThemePreference;
  textSize: TextSizePreference;
}

export const DEFAULT_PREFERENCES: DisplayPreferences = { theme: "light", textSize: "default" };

export const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Match device" },
];

export const TEXT_SIZE_OPTIONS: { value: TextSizePreference; label: string; scale: number }[] = [
  { value: "small", label: "Small", scale: 0.9 },
  { value: "default", label: "Default", scale: 1 },
  { value: "large", label: "Large", scale: 1.125 },
  { value: "xlarge", label: "Extra large", scale: 1.25 },
];

const STORAGE_KEY = "aegis.preferences";

function isTheme(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function isTextSize(value: unknown): value is TextSizePreference {
  return TEXT_SIZE_OPTIONS.some((option) => option.value === value);
}

/** What is applied on this page now, as the boot script or the last save left it on <html>. */
export function currentPreferences(): DisplayPreferences {
  const { themePreference, textSize } = document.documentElement.dataset;
  return {
    theme: isTheme(themePreference) ? themePreference : DEFAULT_PREFERENCES.theme,
    textSize: isTextSize(textSize) ? textSize : DEFAULT_PREFERENCES.textSize,
  };
}

/** Saves and applies at once. Returns false when the browser refuses storage (it still applies for this visit). */
export function savePreferences(preferences: DisplayPreferences): boolean {
  applyPreferences(preferences);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}

export function applyPreferences(preferences: DisplayPreferences): void {
  const root = document.documentElement;
  const dark =
    preferences.theme === "dark" ||
    (preferences.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.dataset.theme = dark ? "dark" : "light";
  root.dataset.themePreference = preferences.theme;
  root.dataset.textSize = preferences.textSize;
}

/**
 * The pre-paint reader of the saved preferences, and a copy of `applyPreferences`, inlined into
 * <head> by the root layout. Plain ES5 and self-contained: it runs before any
 * bundle loads. It also follows the device's light/dark switch live while the
 * preference is "Match device".
 */
export const PREFERENCES_BOOT_SCRIPT = `(function(){
  var KEY=${JSON.stringify(STORAGE_KEY)};
  var sizes=${JSON.stringify(TEXT_SIZE_OPTIONS.map((option) => option.value))};
  var media=window.matchMedia("(prefers-color-scheme: dark)");
  function read(){
    try{var p=JSON.parse(localStorage.getItem(KEY)||"{}");}catch(e){p={};}
    return{
      theme:p.theme==="dark"||p.theme==="system"?p.theme:"light",
      textSize:sizes.indexOf(p.textSize)>=0?p.textSize:"default"
    };
  }
  function apply(){
    var p=read(),root=document.documentElement;
    root.setAttribute("data-theme",p.theme==="dark"||(p.theme==="system"&&media.matches)?"dark":"light");
    root.setAttribute("data-theme-preference",p.theme);
    root.setAttribute("data-text-size",p.textSize);
  }
  apply();
  if(media.addEventListener)media.addEventListener("change",apply);
})();`;
