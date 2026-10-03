import { redirect } from "next/navigation";
import { ModulePage } from "@/components/modules/module-page";
import { isAiConfigured } from "@/lib/ai/client";
import { QuotationsWorkspace } from "@/components/quotations/quotations-workspace";
import { getActiveBusiness } from "@/lib/dal/businesses";
import { listPriceItems, listQuotationSummaries, readQuotationSettings } from "@/lib/dal/quotations";

export default async function QuotationsPage(props: PageProps<"/quotations">) {
  const business = await getActiveBusiness();
  if (!business) redirect("/login");

  // Guarded here as well as in the sidebar, so the route stays locked when it
  // is reached by URL.
  if (!business.modules.includes("quotes")) {
    return <ModulePage moduleKey="quotes" />;
  }

  const tab = (await props.searchParams).tab === "prices" ? "prices" : "quotations";
  const [quotations, priceItems, settings] = await Promise.all([
    listQuotationSummaries(),
    listPriceItems(),
    readQuotationSettings(),
  ]);

  return (
    <QuotationsWorkspace
      quotations={quotations}
      priceItems={priceItems}
      settings={settings}
      tab={tab}
      businessName={business.name}
      aiConfigured={isAiConfigured()}
    />
  );
}
