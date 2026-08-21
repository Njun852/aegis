"use client";

import type { ReactNode } from "react";
import { useAuth } from "./auth-provider";
import { LoginScreen } from "./login-screen";

/**
 * Unlike the source design (which mounts the app shell and overlays the
 * login screen on top, z-indexed above it), this only mounts one or the
 * other — a real app shouldn't render protected content while signed out.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { isAuthed } = useAuth();
  return isAuthed ? children : <LoginScreen />;
}
