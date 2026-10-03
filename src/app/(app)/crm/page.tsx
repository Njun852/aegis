import { redirect } from "next/navigation";
import { CrmWorkspace } from "@/components/crm/crm-workspace";
import { ModulePage } from "@/components/modules/module-page";
import { getActiveBusiness } from "@/lib/dal/businesses";
import { getCustomerProfile, listCustomerSummaries } from "@/lib/dal/crm";

export default async function CrmPage(props: PageProps<"/crm">) {
  const business = await getActiveBusiness();
  if (!business) redirect("/login");

  // Guarded here as well as in the sidebar, so the route stays locked when it
  // is reached by URL.
  if (!business.modules.includes("crm")) {
    return <ModulePage moduleKey="crm" />;
  }

  // The open customer is part of the URL, so a booking or a car can link
  // straight to its owner's profile.
  const param = (await props.searchParams).customer;
  const openRef = typeof param === "string" ? param : null;
  const fleet = business.modules.includes("fleet");
  const today = new Date();

  const [customers, profile] = await Promise.all([
    listCustomerSummaries(),
    openRef ? getCustomerProfile(openRef, { withVehicles: fleet, today }) : Promise.resolve(null),
  ]);

  return (
    <CrmWorkspace
      customers={customers}
      profile={profile}
      fleetEnabled={fleet}
      smsEnabled={business.modules.includes("sms")}
      businessName={business.name}
      todayIso={today.toISOString()}
    />
  );
}
