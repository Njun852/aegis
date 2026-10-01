import "server-only";

import { monthlyBookedValue } from "@/lib/crm";
import { formatDate } from "@/lib/fleet";
import { listBookingsForCustomer, totalBookingsByCustomer } from "./bookings";
import { findCustomer, listCustomerDocuments, toCustomer } from "./customers";
import { countVehiclesByCustomer, listVehiclesForCustomer } from "./fleet";
import { listMessagesFromAddress } from "./mail";
import type { CustomerProfile, CustomerSummary } from "@/types";

/**
 * CRM's reads, assembled from the modules that own each piece: customers,
 * bookings, vehicles and mail. Kept apart from `./customers.ts` so the
 * collection owner does not import Fleet, which imports it.
 */

/** Every customer with what their linked bookings add up to. */
export async function listCustomerSummaries(): Promise<CustomerSummary[]> {
  const [docs, totals, vehicleCounts] = await Promise.all([
    listCustomerDocuments(),
    totalBookingsByCustomer(),
    countVehiclesByCustomer(),
  ]);

  return docs.map((doc) => {
    const total = totals.get(doc.ref);
    return {
      ...toCustomer(doc),
      vehicleCount: vehicleCounts.get(doc.ref) ?? 0,
      bookingCount: total?.bookingCount ?? 0,
      bookedValueCents: total?.bookedValueCents ?? 0,
      lastActivityAt: total?.lastActivityAt ? total.lastActivityAt.toISOString() : null,
      lastVisitDay: total?.lastVisitAt ? formatDate(total.lastVisitAt) : null,
      createdAt: doc.createdAt.toISOString(),
    };
  });
}

/**
 * One customer's profile. Emails are matched on the address alone and shown
 * as "from this address"; they are what Mail already stored, and nothing here
 * calls the model.
 */
export async function getCustomerProfile(
  ref: string,
  { withVehicles, today = new Date() }: { withVehicles: boolean; today?: Date },
): Promise<CustomerProfile | null> {
  const customer = await findCustomer(ref);
  if (!customer) return null;

  const [bookings, vehicles, messages] = await Promise.all([
    listBookingsForCustomer(ref),
    withVehicles ? listVehiclesForCustomer(ref, today) : Promise.resolve([]),
    listMessagesFromAddress(customer.email, 10),
  ]);

  return {
    customer,
    bookings,
    vehicles,
    emails: messages.map((message) => ({
      id: message.id,
      subject: message.subject,
      date: message.date,
      priority: message.priority,
      unread: message.unread,
    })),
    months: monthlyBookedValue(bookings, today),
  };
}
