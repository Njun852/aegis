import { notFound } from "next/navigation";
import { ModulePage } from "@/components/modules/module-page";
import { ReceiveForm } from "@/components/suppliers/receive-form";
import { findOrder } from "@/lib/dal/purchasing";
import { loadPurchasing } from "../load-purchasing";

export default async function ReceivePage(props: PageProps<"/suppliers/receive">) {
  const { data } = await loadPurchasing();
  if (!data) return <ModulePage moduleKey="suppliers" />;
  const po = (await props.searchParams).po;
  const order = typeof po === "string" ? await findOrder(po) : null;
  if (typeof po === "string" && !order) notFound();
  return <ReceiveForm order={order} {...data} />;
}
