import type { Metadata } from "next";
import { UserManagement } from "@/components/admin/user-management";
import { requireAdmin } from "@/lib/dal/session";
import { listUsers } from "@/lib/dal/user-admin";

export const metadata: Metadata = {
  title: "Users · AEGIS AI",
  description: "Create and remove AEGIS accounts.",
};

export default async function UsersPage() {
  // The sidebar hides this for members, but hiding a link is not access
  // control — this is the check that matters. `listUsers` asserts it again.
  await requireAdmin();

  const users = await listUsers();
  return <UserManagement users={users} />;
}
