import { notFound } from "next/navigation";
import { BusinessDetail } from "@/components/admin/business-detail";
import { MailboxPanel } from "@/components/admin/mailbox-panel";
import { MetaAdsPanel } from "@/components/admin/meta-ads-panel";
import { readMetaAdsStatus } from "@/lib/dal/ad-account";
import { getBusinessForUser } from "@/lib/dal/businesses";
import { readMailboxStatus } from "@/lib/dal/mailbox";
import { requireAdmin } from "@/lib/dal/session";

export default async function Page(props: PageProps<"/admin/businesses/[id]">) {
  await requireAdmin();

  const { id } = await props.params;
  // Confirms the business exists and is one this account may administer,
  // rather than leaving the client to discover an empty record.
  const business = await getBusinessForUser(id);
  if (!business) {
    notFound();
  }

  // Read on the server: `readMailboxStatus` is shaped so it cannot carry the
  // stored password, which is why the panel can be a client component at all.
  // Both shaped so they cannot carry a stored secret.
  const [mailbox, metaAds] = await Promise.all([
    readMailboxStatus(id),
    readMetaAdsStatus(id),
  ]);

  return (
    // One column for the whole page, so the mailbox panel is the same width as
    // the panels above it and the group sits centred in the shell. The width
    // used to be set on BusinessDetail itself, which left anything added
    // alongside it running the full width of the screen.
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-3.5">
      <BusinessDetail businessId={id} />
      <MailboxPanel
        businessId={id}
        businessName={business.name}
        status={mailbox}
      />
      <MetaAdsPanel
        businessId={id}
        businessName={business.name}
        status={metaAds}
      />
    </div>
  );
}
