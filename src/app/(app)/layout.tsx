import { AuthGate } from "@/components/auth/auth-gate";
import { AuthProvider } from "@/components/auth/auth-provider";
import { AppShell } from "@/components/layout/app-shell";
import { countUnread } from "@/lib/mail";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AuthProvider>
      <AuthGate>
        <AppShell unreadCount={countUnread()}>{children}</AppShell>
      </AuthGate>
    </AuthProvider>
  );
}
