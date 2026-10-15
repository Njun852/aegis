"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui";
import styles from "./boot-screen.module.css";

/**
 * The boot screen shown before sign-in: the AEGIS mark over the Earth's rim,
 * the name spelled out down the screen, and a start-up sequence.
 *
 * It is decoration, so it must never stand between someone and the form: it
 * plays once per browser session, lasts about three seconds, any click or key
 * skips it, and with reduced motion it shows briefly and fades without
 * animating. The status tiles are the start-up steps, not live checks of
 * anything, and name no business: the sign-in page is public.
 */

const SEEN_KEY = "aegis.boot.seen";
const DURATION_MS = 3000;
const REDUCED_MS = 900;

const ROWS = [
  { letter: "A", word: "Autonomous", tagline: "Work that runs on its own" },
  { letter: "E", word: "Enterprise", tagline: "Every business, one system" },
  { letter: "G", word: "Guidance", tagline: "Clear answers, better calls" },
  { letter: "I", word: "Intelligence", tagline: "Real-time insight" },
  { letter: "S", word: "Suite", tagline: "Unified for a stronger business" },
];

const STEPS = ["Loading modules", "Checking integrity", "Establishing secure link", "Ready"];

const TILES = [
  { name: "SECURE LINK", icon: "shield-check", at: 0.35 },
  { name: "DATA CORE", icon: "layers", at: 0.6 },
  { name: "AI CORE", icon: "sparkles", at: 0.85 },
];

function readSeen(): boolean {
  try {
    return window.sessionStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Whether this session had already seen the screen when the page loaded. Read
 * once, before anything marks it seen, so the fade-out after a first viewing
 * is not cut short by the flag it sets.
 */
const seenOnLoad = typeof window === "undefined" ? false : readSeen();
const noSubscription = () => () => {};

function markSeen() {
  try {
    window.sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Private windows can refuse storage; the screen then simply shows again.
  }
}

export function BootScreen() {
  // Shown on the server render so the form never flashes before it; hidden on
  // the first client pass when this session has already seen it.
  const alreadySeen = useSyncExternalStore(noSubscription, () => seenOnLoad, () => false);
  const [phase, setPhase] = useState<"playing" | "leaving" | "done">("playing");
  const [progress, setProgress] = useState(0);
  const started = useRef(0);

  const finish = useCallback(() => {
    markSeen();
    setPhase((current) => (current === "playing" ? "leaving" : current));
  }, []);

  useEffect(() => {
    if (alreadySeen) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const total = reduced ? REDUCED_MS : DURATION_MS;
    started.current = performance.now();

    // An interval rather than animation frames: browsers stop frames in a
    // background tab, and this screen must always end and hand over to the form.
    const timer = setInterval(() => {
      const share = Math.min(1, (performance.now() - started.current) / total);
      setProgress(share);
      if (share >= 1) {
        clearInterval(timer);
        finish();
      }
    }, 40);

    const skip = () => finish();
    window.addEventListener("keydown", skip);
    return () => {
      clearInterval(timer);
      window.removeEventListener("keydown", skip);
    };
  }, [alreadySeen, finish]);

  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = setTimeout(() => setPhase("done"), 650);
    return () => clearTimeout(timer);
  }, [phase]);

  if (alreadySeen || phase === "done") return null;

  /** A part shows once the timer passes its moment; the class carries the fade. */
  const at = (moment: number) => (progress >= moment ? styles.shown : "");

  // The working steps share the bar; "Ready" only once it is full.
  const working = STEPS.length - 1;
  const step = progress >= 1 ? STEPS[working] : STEPS[Math.min(working - 1, Math.floor(progress * working))];

  return (
    <div
      className={`${styles.screen} ${phase === "leaving" ? styles.leaving : ""}`}
      role="status"
      aria-label="AEGIS is starting"
      onClick={finish}
    >
      <div className={`${styles.earth} ${at(0.001)}`} aria-hidden="true" />
      <div className={`${styles.flare} ${at(0.15)}`} aria-hidden="true" />

      <span className={styles.skip}>Press any key to skip</span>
      <span className={styles.version}>v1.0.0</span>
      <div className={`${styles.pillars} ${at(0.12)}`} aria-hidden="true">
        BUSINESS INTELLIGENCE
        <br />
        AUTOMATION
        <br />
        REAL ADVANTAGE
      </div>

      <div className={styles.stage}>
        <AegisMark className={`${styles.mark} ${at(0.001)}`} />

        <div className={styles.rows}>
          {ROWS.map((row, index) => (
            <div key={row.letter} className={`${styles.row} ${at(0.1 + index * 0.07)}`}>
              <span className={styles.letter}>
                <span className={styles.letterGlyph}>{row.letter}</span>
              </span>
              <span className={styles.word}>
                {row.word}
              </span>
              <span className={styles.tagline}>{row.tagline}</span>
            </div>
          ))}
        </div>

        <div className={`${styles.motto} ${at(0.5)}`}>SEE MORE. DO MORE. STAY AHEAD.</div>
      </div>

      <div className={styles.boot}>
        <div className={styles.status}>
          {progress < 1 ? "INITIALIZING AEGIS…" : "AEGIS READY"}
          <span style={{ display: "block", textAlign: "center", marginTop: 6, fontSize: 10, letterSpacing: "0.3em", opacity: 0.6 }}>
            {step.toUpperCase()}
          </span>
        </div>
        <div className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <div className={styles.barFill} style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <div className={styles.tiles}>
          {TILES.map((tile) => {
            const online = progress >= tile.at;
            return (
              <div key={tile.name} className={styles.tile}>
                <span className={styles.tileIcon}>
                  <Icon name={tile.icon} size={26} />
                </span>
                <span>
                  <div className={styles.tileName}>{tile.name}</div>
                  <div className={`${styles.tileState} ${online ? styles.online : ""}`}>{online ? "ONLINE" : "STANDBY"}</div>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.footer}>A STRONGER TOMORROW FOR A SMARTER BUSINESS</div>
    </div>
  );
}

/** The A: two metallic strokes and a crossbar, with the horizon arc of light beneath. */
function AegisMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 104" aria-hidden="true">
      <defs>
        <linearGradient id="aegis-steel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#d3deef" />
          <stop offset="1" stopColor="#9fb2d3" />
        </linearGradient>
        <linearGradient id="aegis-arc" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#1e6bff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#8fd0ff" />
          <stop offset="1" stopColor="#1e6bff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M60 4 L104 88 L84 88 L60 40 L36 88 L16 88 Z" fill="url(#aegis-steel)" />
      <path d="M44 72 L76 72 L71 62 L49 62 Z" fill="url(#aegis-steel)" opacity="0.9" />
      <path d="M4 84 Q60 52 116 84" fill="none" stroke="url(#aegis-arc)" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}
