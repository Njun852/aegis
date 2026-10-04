import { notFound, redirect } from "next/navigation";
import { ModulePage } from "@/components/modules/module-page";
import { ReceiptView } from "@/components/suppliers/receipt-view";
import { getActiveBusiness } from "@/lib/dal/businesses";
import { findReceipt } from "@/lib/dal/purchasing";

export default async function ReceiptPage(props: PageProps<"/suppliers/receipts/[ref]">) {
  const business = await getActiveBusiness();
  if (!business) redirect("/login");
  if (!business.modules.includes("suppliers")) return <ModulePage moduleKey="suppliers" />;
  const receipt = await findReceipt(decodeURIComponent((await props.params).ref));
  if (!receipt) notFound();
  return <ReceiptView receipt={receipt} />;
}
