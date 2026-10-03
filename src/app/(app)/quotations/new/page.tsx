import { redirect } from "next/navigation";
import { ModulePage } from "@/components/modules/module-page";
import { QuoteEditor } from "@/components/quotations/quote-editor";
import { getActiveBusiness } from "@/lib/dal/businesses";
import { loadEditorData } from "../load-editor";

export default async function NewQuotationPage() {
  const business = await getActiveBusiness();
  if (!business) redirect("/login");
  if (!business.modules.includes("quotes")) return <ModulePage moduleKey="quotes" />;

  const data = await loadEditorData(business);
  return <QuoteEditor quotation={null} photo={null} {...data} />;
}
