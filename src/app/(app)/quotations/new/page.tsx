import { redirect } from "next/navigation";
import { ModulePage } from "@/components/modules/module-page";
import { QuoteEditor, type QuoteEditorPrefill } from "@/components/quotations/quote-editor";
import { getBooking } from "@/lib/dal/bookings";
import { getActiveBusiness } from "@/lib/dal/businesses";
import { loadEditorData } from "../load-editor";

/** `/quotations/new?booking=BK-8241` starts the quotation for that booking, its customer and its car. */
export default async function NewQuotationPage(props: PageProps<"/quotations/new">) {
  const business = await getActiveBusiness();
  if (!business) redirect("/login");
  if (!business.modules.includes("quotes")) return <ModulePage moduleKey="quotes" />;

  const data = await loadEditorData(business);
  const requested = (await props.searchParams).booking;
  const booking =
    typeof requested === "string" && data.bookingsEnabled ? await getBooking(requested.slice(0, 20)) : null;

  let prefill: QuoteEditorPrefill | null = null;
  if (booking) {
    const customer = data.customers.find((entry) => entry.ref === booking.customerRef);
    const car = data.vehicles.find((entry) => entry.ref === booking.vehicleRef);
    prefill = {
      bookingRef: booking.ref,
      billTo: customer
        ? {
            customerRef: customer.ref,
            name: customer.name,
            company: customer.company,
            address: "",
            phone: customer.phone,
            email: customer.email,
          }
        : {
            customerRef: null,
            name: booking.customer,
            company: booking.company,
            address: "",
            phone: booking.phone || booking.request?.mobile || "",
            email: booking.email,
          },
      vehicleRef: car?.ref ?? null,
      plate: car?.plate ?? booking.request?.vehicle.plate ?? "",
      makeModel:
        car?.label ?? [booking.request?.vehicle.make, booking.request?.vehicle.model].filter(Boolean).join(" "),
    };
  }

  return (
    <QuoteEditor
      quotation={null}
      photo={null}
      revisions={[]}
      events={[]}
      {...data}
      defaults={{ ...data.defaults, prefill }}
    />
  );
}
