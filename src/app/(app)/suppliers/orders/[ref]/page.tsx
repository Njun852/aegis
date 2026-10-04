import { notFound } from "next/navigation";
import { ModulePage } from "@/components/modules/module-page";
import { OrderEditor } from "@/components/suppliers/order-editor";
import { findOrder } from "@/lib/dal/purchasing";
import { loadPurchasing } from "../../load-purchasing";

export default async function OrderPage(props: PageProps<"/suppliers/orders/[ref]">) {
  const { data } = await loadPurchasing();
  if (!data) return <ModulePage moduleKey="suppliers" />;
  const order = await findOrder(decodeURIComponent((await props.params).ref));
  if (!order) notFound();
  return <OrderEditor key={order.updatedAt} order={order} {...data} defaultSupplierRef={null} />;
}
