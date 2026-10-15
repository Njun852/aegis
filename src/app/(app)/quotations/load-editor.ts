import "server-only";

import { listBookings } from "@/lib/dal/bookings";
import { listCustomers } from "@/lib/dal/customers";
import { listVehicleOptions } from "@/lib/dal/fleet";
import { listCostSources } from "@/lib/dal/quote-costing";
import { isMailboxConfigured } from "@/lib/dal/mailbox";
import { listPriceItems, readQuotationSettings } from "@/lib/dal/quotations";
import { verifySession } from "@/lib/dal/session";
import { addDays, manilaDateKey } from "@/lib/quotations";
import type { Booking, Business, QuoteBookingOption } from "@/types";

/** How far back the booking picker reaches. Older work is rarely quoted, and a ref already linked is kept. */
const BOOKING_PICKER_DAYS = 120;

function toBookingOption(booking: Booking): QuoteBookingOption {
  return {
    ref: booking.ref,
    customer: booking.customer || booking.company || "No name",
    service: booking.service,
    day: booking.day,
    status: booking.status,
    customerRef: booking.customerRef,
    vehicleRef: booking.vehicleRef,
    email: booking.email,
    phone: booking.phone || booking.request?.mobile || "",
  };
}

/** Bookings worth quoting: not cancelled, recent or ahead, newest first. */
async function listBookingOptions(): Promise<QuoteBookingOption[]> {
  const since = Date.now() - BOOKING_PICKER_DAYS * 86_400_000;
  return (await listBookings())
    .filter((booking) => booking.status !== "Cancelled" && new Date(booking.startsAt).getTime() >= since)
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
    .map(toBookingOption);
}

/** What the editor needs besides the quotation itself, shared by the new and edit routes. */
export async function loadEditorData(business: Business) {
  const crmEnabled = business.modules.includes("crm");
  const fleetEnabled = business.modules.includes("fleet");
  const bookingsEnabled = business.modules.includes("bookings");
  const [settings, priceItems, customers, vehicles, bookings, mailConnected, costSources, session] = await Promise.all([
    readQuotationSettings(),
    listPriceItems(),
    crmEnabled ? listCustomers() : Promise.resolve([]),
    fleetEnabled ? listVehicleOptions() : Promise.resolve([]),
    bookingsEnabled ? listBookingOptions() : Promise.resolve([]),
    isMailboxConfigured(),
    listCostSources(business),
    verifySession(),
  ]);
  const quoteDate = manilaDateKey(new Date());
  return {
    settings,
    priceItems,
    costSources,
    customers,
    vehicles,
    bookings,
    bookingsEnabled,
    crmEnabled,
    fleetEnabled,
    mailConnected,
    businessName: business.name,
    isAdmin: session.role === "aegis_admin",
    defaults: { quoteDate, validUntil: addDays(quoteDate, settings.validDays), notes: settings.notes },
  };
}
