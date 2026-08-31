"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { Toast } from "@/components/ui";
import type { ToastTone } from "@/components/ui";

export interface ToastInput {
  tone: ToastTone;
  title: string;
  description?: string;
  /**
   * Stable identity for a repeatable action. A second toast with the same key
   * replaces the first rather than stacking — flipping one ad switch back and
   * forth should leave one notification, not six.
   */
  key?: string;
  durationMs?: number;
}

interface ToastRecord extends Required<Pick<ToastInput, "tone" | "title">> {
  id: string;
  description?: string;
}

type ToastFn = (input: ToastInput) => void;

const ToastContext = createContext<ToastFn | null>(null);

/** More than this on screen and it stops being feedback and starts being a wall. */
const MAX_VISIBLE = 3;

/** Errors need reading; confirmations only need noticing. */
const DEFAULT_MS: Record<ToastTone, number> = {
  success: 4000,
  info: 5000,
  error: 7000,
};

/**
 * Holds the notification queue for the whole signed-in app.
 *
 * Timers are kept in a ref keyed by toast id rather than in state, so a
 * re-render never restarts a countdown, and hovering the stack pauses every
 * timer — a message should not disappear while it is being read.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const remaining = useRef(new Map<string, number>());

  const clearTimer = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id);
      remaining.current.delete(id);
      setToasts((list) => list.filter((entry) => entry.id !== id));
    },
    [clearTimer],
  );

  const arm = useCallback(
    (id: string, ms: number) => {
      clearTimer(id);
      remaining.current.set(id, ms);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), ms),
      );
    },
    [clearTimer, dismiss],
  );

  const toast = useCallback<ToastFn>(
    ({ tone, title, description, key, durationMs }) => {
      const id = key ?? `toast-${Math.random().toString(36).slice(2)}`;

      setToasts((list) => [
        ...list.filter((entry) => entry.id !== id),
        { id, tone, title, description },
      ]
        // Oldest fall off the top when the stack is full.
        .slice(-MAX_VISIBLE));

      arm(id, durationMs ?? DEFAULT_MS[tone]);
    },
    [arm],
  );

  // Hovering or focusing the stack holds every countdown; leaving restarts them
  // from the full duration, which is kinder than resuming a nearly-expired one.
  const pauseAll = useCallback(() => {
    for (const id of timers.current.keys()) clearTimer(id);
  }, [clearTimer]);

  const resumeAll = useCallback(() => {
    for (const [id, ms] of remaining.current) arm(id, ms);
  }, [arm]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        // Above the drawers (71) and the modals (91), so an error about a failed
        // save is never hidden behind the form that produced it.
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          zIndex: 200,
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          pointerEvents: "none",
        }}
        onMouseEnter={pauseAll}
        onMouseLeave={resumeAll}
        onFocusCapture={pauseAll}
        onBlurCapture={resumeAll}
      >
        {toasts.map((entry) => (
          <Toast
            key={entry.id}
            tone={entry.tone}
            title={entry.title}
            description={entry.description}
            onDismiss={() => dismiss(entry.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastFn {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside a ToastProvider");
  }
  return context;
}
