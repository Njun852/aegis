import { redirect } from "next/navigation";

/**
 * Fleet was folded into CRM on 11 Nov 2026: each customer's cars now live on
 * their CRM profile. Old links and bookmarks land there.
 */
export default function FleetPage() {
  redirect("/crm");
}
