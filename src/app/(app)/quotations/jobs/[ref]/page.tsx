import { notFound, redirect } from "next/navigation";
import { ModulePage } from "@/components/modules/module-page";
import { JobOrderView } from "@/components/quotations/job-order-view";
import { getBooking } from "@/lib/dal/bookings";
import { getActiveBusiness } from "@/lib/dal/businesses";
import { findJobOrder, listJobOrderEvents } from "@/lib/dal/job-orders";
import { findPhotoView, findQuotation } from "@/lib/dal/quotations";
import { listSupplierSummaries } from "@/lib/dal/suppliers";

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

  // The scan it was read from; job orders made before they kept it find it on their quotation.
  const photoRef = jobOrder.photoRef ?? (await findQuotation(jobOrder.quotationRef))?.photoRef ?? null;
  // Suppliers to suggest where each part was bought, when the business keeps them.
  const [photo, events, suppliers] = await Promise.all([
    photoRef ? findPhotoView(photoRef) : Promise.resolve(null),
    listJobOrderEvents(jobOrder.ref),
    business.modules.includes("suppliers") ? listSupplierSummaries() : Promise.resolve([]),
  ]);

  return (
    <JobOrderView
      jobOrder={jobOrder}
      booking={linked ? { ref: linked.ref, status: linked.status } : null}
      inventoryEnabled={business.modules.includes("inventory")}
      photo={photo}
      events={events}
      suppliers={suppliers
        .filter((supplier) => supplier.active)
        .map((supplier) => ({
          ref: supplier.ref,
          name: supplier.name,
          detail: [supplier.contactPerson, supplier.phone, supplier.terms].filter(Boolean).join(" · "),
        }))}
    />
  );
}
