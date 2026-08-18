import { AppShell } from "@/components/layout/app-shell";
import { countUnread } from "@/lib/mail";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell unreadCount={countUnread()}>{children}</AppShell>;
}
