import { redirect } from "next/navigation";
import { ModulePage } from "@/components/modules/module-page";
import { QuotationsWorkspace, type QuotationsTab } from "@/components/quotations/quotations-workspace";
import { getActiveBusiness } from "@/lib/dal/businesses";
import { listJobOrderSummaries, listPriceItemUses } from "@/lib/dal/job-orders";
import { listPriceItems, listQuotationSummaries, listScans, readQuotationSettings } from "@/lib/dal/quotations";

const TABS: QuotationsTab[] = ["quotations", "jobs", "scans", "prices"];

export default async function QuotationsPage(props: PageProps<"/quotations">) {
  const business = await getActiveBusiness();
  if (!business) redirect("/login");

  // Guarded here as well as in the sidebar, so the route stays locked when it
  // is reached by URL.
  if (!business.modules.includes("quotes")) {
    return <ModulePage moduleKey="quotes" />;
  }

  const requested = (await props.searchParams).tab;
  // The price list lives on the Suppliers screen beside the supplier costs
  // (25 Nov 2026); Quotations keeps it only for a business without Suppliers.
  const priceListOnSuppliers = business.modules.includes("suppliers");
  if (requested === "prices" && priceListOnSuppliers) redirect("/suppliers?tab=prices");
  const tab = TABS.find((entry) => entry === requested) ?? "quotations";
  const [quotations, jobOrders, priceItems, settings, scans, priceUses] = await Promise.all([
    listQuotationSummaries(),
    listJobOrderSummaries(),
    listPriceItems(),
    readQuotationSettings(),
    // The history reads every scan's trail, so only when it is looked at.
    tab === "scans" ? listScans() : Promise.resolve([]),
    // Where each price list line was used: only for the Price list tab.
    tab === "prices" ? listPriceItemUses() : Promise.resolve({}),
  ]);

  return (
    <QuotationsWorkspace
      quotations={quotations}
      jobOrders={jobOrders}
      priceItems={priceItems}
      scans={scans}
      priceUses={priceUses}
      settings={settings}
      tab={tab}
      businessName={business.name}
      showPriceList={!priceListOnSuppliers}
    />
  );
}
