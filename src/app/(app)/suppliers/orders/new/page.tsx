import { ModulePage } from "@/components/modules/module-page";
import { OrderEditor } from "@/components/suppliers/order-editor";
import { loadPurchasing } from "../../load-purchasing";

export default async function NewOrderPage(props: PageProps<"/suppliers/orders/new">) {
  const { data } = await loadPurchasing();
  if (!data) return <ModulePage moduleKey="suppliers" />;
  const supplier = (await props.searchParams).supplier;
  return (
    <OrderEditor
      order={null}
      {...data}
      suppliers={data.suppliers.filter((entry) => entry.active)}
      defaultSupplierRef={typeof supplier === "string" ? supplier : null}
    />
  );
}
