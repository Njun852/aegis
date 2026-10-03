import { redirect } from "next/navigation";
import { ModulePage } from "@/components/modules/module-page";
import { TextBlastWorkspace } from "@/components/text-blast/text-blast-workspace";
import { getActiveBusiness } from "@/lib/dal/businesses";
import {
  countSentSince,
  listReminderRows,
  listSmsMessages,
  readTextBlastSettings,
} from "@/lib/dal/text-blast";
import { smsProviderName } from "@/lib/sms/provider";

export default async function TextBlastPage() {
  const business = await getActiveBusiness();
  if (!business) redirect("/login");

  // Guarded here as well as in the sidebar, so the route stays locked when it
  // is reached by URL.
  if (!business.modules.includes("sms")) {
    return <ModulePage moduleKey="sms" />;
  }

  const now = new Date();
  const [settings, rows, messages, sentLast30] = await Promise.all([
    readTextBlastSettings(business.id),
    listReminderRows(business.id, now),
    listSmsMessages(business.id),
    countSentSince(business.id, new Date(now.getTime() - 30 * 86_400_000)),
  ]);

  return (
    <TextBlastWorkspace
      businessName={business.name}
      settings={settings}
      rows={rows}
      messages={messages}
      sentLast30={sentLast30}
      providerName={smsProviderName()}
      todayIso={now.toISOString()}
    />
  );
}
