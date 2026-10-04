import "server-only";

import { listCustomers } from "@/lib/dal/customers";
import { listVehicleOptions } from "@/lib/dal/fleet";
import { listCostSources } from "@/lib/dal/quote-costing";
import { isMailboxConfigured } from "@/lib/dal/mailbox";
import { listPriceItems, readQuotationSettings } from "@/lib/dal/quotations";
import { manilaDateKey } from "@/lib/quotations";
import type { Business } from "@/types";

/** What the editor needs besides the quotation itself, shared by the new and edit routes. */
export async function loadEditorData(business: Business) {
  const crmEnabled = business.modules.includes("crm");
  const fleetEnabled = business.modules.includes("fleet");
  const [settings, priceItems, customers, vehicles, mailConnected, costSources] = await Promise.all([
    readQuotationSettings(),
    listPriceItems(),
    crmEnabled ? listCustomers() : Promise.resolve([]),
    fleetEnabled ? listVehicleOptions() : Promise.resolve([]),
    isMailboxConfigured(),
    listCostSources(business),
  ]);
  return {
    settings,
    priceItems,
    costSources,
    customers,
    vehicles,
    crmEnabled,
    fleetEnabled,
    mailConnected,
    businessName: business.name,
    defaults: { quoteDate: manilaDateKey(new Date()), notes: settings.notes },
  };
}
