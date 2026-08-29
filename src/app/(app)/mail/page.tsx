import type { Metadata } from "next";
import { MailWorkspace } from "@/components/mail/mail-workspace";
import { isAiConfigured } from "@/lib/ai/client";
import { listMessages } from "@/lib/dal/mail";

export const metadata: Metadata = {
  title: "Mail · AEGIS AI",
  description:
    "Gmail-connected inbox with AI prioritization, summaries and suggested replies.",
};

export default async function MailPage() {
  const messages = await listMessages();

  // Whether the install has a key at all. The screen never calls the model on
  // its own; this only decides whether "Sync now" offers to analyse anything.
  return <MailWorkspace messages={messages} aiEnabled={isAiConfigured()} />;
}
