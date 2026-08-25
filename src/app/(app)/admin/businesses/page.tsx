import { BusinessList } from "@/components/admin/business-list";
import { requireAdmin } from "@/lib/dal/session";

export default async function BusinessesPage() {
  // Members are redirected to their dashboard — the sidebar hides this route
  // for them, but hiding a link is not access control.
  await requireAdmin();
  return <BusinessList />;
}
