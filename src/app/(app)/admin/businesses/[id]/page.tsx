import { notFound } from "next/navigation";
import { BusinessDetail } from "@/components/admin/business-detail";
import { getBusinessForUser } from "@/lib/dal/businesses";
import { requireAdmin } from "@/lib/dal/session";

export default async function Page(props: PageProps<"/admin/businesses/[id]">) {
  await requireAdmin();

  const { id } = await props.params;
  // Confirms the business exists and is one this account may administer,
  // rather than leaving the client to discover an empty record.
  if (!(await getBusinessForUser(id))) {
    notFound();
  }

  return <BusinessDetail businessId={id} />;
}
