import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MailWorkspace } from "@/components/mail/mail-workspace";
import { ModulePage } from "@/components/modules/module-page";
import { isAiConfigured } from "@/lib/ai/client";
import { isModuleEnabled } from "@/lib/businesses";
import { getActiveBusiness } from "@/lib/dal/businesses";
import { listMessages } from "@/lib/dal/mail";
import { mailboxAddress } from "@/lib/integrations";

export const metadata: Metadata = {
  title: "Mail · AEGIS AI",
  description:
    "AI prioritization, summaries and suggested replies over the company inbox.",
};

export default async function MailPage() {
  const business = await getActiveBusiness();
  if (!business) redirect("/login");
  if (!isModuleEnabled(business, "mail")) return <ModulePage moduleKey="mail" />;

  const messages = await listMessages();

  // Whether the install has a key at all, so Compose can offer to draft. Triage
  // runs in the automatic sync, never from rendering this page.
  return (
    <MailWorkspace
      messages={messages}
      aiEnabled={isAiConfigured()}
      mailbox={await mailboxAddress()}
    />
  );
}
