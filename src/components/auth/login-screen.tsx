"use client";

import { useState } from "react";
import { Button, Icon, IconButton } from "@/components/ui";
import { ORGANIZATION } from "@/lib/data/workspace";
import { useAuth } from "./auth-provider";

const SIGN_IN_DELAY_MS = 700;

/** Full-screen gate rendered instead of the app shell while signed out. */
export function LoginScreen() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  const handleSignIn = () => {
    if (!email.trim() || !password.trim()) {
      setError(true);
      return;
    }
    setSigningIn(true);
    setTimeout(() => {
      setSigningIn(false);
      auth.signIn();
    }, SIGN_IN_DELAY_MS);
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto"
      style={{ background: "var(--bg-app)", padding: "32px 24px" }}
    >
      <div className="flex w-full max-w-[380px] flex-col gap-4">
        <div className="flex items-center justify-center gap-2.5">
          <span
            style={{
              width: 30,
              height: 30,
              flex: "0 0 auto",
              borderRadius: "9px",
              background: "var(--grad-primary)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: "14px",
              color: "#fff",
            }}
          >
            A
          </span>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: "17px",
              letterSpacing: "-.015em",
            }}
          >
            {ORGANIZATION.product}
          </span>
        </div>

        <div
          className="flex flex-col gap-4"
          style={{
            background: "var(--surface-card)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-xl)",
            boxShadow: "var(--shadow-card)",
            padding: "26px",
          }}
        >
          <div className="flex flex-col gap-1">
            <h1
              style={{
                margin: 0,
                fontFamily: "var(--font-display)",
                fontSize: "22px",
                lineHeight: "28px",
                fontWeight: 700,
                letterSpacing: "-.02em",
              }}
            >
              Sign in
            </h1>
            <p style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary)" }}>
              {ORGANIZATION.name} workspace
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5"
              style={{
                padding: "11px 13px",
                border: "1px solid #F5C6C1",
                background: "#FEF3F2",
                borderRadius: "var(--radius-md)",
              }}
            >
              <span style={{ color: "#D92D20", flex: "0 0 auto", marginTop: 1 }}>
                <Icon name="circle-alert" size={15} />
              </span>
              <span
                style={{ fontSize: "12px", color: "#912018", textWrap: "pretty" }}
              >
                Enter your username and password to continue.
              </span>
            </div>
          )}

          <label className="flex flex-col gap-1.5">
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
              Username
            </span>
            <span
              className="flex items-center"
              style={{
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md)",
                padding: "0 13px",
                background: "var(--surface-card)",
              }}
            >
              <input
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError(false);
                }}
                placeholder="ahmed.ben"
                style={{
                  flex: 1,
                  minWidth: 0,
                  font: "inherit",
                  fontSize: "13.5px",
                  color: "var(--text-primary)",
                  background: "transparent",
                  border: 0,
                  padding: "11px 0",
                  outline: "none",
                }}
              />
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="flex items-center gap-2">
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
                Password
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  fontWeight: 600,
                  color: "var(--accent-primary)",
                  cursor: "pointer",
                  fontSize: "12px",
                }}
              >
                Forgot?
              </span>
            </span>
            <span
              className="flex items-center gap-2"
              style={{
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md)",
                padding: "0 11px 0 13px",
                background: "var(--surface-card)",
              }}
            >
              <input
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError(false);
                }}
                type={showPassword ? "text" : "password"}
                placeholder="••••••••••"
                style={{
                  flex: 1,
                  minWidth: 0,
                  font: "inherit",
                  fontSize: "13.5px",
                  color: "var(--text-primary)",
                  background: "transparent",
                  border: 0,
                  padding: "11px 0",
                  outline: "none",
                }}
              />
              <IconButton
                icon={showPassword ? "eye-off" : "eye"}
                size={30}
                label="Toggle password"
                onClick={() => setShowPassword((show) => !show)}
              />
            </span>
          </label>

          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={signingIn}
            onClick={handleSignIn}
          >
            {signingIn ? "Signing in…" : "Sign in"}
          </Button>
        </div>

        <p
          style={{
            margin: 0,
            textAlign: "center",
            fontSize: "11.5px",
            color: "var(--text-muted)",
          }}
        >
          Trouble signing in?{" "}
          <span style={{ fontWeight: 600, color: "var(--accent-primary)", cursor: "pointer" }}>
            Contact your workspace admin
          </span>
        </p>
      </div>
    </div>
  );
}
