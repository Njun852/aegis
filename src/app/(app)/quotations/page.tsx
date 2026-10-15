import { redirect } from "next/navigation";
import { ModulePage } from "@/components/modules/module-page";
import { isAiConfigured } from "@/lib/ai/client";
import { QuotationsWorkspace, type QuotationsTab } from "@/components/quotations/quotations-workspace";
import { getActiveBusiness } from "@/lib/dal/businesses";
import { listJobOrderSummaries } from "@/lib/dal/job-orders";
import { listPriceItems, listQuotationSummaries, readQuotationSettings } from "@/lib/dal/quotations";

const TABS: QuotationsTab[] = ["quotations", "jobs", "prices"];

export default async function QuotationsPage(props: PageProps<"/quotations">) {
  const business = await getActiveBusiness();
  if (!business) redirect("/login");

  // Guarded here as well as in the sidebar, so the route stays locked when it
  // is reached by URL.
  if (!business.modules.includes("quotes")) {
    return <ModulePage moduleKey="quotes" />;
  }

  const requested = (await props.searchParams).tab;
  const tab = TABS.find((entry) => entry === requested) ?? "quotations";
  const [quotations, jobOrders, priceItems, settings] = await Promise.all([
    listQuotationSummaries(),
    listJobOrderSummaries(),
    listPriceItems(),
    readQuotationSettings(),
  ]);

  return (
    <QuotationsWorkspace
      quotations={quotations}
      jobOrders={jobOrders}
      priceItems={priceItems}
      settings={settings}
      tab={tab}
      businessName={business.name}
      aiConfigured={isAiConfigured()}
    />
  );
}
