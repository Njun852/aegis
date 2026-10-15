import { redirect } from "next/navigation";
import { MessengerInbox } from "@/components/bookings/messenger-inbox";
import { ModulePage } from "@/components/modules/module-page";
import { readActiveMetaAdsStatus } from "@/lib/dal/ad-account";
import { listMetaCampaignOptions } from "@/lib/dal/ads";
import { getActiveBusiness } from "@/lib/dal/businesses";
import { listCustomers } from "@/lib/dal/customers";
import { listVehicleOptions } from "@/lib/dal/fleet";
import { listConversations } from "@/lib/dal/messenger";

export default async function MessengerPage() {
  const business = await getActiveBusiness();
  if (!business) redirect("/login");
  if (!business.modules.includes("bookings")) return <ModulePage moduleKey="bookings" />;

  const [conversations, meta, campaigns, vehicles, customers] = await Promise.all([
    listConversations(),
    readActiveMetaAdsStatus(),
    listMetaCampaignOptions(),
    business.modules.includes("fleet") ? listVehicleOptions() : Promise.resolve([]),
    business.modules.includes("crm") ? listCustomers() : Promise.resolve(null),
  ]);

  return (
    <MessengerInbox
      conversations={conversations}
      vehicles={vehicles}
      customers={customers}
      fleetEnabled={business.modules.includes("fleet")}
      campaigns={campaigns}
      pageName={meta.pageName}
    />
  );
}
