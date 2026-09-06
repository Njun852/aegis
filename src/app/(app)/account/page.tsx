import type { Metadata } from "next";
import { PasswordForm } from "@/components/account/password-form";
import { verifySession } from "@/lib/dal/session";
import { findUserById } from "@/lib/dal/users";

export const metadata: Metadata = {
  title: "Account · AEGIS AI",
  description: "Your AEGIS account and password.",
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
          {session.role === "aegis_admin" ? "AEGIS administrator" : "Member"}
        </p>
      </div>
      <PasswordForm />
    </div>
  );
}
