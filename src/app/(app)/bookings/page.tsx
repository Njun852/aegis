import { redirect } from "next/navigation";
import { BookingsWorkspace } from "@/components/bookings/bookings-workspace";
import { ModulePage } from "@/components/modules/module-page";
import { listBookings } from "@/lib/dal/bookings";
import { getActiveBusiness } from "@/lib/dal/businesses";
import { findDuplicates, listCustomers } from "@/lib/dal/customers";
import { findVehicleByPlate, listVehicleOptions } from "@/lib/dal/fleet";
import { dateKeyOf } from "@/lib/booking-calendar";
import type { Booking, RequestMatches } from "@/types";

/**
 * For each online request still waiting to be linked, the customer and car
 * already on file that its mobile and plate match. Staff decide; nothing is
 * linked here.
 */
async function matchRequests(
  bookings: Booking[],
  { crm, fleet }: { crm: boolean; fleet: boolean },
): Promise<Record<string, RequestMatches>> {
  const open = bookings.filter(
    (booking) => booking.request && (!booking.customerRef || !booking.vehicleRef),
  );
  const entries = await Promise.all(
    open.map(async (booking) => {
      const request = booking.request!;
      const [customers, vehicle] = await Promise.all([
        crm && !booking.customerRef
          ? findDuplicates({ phone: request.mobile, email: "" })
          : Promise.resolve([]),
        fleet && !booking.vehicleRef && request.vehicle.plate
          ? findVehicleByPlate(request.vehicle.plate)
          : Promise.resolve(null),
      ]);
      return [booking.ref, { customers, vehicle }] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export default async function BookingsPage() {
  const business = await getActiveBusiness();
  if (!business) redirect("/login");

  // A business without the module gets the locked explainer, so the route is
  // guarded even when it is reached by URL rather than the sidebar.
  if (!business.modules.includes("bookings")) {
    return <ModulePage moduleKey="bookings" />;
  }

  const [bookings, vehicles, customers] = await Promise.all([
    listBookings(),
    // Empty without Fleet, which hides the Vehicle field.
    business.modules.includes("fleet") ? listVehicleOptions() : Promise.resolve([]),
    // Null without CRM, which hides the customer picker and the link control.
    business.modules.includes("crm") ? listCustomers() : Promise.resolve(null),
  ]);

  const today = new Date();
  const requestMatches = await matchRequests(bookings, {
    crm: business.modules.includes("crm"),
    fleet: business.modules.includes("fleet"),
  });

  return (
    <BookingsWorkspace
      bookings={bookings}
      vehicles={vehicles}
      customers={customers}
      fleetEnabled={business.modules.includes("fleet")}
      requestMatches={requestMatches}
      businessName={business.name}
      todayIso={today.toISOString()}
      todayKey={dateKeyOf(today)}
    />
  );
}
