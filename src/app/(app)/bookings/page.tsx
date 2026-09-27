import { redirect } from "next/navigation";
import { BookingsWorkspace } from "@/components/bookings/bookings-workspace";
import { ModulePage } from "@/components/modules/module-page";
import { listMetaCampaignOptions } from "@/lib/dal/ads";
import { listBookings } from "@/lib/dal/bookings";
import { getActiveBusiness } from "@/lib/dal/businesses";
import { listVehicleOptions } from "@/lib/dal/fleet";

export default async function BookingsPage() {
  const business = await getActiveBusiness();
  if (!business) redirect("/login");

  // A business without the module gets the locked explainer, so the route is
  // guarded even when it is reached by URL rather than the sidebar.
  if (!business.modules.includes("bookings")) {
    return <ModulePage moduleKey="bookings" />;
  }

  const [bookings, adCampaigns, vehicles] = await Promise.all([
    listBookings(),
    // Empty when no Meta account is connected, which hides the Ad source field.
    listMetaCampaignOptions(),
    // Empty without Fleet, which hides the Vehicle field.
    business.modules.includes("fleet") ? listVehicleOptions() : Promise.resolve([]),
  ]);

  return (
    <BookingsWorkspace
      bookings={bookings}
      adCampaigns={adCampaigns}
      vehicles={vehicles}
      businessName={business.name}
      todayIso={new Date().toISOString()}
    />
  );
}
