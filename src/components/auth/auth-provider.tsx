"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

interface AuthContextValue {
  isAuthed: boolean;
  signIn: () => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * AUTH INTEGRATION POINT — replace with real session state: a useSession()
 * hook backed by your auth provider, or a server-verified cookie checked in
 * middleware. This only tracks whether the demo sign-in form completed;
 * `LoginScreen` owns the form fields and validation, not this context.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthed, setIsAuthed] = useState(false);

  const signIn = useCallback(() => setIsAuthed(true), []);
  const signOut = useCallback(() => setIsAuthed(false), []);

  const value = useMemo<AuthContextValue>(
    () => ({ isAuthed, signIn, signOut }),
    [isAuthed, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }
  return context;
}
