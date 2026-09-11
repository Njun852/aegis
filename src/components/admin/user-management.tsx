"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useBusiness } from "@/components/business/business-provider";
import { useToast } from "@/components/layout/toast-provider";
import { Badge, Button, Card, Icon } from "@/components/ui";
import {
  createUserAction,
  deleteUserAction,
  setUserPasswordAction,
  updateUserAction,
} from "@/app/actions/users";
import { PASSWORD_MIN_LENGTH } from "@/lib/password-policy";
import { roleLabel } from "@/lib/roles";
import type { Business, ManagedUser, UserRole } from "@/types";

export interface UserManagementProps {
  users: ManagedUser[];
}

/** What the edit form holds while an account is open for editing. */
interface EditDraft {
  name: string;
  role: UserRole;
  businessIds: string[];
}

/**
 * Creating, editing and removing AEGIS accounts.
 *
 * The administrator types each password and hands it over; the server keeps
 * only its hash. The holder can change it whenever they like in Account
 * Settings; nothing forces them to.
 *
 * Edits take effect on the account's next request, because sessions read the
 * user back from the database rather than trusting the login token.
 */
export function UserManagement({ users }: UserManagementProps) {
  const router = useRouter();
  const toast = useToast();
  const { businesses, user: me } = useBusiness();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("aegis_admin");
  const [businessIds, setBusinessIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const [passwordFor, setPasswordFor] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [busy, startWork] = useTransition();

  const businessName = (id: string) =>
    businesses.find((business) => business.id === id)?.name ?? id;

  const resetForm = () => {
    setName("");
    setUsername("");
    setPassword("");
    setRole("aegis_admin");
    setBusinessIds([]);
    setFormError(null);
  };

  const create = () => {
    setFormError(null);
    startWork(async () => {
      const result = await createUserAction({
        name,
        username,
        password,
        role,
        businessIds,
      });

      if (result.error || !result.user) {
        setFormError(result.error ?? "The account could not be created.");
        return;
      }

      toast({
        tone: "success",
        title: `${result.user.name} added`,
        description: `They sign in as ${result.user.username} with the password you set.`,
        key: "user-admin",
      });
      resetForm();
      setAdding(false);
      router.refresh();
    });
  };

  const beginEdit = (account: ManagedUser) => {
    closePassword();
    setEditingId(account.id);
    setEditError(null);
    setEditDraft({
      name: account.name,
      role: account.role,
      businessIds: account.businessIds,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(null);
    setEditError(null);
  };

  const saveEdit = (account: ManagedUser) => {
    if (!editDraft) return;
    setEditError(null);

    startWork(async () => {
      const result = await updateUserAction(account.id, editDraft);
      if (result.error || !result.user) {
        setEditError(result.error ?? "The changes could not be saved.");
        return;
      }

      const roleChanged = result.user.role !== account.role;
      toast({
        tone: "success",
        title: `${result.user.name} updated`,
        description: roleChanged
          ? `Now ${roleLabel(result.user.role).toLowerCase()} — applies on their next action.`
          : "Changes apply on their next action.",
        key: "user-admin",
      });
      cancelEdit();
      router.refresh();
    });
  };

  const openPassword = (account: ManagedUser) => {
    cancelEdit();
    setPasswordFor(account.id);
    setNewPassword("");
    setPasswordError(null);
  };

  const closePassword = () => {
    setPasswordFor(null);
    setNewPassword("");
    setPasswordError(null);
  };

  const savePassword = (target: ManagedUser) => {
    setPasswordError(null);

    startWork(async () => {
      const result = await setUserPasswordAction(target.id, newPassword);
      if (result.error) {
        setPasswordError(result.error);
        toast({
          tone: "error",
          title: "Password not changed",
          description: result.error,
          key: "user-admin",
        });
        return;
      }

      toast({
        tone: "success",
        title: `Password changed for ${target.name}`,
        description: "Their old password no longer works.",
        key: "user-admin",
      });
      closePassword();
    });
  };

  const remove = (target: ManagedUser) => {
    if (
      !window.confirm(
        `Delete ${target.name} (${target.username})? They are signed out on their next request and cannot sign in again.`,
      )
    ) {
      return;
    }

    startWork(async () => {
      const result = await deleteUserAction(target.id);
      if (result.error) {
        toast({
          tone: "error",
          title: "Account not deleted",
          description: result.error,
          key: "user-admin",
        });
        return;
      }

      toast({
        tone: "info",
        title: `${target.name} deleted`,
        description: "Their memberships were removed too.",
        key: "user-admin",
      });
      router.refresh();
    });
  };

  const admins = users.filter((account) => account.role === "aegis_admin").length;

  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-3.5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontSize: "22px",
              lineHeight: "28px",
              fontWeight: 700,
              letterSpacing: "-.02em",
            }}
          >
            Users
          </h2>
          <p style={{ margin: "3px 0 0", fontSize: "12.5px", color: "var(--text-secondary)" }}>
            {users.length} {users.length === 1 ? "account" : "accounts"} ·{" "}
            {admins} {admins === 1 ? "administrator" : "administrators"}
          </p>
        </div>
        <Button
          icon={adding ? "x" : "plus"}
          variant={adding ? "ghost" : "primary"}
          onClick={() => {
            setAdding((open) => !open);
            setFormError(null);
          }}
        >
          {adding ? "Cancel" : "Add user"}
        </Button>
      </div>

      {adding && (
        <Card title="New account" padding="18px">
          <div className="grid gap-2.5 wide:grid-cols-3">
            <label className="flex flex-col gap-1.5">
              <span style={LABEL}>Full name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Maria Santos" autoFocus style={FIELD} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span style={LABEL}>Username</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                placeholder="maria.santos"
                autoComplete="off"
                style={FIELD}
              />
            </label>
            <PasswordField label="Password" value={password} onChange={setPassword} />
          </div>

          <RolePicker role={role} onChange={setRole} />
          {role === "member" && (
            <BusinessPicker
              businesses={businesses}
              selected={businessIds}
              onToggle={(id) => setBusinessIds((current) => toggleId(current, id))}
            />
          )}

          {formError && <ErrorLine message={formError} />}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              icon="check"
              disabled={
                busy || !name.trim() || !username.trim() || password.length < PASSWORD_MIN_LENGTH
              }
              onClick={create}
            >
              {busy ? "Creating…" : "Create account"}
            </Button>
            <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
              Give them the password directly. They can change it in Account Settings.
            </span>
          </div>
        </Card>
      )}

      <Card title="Accounts" padding="18px">
        <div className="flex flex-col">
          {users.map((account) => {
            const isMe = account.id === me.id;
            const editing = editingId === account.id && editDraft !== null;
            const settingPassword = passwordFor === account.id;

            return (
              <div
                key={account.id}
                style={{
                  padding: "12px 2px",
                  borderTop: "1px solid var(--border-subtle)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span style={{ fontSize: "13.5px", fontWeight: 600, overflowWrap: "anywhere" }}>
                        {account.name}
                      </span>
                      {isMe && <Badge tone="accent">You</Badge>}
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", overflowWrap: "anywhere" }}>
                      {account.username}
                    </div>
                  </div>

                  <div style={{ flex: "1 1 200px", minWidth: 0, fontSize: "12px", color: "var(--text-secondary)" }}>
                    <Badge tone={account.role === "aegis_admin" ? "positive" : "neutral"}>
                      {roleLabel(account.role)}
                    </Badge>{" "}
                    {account.role === "aegis_admin"
                      ? "All businesses"
                      : account.businessIds.map(businessName).join(", ") || "No businesses"}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={editing ? "x" : "pen-line"}
                      disabled={busy}
                      onClick={() => (editing ? cancelEdit() : beginEdit(account))}
                    >
                      {editing ? "Cancel" : "Edit"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={settingPassword ? "x" : "lock"}
                      disabled={busy || isMe}
                      title={isMe ? "Change your own password in Account Settings." : undefined}
                      onClick={() => (settingPassword ? closePassword() : openPassword(account))}
                    >
                      {settingPassword ? "Cancel" : "Set password"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="trash-2"
                      disabled={busy || isMe}
                      title={isMe ? "You cannot delete the account you are signed in with." : undefined}
                      onClick={() => remove(account)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>

                {editing && editDraft && (
                  <div style={PANEL}>
                    <div className="grid gap-2.5 wide:grid-cols-2">
                      <label className="flex flex-col gap-1.5">
                        <span style={LABEL}>Full name</span>
                        <input
                          value={editDraft.name}
                          onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                          style={FIELD}
                        />
                      </label>
                    </div>

                    <RolePicker
                      role={editDraft.role}
                      onChange={(next) => setEditDraft({ ...editDraft, role: next })}
                      locked={isMe}
                    />
                    {editDraft.role === "member" && (
                      <BusinessPicker
                        businesses={businesses}
                        selected={editDraft.businessIds}
                        onToggle={(id) =>
                          setEditDraft((draft) =>
                            draft && { ...draft, businessIds: toggleId(draft.businessIds, id) },
                          )
                        }
                      />
                    )}

                    <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                      The username ({account.username}) cannot be changed — it is what they sign in with.
                    </span>

                    {editError && <ErrorLine message={editError} />}

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        icon="check"
                        disabled={busy || !editDraft.name.trim()}
                        onClick={() => saveEdit(account)}
                      >
                        {busy ? "Saving…" : "Save changes"}
                      </Button>
                      <Button variant="ghost" disabled={busy} onClick={cancelEdit}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {settingPassword && (
                  <div style={PANEL}>
                    <div className="grid gap-2.5 wide:grid-cols-2">
                      <PasswordField
                        label={`New password for ${account.username}`}
                        value={newPassword}
                        onChange={setNewPassword}
                        autoFocus
                      />
                    </div>
                    <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                      Their current password stops working as soon as you save.
                    </span>

                    {passwordError && <ErrorLine message={passwordError} />}

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        icon="check"
                        disabled={busy || newPassword.length < PASSWORD_MIN_LENGTH}
                        onClick={() => savePassword(account)}
                      >
                        {busy ? "Saving…" : "Save password"}
                      </Button>
                      <Button variant="ghost" disabled={busy} onClick={closePassword}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function RolePicker({
  role,
  onChange,
  locked = false,
}: {
  role: UserRole;
  onChange: (role: UserRole) => void;
  /** Your own role cannot be changed — the server refuses it too. */
  locked?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span style={LABEL}>Role</span>
      <div className="flex flex-wrap gap-2">
        {(["aegis_admin", "member"] as UserRole[]).map((option) => {
          const active = role === option;
          return (
            <button
              key={option}
              type="button"
              disabled={locked}
              onClick={() => onChange(option)}
              style={{
                ...PILL,
                border: `1px solid ${active ? "var(--accent-primary)" : "var(--border-default)"}`,
                background: active ? "var(--accent-soft)" : "var(--surface-card)",
                color: active ? "var(--text-accent)" : "var(--text-secondary)",
                fontWeight: active ? 700 : 500,
                cursor: locked ? "not-allowed" : "pointer",
                opacity: locked && !active ? 0.45 : 1,
              }}
            >
              {roleLabel(option)}
            </button>
          );
        })}
      </div>
      <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
        {locked
          ? "You cannot change your own role. Another administrator can."
          : role === "aegis_admin"
            ? "Reaches every business, Business Management, Users and System Status."
            : "Reaches only the businesses ticked below, and no internal screens."}
      </span>
    </div>
  );
}

/** Adds the id if absent, removes it if present. */
function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id];
}

/**
 * Reports which business was toggled rather than the resulting list. Computing
 * the list here from `selected` would read the props of the last render, so two
 * toggles landing before a re-render would lose the first; the parent applies
 * the toggle to its own latest state instead.
 */
function BusinessPicker({
  businesses,
  selected,
  onToggle,
}: {
  businesses: Business[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span style={LABEL}>Businesses</span>
      <div className="flex flex-wrap gap-2">
        {businesses.map((business) => {
          const on = selected.includes(business.id);
          return (
            <button
              key={business.id}
              type="button"
              onClick={() => onToggle(business.id)}
              style={{
                ...PILL,
                border: `1px solid ${on ? "var(--accent-primary)" : "var(--border-default)"}`,
                background: on ? "var(--accent-soft)" : "var(--surface-card)",
                color: on ? "var(--text-accent)" : "var(--text-secondary)",
                fontWeight: on ? 700 : 500,
              }}
            >
              {on && <Icon name="check" size={12} />} {business.name}
            </button>
          );
        })}
      </div>
      {selected.length === 0 && (
        <span style={{ fontSize: "11.5px", color: "var(--status-warning)" }}>
          A member needs at least one business.
        </span>
      )}
    </div>
  );
}

/**
 * Typed, not generated: the administrator chooses it and hands it over. It can
 * be revealed so they can check it before saving, since there is no second
 * "confirm" field to catch a typo.
 */
function PasswordField({
  label,
  value,
  onChange,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const short = value.length > 0 && value.length < PASSWORD_MIN_LENGTH;

  return (
    <label className="flex flex-col gap-1.5">
      <span style={LABEL}>{label}</span>
      <div style={{ position: "relative" }}>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          autoFocus={autoFocus}
          style={{ ...FIELD, paddingRight: "38px" }}
        />
        <button
          type="button"
          onClick={() => setVisible((shown) => !shown)}
          aria-label={visible ? "Hide password" : "Show password"}
          title={visible ? "Hide password" : "Show password"}
          style={{
            position: "absolute",
            right: "6px",
            top: "50%",
            transform: "translateY(-50%)",
            display: "inline-flex",
            padding: "5px",
            border: "none",
            background: "transparent",
            color: "var(--text-muted)",
            cursor: "pointer",
          }}
        >
          <Icon name={visible ? "eye-off" : "eye"} size={15} />
        </button>
      </div>
      <span
        style={{
          fontSize: "11.5px",
          color: short ? "var(--status-warning)" : "var(--text-muted)",
        }}
      >
        At least {PASSWORD_MIN_LENGTH} characters.
      </span>
    </label>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        padding: "9px 11px",
        borderRadius: "var(--radius-md)",
        background: "var(--status-negative-soft)",
        color: "var(--status-negative)",
        fontSize: "12.5px",
      }}
    >
      {message}
    </div>
  );
}

const LABEL = { fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" } as const;

const FIELD = {
  width: "100%",
  font: "inherit",
  fontSize: "13px",
  color: "var(--text-primary)",
  background: "var(--surface-card)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-md)",
  padding: "9px 11px",
  outline: "none",
} as const;

const PANEL = {
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  padding: "14px",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-inset)",
} as const;

const PILL = {
  display: "inline-flex",
  alignItems: "center",
  gap: "5px",
  padding: "6px 11px",
  borderRadius: "var(--radius-pill)",
  fontFamily: "var(--font-body)",
  fontSize: "12.5px",
  cursor: "pointer",
} as const;
