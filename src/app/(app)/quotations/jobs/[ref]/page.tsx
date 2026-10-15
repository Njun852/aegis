import { notFound, redirect } from "next/navigation";
import { ModulePage } from "@/components/modules/module-page";
import { JobOrderView } from "@/components/quotations/job-order-view";
import { getBooking } from "@/lib/dal/bookings";
import { getActiveBusiness } from "@/lib/dal/businesses";
import { findJobOrder } from "@/lib/dal/job-orders";

export default async function JobOrderPage(props: PageProps<"/quotations/jobs/[ref]">) {
  const business = await getActiveBusiness();
  if (!business) redirect("/login");
  if (!business.modules.includes("quotes")) return <ModulePage moduleKey="quotes" />;

  const { ref } = await props.params;
  const jobOrder = await findJobOrder(decodeURIComponent(ref));
  if (!jobOrder) notFound();

  // The booking follows this job order, so its status is shown beside it.
  const linked =
    jobOrder.bookingRef && business.modules.includes("bookings") ? await getBooking(jobOrder.bookingRef) : null;

  return <JobOrderView jobOrder={jobOrder} booking={linked ? { ref: linked.ref, status: linked.status } : null} />;
}
