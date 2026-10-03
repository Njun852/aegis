import { notFound, redirect } from "next/navigation";
import { ModulePage } from "@/components/modules/module-page";
import { QuoteEditor } from "@/components/quotations/quote-editor";
import { getActiveBusiness } from "@/lib/dal/businesses";
import { findPhotoView, findQuotation } from "@/lib/dal/quotations";
import { loadEditorData } from "../load-editor";

export default async function QuotationPage(props: PageProps<"/quotations/[ref]">) {
  const business = await getActiveBusiness();
  if (!business) redirect("/login");
  if (!business.modules.includes("quotes")) return <ModulePage moduleKey="quotes" />;

  const { ref } = await props.params;
  const [quotation, data] = await Promise.all([findQuotation(decodeURIComponent(ref)), loadEditorData(business)]);
  if (!quotation) notFound();
  const photo = quotation.photoRef ? await findPhotoView(quotation.photoRef) : null;

  return <QuoteEditor key={quotation.ref} quotation={quotation} photo={photo} {...data} />;
}
