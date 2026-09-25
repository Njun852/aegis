import { redirect } from "next/navigation";
import { BookingsWorkspace } from "@/components/bookings/bookings-workspace";
import { ModulePage } from "@/components/modules/module-page";
import { listMetaCampaignOptions } from "@/lib/dal/ads";
import { listBookings } from "@/lib/dal/bookings";
import { getActiveBusiness } from "@/lib/dal/businesses";

export default async function BookingsPage() {
  const business = await getActiveBusiness();
  if (!business) redirect("/login");

  // A business without the module gets the locked explainer, so the route is
  // guarded even when it is reached by URL rather than the sidebar.
  if (!business.modules.includes("bookings")) {
    return <ModulePage moduleKey="bookings" />;
  }

  const [bookings, adCampaigns] = await Promise.all([
    listBookings(),
    // Empty when no Meta account is connected, which hides the Ad source field.
    listMetaCampaignOptions(),
  ]);

  return (
    <BookingsWorkspace
      bookings={bookings}
      adCampaigns={adCampaigns}
      businessName={business.name}
      todayIso={new Date().toISOString()}
    />
  );
}
