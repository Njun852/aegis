"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createCustomerAction } from "@/app/actions/crm";
import type { CustomerFormState } from "@/app/actions/crm";
import { Button, Icon, IconButton } from "@/components/ui";

const INITIAL: CustomerFormState = { error: null };

export interface NewCustomerModalProps {
  onClose: () => void;
  onCreated: (ref: string, name: string) => void;
}

/**
 * Mounted only while open, so every opening starts fresh. Submitted by hand
 * rather than through `action`, so a refusal or a duplicate warning does not
 * wipe what was typed.
 */
export function NewCustomerModal({ onClose, onCreated }: NewCustomerModalProps) {
  const [state, formAction, pending] = useActionState(createCustomerAction, INITIAL);
  const form = useRef<HTMLFormElement>(null);

  const submit = (confirmDuplicate: boolean) => {
    if (!form.current) return;
    const data = new FormData(form.current);
    if (confirmDuplicate) data.set("confirmDuplicate", "1");
    startTransition(() => formAction(data));
  };

  useEffect(() => {
    if (state.createdRef && form.current) {
      onCreated(state.createdRef, String(new FormData(form.current).get("name") ?? ""));
    }
    // `onCreated` is stable enough here; re-running on every render would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.createdRef]);

  const duplicates = state.duplicates ?? [];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      <div onClick={onClose} className="absolute inset-0" style={{ background: "rgba(23,28,37,.28)" }} />
      <form
        ref={form}
        onSubmit={(event) => {
          event.preventDefault();
          submit(false);
        }}
        className="relative flex max-h-full w-full max-w-[560px] flex-col overflow-hidden"
        style={{
          background: "var(--surface-card)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-popover)",
        }}
      >
        <div
          className="flex flex-none items-center gap-3"
          style={{ padding: "16px 18px", borderBottom: "1px solid var(--border-subtle)" }}
        >
          <span
            style={{
              width: 30,
              height: 30,
              flex: "0 0 auto",
              borderRadius: "var(--radius-sm)",
              background: "var(--accent-soft)",
              color: "var(--accent-primary)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="user" size={15} />
          </span>
          <span style={{ flex: 1, fontFamily: "var(--font-display)", fontSize: "15px", fontWeight: 700, letterSpacing: "-.01em" }}>
            New customer
          </span>
          <IconButton icon="x" size={32} label="Close" onClick={onClose} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto" style={{ padding: "18px" }}>
          {state.error && (
            <Notice tone="error">{state.error}</Notice>
          )}
          {duplicates.length > 0 && (
            <Notice tone="warning">
              <span>
                Already on file:{" "}
                {duplicates.map((match, index) => (
                  <span key={match.ref}>
                    {index > 0 && "; "}
                    <strong>{match.name}</strong> ({match.ref}, {match.reason})
                  </span>
                ))}
                . Families and companies often share a phone or inbox. If this is
                someone else, create them anyway.
              </span>
            </Notice>
          )}

          <Field label="Name" required>
            <input name="name" style={INPUT} placeholder="Juan Dela Cruz" />
          </Field>
          <div className="grid grid-cols-1 gap-3.5 wide:grid-cols-2">
            <Field label="Phone">
              <input name="phone" type="tel" style={INPUT} placeholder="0917 123 4567" />
            </Field>
            <Field label="Email">
              <input name="email" type="email" style={INPUT} placeholder="juan@example.com" />
            </Field>
          </div>
          <Field label="Company">
            <input name="company" style={INPUT} placeholder="For a business or fleet account" />
          </Field>
          <Field label="Notes">
            <textarea
              name="notes"
              rows={2}
              style={{ ...INPUT, resize: "vertical", padding: "10px 13px" }}
              placeholder="How they like to be contacted, anything worth remembering."
            />
          </Field>
        </div>

        <div
          className="flex flex-none items-center justify-end gap-2.5"
          style={{ padding: "13px 18px", borderTop: "1px solid var(--border-subtle)", background: "var(--gray-25)" }}
        >
          <Button variant="ghost" onClick={onClose} type="button">
            Cancel
          </Button>
          {duplicates.length > 0 ? (
            <Button icon="check" type="button" disabled={pending} onClick={() => submit(true)}>
              {pending ? "Saving…" : "Create anyway"}
            </Button>
          ) : (
            <Button icon="check" type="submit" disabled={pending}>
              {pending ? "Saving…" : "Add customer"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

const INPUT: CSSProperties = {
  width: "100%",
  minWidth: 0,
  font: "inherit",
  fontSize: "13.5px",
  color: "var(--text-primary)",
  background: "var(--surface-card)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-md)",
  padding: "10px 13px",
  outline: "none",
};

function Notice({ tone, children }: { tone: "error" | "warning"; children: ReactNode }) {
  const error = tone === "error";
  return (
    <div
      role={error ? "alert" : "status"}
      className="flex items-start gap-2.5"
      style={{
        padding: "11px 13px",
        border: `1px solid ${error ? "#F5C6C1" : "var(--amber-200, #FDE3A7)"}`,
        background: error ? "#FEF3F2" : "var(--status-warning-soft)",
        borderRadius: "var(--radius-md)",
        fontSize: "12px",
        color: error ? "#912018" : "var(--text-primary)",
        overflowWrap: "anywhere",
        textWrap: "pretty",
      }}
    >
      <span style={{ color: error ? "#D92D20" : "var(--status-warning)", flex: "0 0 auto", marginTop: 1 }}>
        <Icon name={error ? "circle-alert" : "alert-triangle"} size={15} />
      </span>
      {children}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
        {label}
        {required && <span style={{ color: "var(--status-negative)" }}> *</span>}
      </span>
      {children}
    </label>
  );
}
