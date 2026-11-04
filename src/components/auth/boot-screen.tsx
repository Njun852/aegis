"use client";

import { Alfa_Slab_One, Exo_2, Share_Tech_Mono } from "next/font/google";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { preload } from "react-dom";
import styles from "./boot-screen.module.css";

/**
 * The console lettering: a heavy slab for the five letters, a squared sans for
 * their words and the status, and a narrow mono for the small spaced text.
 * Loaded here rather than in the root layout, because nothing else uses them.
 */
const slab = Alfa_Slab_One({ subsets: ["latin"], weight: "400", variable: "--boot-slab" });
const squared = Exo_2({ subsets: ["latin"], variable: "--boot-squared" });
const mono = Share_Tech_Mono({ subsets: ["latin"], weight: "400", variable: "--boot-mono" });

/**
 * The boot screen shown before sign-in: the AEGIS mark above the Earth's
 * night side and the start-up bar.
 *
 * The scene is the reference picture, split into layers: the Earth and space
 * as a plate with its logo and text painted out, the motto as a layer
 * of its own, and the mark from the current AEGIS logo (the one the sidebar and
 * the sign-in form use) as a light layer placed where the picture had its mark,
 * with its shape as the mask for the light that runs across the chrome. Under
 * the mark the name runs down the screen, one framed letter a line, each
 * meaning typed out beside its letter. The bar and the status are live on
 * top, placed where the picture has them.
 *
 * It is decoration, so it must never stand between someone and the form: it
 * plays once per browser session, lasts about six seconds, any click or key
 * skips it, and with reduced motion it shows the finished frame briefly and
 * fades without animating.
 */

const SEEN_KEY = "aegis.boot.seen";
const DURATION_MS = 6000;
const REDUCED_MS = 900;
/** The plate is waited for this long at most before the sequence starts anyway. */
const LOAD_WAIT_MS = 800;

const ASSET = "/brand";

/** The name, a letter a line, and what each letter stands for. */
const ACRONYM = [
  { letter: "A", word: "Autonomous" },
  { letter: "E", word: "Enterprise" },
  { letter: "G", word: "Guidance" },
  { letter: "I", word: "Intelligence" },
  { letter: "S", word: "Suite" },
];

/** The meanings are typed one after another between these two moments. */
const TYPE_FROM = 0.3;
const TYPE_UNTIL = 0.8;
const TYPED_TOTAL = ACRONYM.reduce((sum, { word }) => sum + word.length, 0);

/**
 * The rim of the atmosphere in the picture's pixels: the ellipse its bright
 * line follows, from beyond the left edge over the top to beyond the right.
 */
const RIM = "M -120 790 A 880 294 0 0 1 1640 790";

/** Faint stars that twinkle over the black, placed by hand away from the mark. */
const STARS = [
  { x: 6, y: 9, d: 0 },
  { x: 14, y: 31, d: 1.3 },
  { x: 21, y: 6, d: 2.1 },
  { x: 25, y: 22, d: 0.7 },
  { x: 74, y: 27, d: 1.8 },
  { x: 79, y: 6, d: 0.4 },
  { x: 88, y: 33, d: 2.6 },
  { x: 92, y: 22, d: 1.1 },
  { x: 9, y: 40, d: 2.9 },
  { x: 96, y: 41, d: 0.2 },
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
  preload(`${ASSET}/boot-plate.jpg`, { as: "image", fetchPriority: "high" });
  preload(`${ASSET}/boot-logo.png`, { as: "image", fetchPriority: "high" });

  // Shown on the server render so the form never flashes before it; hidden on
  // the first client pass when this session has already seen it.
  const alreadySeen = useSyncExternalStore(noSubscription, () => seenOnLoad, () => false);
  const [phase, setPhase] = useState<"waiting" | "playing" | "leaving" | "done">("waiting");
  const [progress, setProgress] = useState(0);
  const started = useRef(0);

  const finish = useCallback(() => {
    markSeen();
    setPhase((current) => (current === "waiting" || current === "playing" ? "leaving" : current));
  }, []);

  /** The plate has loaded, or waiting for it has gone on long enough. */
  const begin = useCallback(() => setPhase((current) => (current === "waiting" ? "playing" : current)), []);

  useEffect(() => {
    if (alreadySeen) return;
    const fallback = setTimeout(begin, LOAD_WAIT_MS);
    const skip = () => finish();
    window.addEventListener("keydown", skip);
    return () => {
      clearTimeout(fallback);
      window.removeEventListener("keydown", skip);
    };
  }, [alreadySeen, begin, finish]);

  useEffect(() => {
    if (alreadySeen || phase !== "playing") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const total = reduced ? REDUCED_MS : DURATION_MS;
    started.current = performance.now();

    // An interval rather than animation frames: browsers stop frames in a
    // background tab, and this screen must always end and hand over to the form.
    const timer = setInterval(() => {
      const share = reduced ? 1 : Math.min(1, (performance.now() - started.current) / total);
      setProgress(share);
      if (performance.now() - started.current >= total) {
        clearInterval(timer);
        finish();
      }
    }, 40);
    return () => clearInterval(timer);
  }, [alreadySeen, phase, finish]);

  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = setTimeout(() => setPhase("done"), 700);
    return () => clearTimeout(timer);
  }, [phase]);

  if (alreadySeen || phase === "done") return null;

  /** A part shows once the timer passes its moment; the class carries the transition. */
  const at = (moment: number) => (phase !== "waiting" && progress >= moment ? styles.shown : "");
  const filled = Math.round(progress * 100);

  // How many letters of the meanings are typed so far, counted across all five.
  const typing = phase !== "waiting" && progress >= TYPE_FROM;
  const typedCount = typing
    ? Math.min(TYPED_TOTAL, Math.floor(((progress - TYPE_FROM) / (TYPE_UNTIL - TYPE_FROM)) * TYPED_TOTAL))
    : 0;

  return (
    <div
      className={`${styles.screen} ${slab.variable} ${squared.variable} ${mono.variable} ${phase === "leaving" ? styles.leaving : ""}`}
      role="status"
      aria-label="AEGIS is starting. Press any key or click to skip."
      onClick={finish}
    >
      <div className={`${styles.stage} ${at(0)}`}>
        {/* The Earth and space, with the logo exactly as drawn. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- a fixed full-bleed plate, preloaded above */}
        <img className={styles.plate} src={`${ASSET}/boot-plate.jpg`} alt="" onLoad={begin} draggable={false} />
        {/* City lights, brightened and dimmed slowly so the night side is alive. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- an additive light layer over the plate */}
        <img className={`${styles.lights} ${at(0.05)}`} src={`${ASSET}/boot-lights.png`} alt="" draggable={false} />

        {/* Light running along the rim of the atmosphere. */}
        <svg className={`${styles.rim} ${at(0.08)}`} viewBox="0 0 1533 1024" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="aegis-rim" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#3d8bff" stopOpacity="0" />
              <stop offset="0.5" stopColor="#d8ecff" />
              <stop offset="1" stopColor="#3d8bff" stopOpacity="0" />
            </linearGradient>
            <filter id="aegis-rim-blur" x="-10%" y="-50%" width="120%" height="200%">
              <feGaussianBlur stdDeviation="3" />
            </filter>
          </defs>
          <path className={styles.rimGlow} d={RIM} pathLength={1000} stroke="url(#aegis-rim)" filter="url(#aegis-rim-blur)" />
          <path className={styles.rimRun} d={RIM} pathLength={1000} stroke="url(#aegis-rim)" />
        </svg>

        {/* The sun's edge coming over the horizon. */}
        <span className={`${styles.flare} ${at(0.1)}`} aria-hidden="true" />

        {/* Stars, faintly twinkling. */}
        {STARS.map((star) => (
          <span key={`${star.x}-${star.y}`} className={styles.star} style={{ left: `${star.x}%`, top: `${star.y}%`, animationDelay: `${star.d}s` }} />
        ))}

        {/* The logo: the mark comes up out of the dark, then the name runs down
            under it a letter at a time, each meaning typed out beside it, and a
            sheet of light passes across the chrome. */}
        <div className={styles.logo} role="img" aria-label="AEGIS, Autonomous Enterprise Guidance & Intelligence Suite">
          {/* eslint-disable-next-line @next/next/no-img-element -- an additive layer over the plate */}
          <img className={`${styles.logoMark} ${at(0.1)}`} src={`${ASSET}/boot-logo.png`} alt="" draggable={false} />
          <span className={`${styles.shine} ${at(0.44)}`} aria-hidden="true" />
          <div className={styles.acronym} aria-hidden="true">
            {ACRONYM.map(({ letter, word }, index) => {
              const before = ACRONYM.slice(0, index).reduce((sum, row) => sum + row.word.length, 0);
              const typed = Math.max(0, Math.min(word.length, typedCount - before));
              // The caret sits on the line being typed, and stays on the last once done.
              const caret = typing && (typed < word.length ? typedCount >= before : index === ACRONYM.length - 1);
              return (
                <div key={letter} className={`${styles.acronymRow} ${at(0.24 + index * 0.04)}`}>
                  <span className={styles.acronymLetter}>{letter}</span>
                  <span className={styles.acronymWord}>
                    {word.slice(0, typed)}
                    {caret && <span className={styles.caret} />}
                    {/* The rest, unseen, holds the line's width so nothing shifts as it types. */}
                    <span className={styles.untyped}>{word.slice(typed)}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* The light at the heart of the A, and a glint at its apex. */}
        <span className={`${styles.core} ${at(0.24)}`} aria-hidden="true" />
        <span className={`${styles.glint} ${at(0.5)}`} aria-hidden="true" />

        {/* eslint-disable-next-line @next/next/no-img-element -- an additive text layer cut from the picture */}
        <img className={`${styles.motto} ${at(0.48)}`} src={`${ASSET}/boot-motto.png`} alt="See more. Do more. Stay ahead." draggable={false} />
      </div>

      <div className={styles.hud}>
        <span className={`${styles.version} ${at(0.06)}`}>v1.0.0</span>
        <div className={`${styles.pillars} ${at(0.12)}`}>
          <span>BUSINESS INTELLIGENCE</span>
          <span>AUTOMATION</span>
          <span>REAL ADVANTAGE</span>
        </div>

        <div className={styles.console}>
          <div className={`${styles.status} ${at(0.14)}`}>INITIALIZING AEGIS...</div>
          <div
            className={`${styles.bar} ${at(0.14)}`}
            role="progressbar"
            aria-label="Start-up"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={filled}
          >
            <div className={styles.barFill} style={{ width: `${filled}%` }} />
          </div>
          <div className={`${styles.footer} ${at(0.6)}`}>A STRONGER TOMORROW FOR A SMARTER BUSINESS</div>
        </div>
      </div>
    </div>
  );
}
