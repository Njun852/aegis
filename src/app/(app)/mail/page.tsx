import type { Metadata } from "next";
import { MailWorkspace } from "@/components/mail/mail-workspace";
import { isAiConfigured } from "@/lib/ai/client";
import { listMessages } from "@/lib/dal/mail";
import { mailboxAddress } from "@/lib/integrations";

export const metadata: Metadata = {
  title: "Mail · AEGIS AI",
  description:
    "AI prioritization, summaries and suggested replies over the company inbox.",
};

export default async function MailPage() {
  const messages = await listMessages();

  // Whether the install has a key at all. The screen never calls the model on
  // its own; this only decides whether "Sync now" offers to analyse anything.
  return (
    <MailWorkspace
      messages={messages}
      aiEnabled={isAiConfigured()}
      mailbox={await mailboxAddress()}
    />
  );
}
