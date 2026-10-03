import { redirect } from "next/navigation";
import { FleetWorkspace } from "@/components/fleet/fleet-workspace";
import { ModulePage } from "@/components/modules/module-page";
import { getActiveBusiness } from "@/lib/dal/businesses";
import { listCustomers } from "@/lib/dal/customers";
import { listServiceRecords, listVehicles } from "@/lib/dal/fleet";

export default async function FleetPage() {
  const business = await getActiveBusiness();
  if (!business) redirect("/login");

  // Guarded here as well as in the sidebar, so the route stays locked when it
  // is reached by URL.
  if (!business.modules.includes("fleet")) {
    return <ModulePage moduleKey="fleet" />;
  }

  const today = new Date();
  const [vehicles, customers, history] = await Promise.all([
    listVehicles(today),
    listCustomers(),
    listServiceRecords(),
  ]);

  return (
    <FleetWorkspace
      vehicles={vehicles}
      customers={customers}
      history={history}
      crmEnabled={business.modules.includes("crm")}
      bookingsEnabled={business.modules.includes("bookings")}
      businessName={business.name}
      todayIso={today.toISOString()}
    />
  );
}
