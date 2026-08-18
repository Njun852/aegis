import type { Metadata } from "next";
import { MailWorkspace } from "@/components/mail/mail-workspace";

export const metadata: Metadata = {
  title: "Mail · AEGIS AI",
  description:
    "Gmail-connected inbox with AI prioritization, summaries and suggested replies.",
};

export default function MailPage() {
  return <MailWorkspace />;
}
