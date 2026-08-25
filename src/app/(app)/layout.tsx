import { redirect } from "next/navigation";
import { BusinessProvider } from "@/components/business/business-provider";
import { AppShell } from "@/components/layout/app-shell";
import { listBusinessesForUser } from "@/lib/dal/businesses";
import { verifySession } from "@/lib/dal/session";
import { findUserById } from "@/lib/dal/users";
import { countUnread } from "@/lib/mail";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // Redirects to /login when there is no session, so everything below this
  // line is running for an authenticated user.
  const session = await verifySession();

  const [user, businesses] = await Promise.all([
    findUserById(session.userId),
    listBusinessesForUser(),
  ]);

  // The session survived but the account behind it did not — treat it as
  // signed out rather than rendering a shell with no user.
  if (!user || businesses.length === 0) {
    redirect("/login");
  }

  return (
    <BusinessProvider
      businesses={businesses}
      activeBusinessId={session.activeBusinessId}
      user={user}
    >
      <AppShell unreadCount={countUnread()}>{children}</AppShell>
    </BusinessProvider>
  );
}
