import type { Metadata } from "next";
import { PasswordForm } from "@/components/account/password-form";
import { PreferencesForm } from "@/components/account/preferences-form";
import { verifySession } from "@/lib/dal/session";
import { findUserById } from "@/lib/dal/users";
import { businessRoleLabel } from "@/lib/business-roles";
import { roleLabel } from "@/lib/roles";

export const metadata: Metadata = {
  title: "Account · AEGIS AI",
  description: "Your AEGIS account, password and display preferences.",
};

export default async function AccountPage() {
  const session = await verifySession();
  const user = await findUserById(session.userId);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--text-h2-size)",
            lineHeight: "var(--text-h2-lh)",
            fontWeight: 650,
            color: "var(--text-primary)",
          }}
        >
          Account
        </h2>
        <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
          Signed in as {user?.name ?? "—"} ({user?.username ?? "—"}) ·{" "}
          {session.role === "aegis_admin" ? roleLabel(session.role) : businessRoleLabel(session.businessRole)}
        </p>
      </div>
      <PreferencesForm />
      <PasswordForm />
    </div>
  );
}
