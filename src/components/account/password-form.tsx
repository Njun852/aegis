"use client";

import { useState, useTransition } from "react";
import type { FormEvent } from "react";
import { changePasswordAction } from "@/app/actions/account";
import type { PasswordChangeState } from "@/app/actions/account";
import { useToast } from "@/components/layout/toast-provider";
import { Button, Card, Icon, IconButton } from "@/components/ui";
import { PASSWORD_MIN_LENGTH } from "@/lib/password-policy";

/**
 * A "use server" module may only export async functions, so the starting state
 * is declared here rather than beside the action it is passed to.
 */
const INITIAL_STATE: PasswordChangeState = { error: null, success: false };

interface FieldProps {
  name: string;
  label: string;
  autoComplete: string;
  hint?: string;
}

/** The sign-in screen's field, kept visually identical so the app has one look. */
function PasswordField({ name, label, autoComplete, hint }: FieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <label className="flex flex-col gap-1.5">
      <span
        style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}
      >
        {label}
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
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
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
          icon={visible ? "eye-off" : "eye"}
          size={30}
          label={`Toggle ${label.toLowerCase()}`}
          onClick={() => setVisible((shown) => !shown)}
        />
      </span>
      {hint && (
        <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}

/**
 * Lets the signed-in user change their own password.
 *
 * Until this existed the only way to change a password was for a developer to
 * write a new hash into the database, which meant the owner's account was not
 * really theirs. The action is called directly rather than through
 * `useActionState` so a success can raise a toast from the event that caused
 * it, instead of from a render.
 */
export function PasswordForm() {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [pending, startSubmit] = useTransition();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    // Clear the previous message first: leaving it up while the next attempt is
    // in flight means reading an answer to a question already replaced.
    setError(null);

    startSubmit(async () => {
      const result = await changePasswordAction(INITIAL_STATE, data);

      if (result.success) {
        setError(null);
        form.reset();
        toast({
          tone: "success",
          title: "Password changed",
          description: "Use your new password the next time you sign in.",
          key: "password-change",
        });
        return;
      }

      setError(result.error);
    });
  };

  return (
    <Card title="Password" padding="20px" style={{ maxWidth: 460 }}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <PasswordField
          name="currentPassword"
          label="Current password"
          autoComplete="current-password"
        />
        <PasswordField
          name="newPassword"
          label="New password"
          autoComplete="new-password"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        />
        <PasswordField
          name="confirmPassword"
          label="Confirm new password"
          autoComplete="new-password"
        />

        {error && (
          <div
            role="alert"
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "9px",
              padding: "10px 12px",
              borderRadius: "var(--radius-md)",
              background: "var(--status-negative-soft)",
              color: "var(--status-negative)",
              fontSize: "12.5px",
              overflowWrap: "anywhere",
            }}
          >
            <Icon name="circle-alert" size={15} />
            <span>{error}</span>
          </div>
        )}

        <Button variant="primary" size="md" type="submit" disabled={pending}>
          {pending ? "Changing…" : "Change password"}
        </Button>
      </form>
    </Card>
  );
}
